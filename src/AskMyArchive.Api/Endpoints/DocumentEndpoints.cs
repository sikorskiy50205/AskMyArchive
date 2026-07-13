using System.Security.Claims;
using AskMyArchive.Api.Auth;
using AskMyArchive.Core.Chunking;
using AskMyArchive.Core.Entities;
using AskMyArchive.Core.Indexing;
using AskMyArchive.Core.Llm;
using AskMyArchive.Core.Parsing;
using AskMyArchive.Core.Storage;
using AskMyArchive.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Pgvector;

namespace AskMyArchive.Api.Endpoints;

public record DocumentDto(
    Guid Id, string FileName, long SizeBytes, string Status, string? Error, int PageCount, DateTimeOffset UploadedAt);

public record DeleteBatchRequest(List<Guid> Ids);
public record StorageDto(long UsedBytes, long LimitBytes);
public record OcrTextRequest(string Text);

public static class DocumentEndpoints
{
    // Images bypass the parser pipeline: they land as AwaitingOcr, the browser runs Tesseract.js,
    // and the recognised text comes back via PUT /api/documents/{id}/ocr-text.
    private static readonly string[] ImageExtensions = [".png", ".jpg", ".jpeg", ".webp"];
    private static readonly string[] AllowedExtensions =
        [".pdf", ".docx", ".xlsx", ".txt", ".md", .. ImageExtensions];
    private const long MaxFileSizeBytes = 50 * 1024 * 1024;
    private const int MaxOcrTextChars = 500_000;
    // Per-user storage quota. Portfolio-scale; bump if we ever host multi-tenant.
    public const long StorageQuotaBytes = 100 * 1024 * 1024;

    public static void MapDocumentEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/documents").WithTags("Documents").RequireAuthorization();

        group.MapPost("/", UploadAsync).DisableAntiforgery();
        group.MapGet("/", ListAsync);
        group.MapGet("/storage", GetStorageAsync);
        group.MapPost("/delete-batch", DeleteBatchAsync);
        group.MapGet("/{id:guid}", GetAsync);
        group.MapGet("/{id:guid}/file", GetFileAsync);
        group.MapGet("/{id:guid}/text", GetTextAsync);
        group.MapPut("/{id:guid}/ocr-text", UpdateOcrTextAsync);
        group.MapDelete("/{id:guid}", DeleteAsync);
    }

    private static readonly Dictionary<string, string> ContentTypeByExtension = new(StringComparer.OrdinalIgnoreCase)
    {
        [".pdf"] = "application/pdf",
        [".docx"] = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        [".xlsx"] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        [".txt"] = "text/plain; charset=utf-8",
        [".md"] = "text/markdown; charset=utf-8",
        [".png"] = "image/png",
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg",
        [".webp"] = "image/webp",
    };

    /// <summary>Streams the original uploaded file. Used by the browser's built-in PDF viewer.</summary>
    private static async Task<IResult> GetFileAsync(
        Guid id, ClaimsPrincipal principal, AppDbContext db, IFileStorage storage, CancellationToken ct)
    {
        var userId = principal.GetUserId();
        var document = await db.Documents.FirstOrDefaultAsync(d => d.Id == id && d.UserId == userId, ct);
        if (document is null)
            return Results.NotFound();

        var extension = Path.GetExtension(document.FileName);
        var contentType = ContentTypeByExtension.GetValueOrDefault(extension, "application/octet-stream");
        // fileDownloadName omitted so the browser previews (Content-Disposition: inline) instead of downloading.
        return Results.Stream(storage.OpenRead(document.StoragePath), contentType);
    }

    /// <summary>Returns the extracted text (reassembled from indexed chunks) for formats we can't render raw in the browser.</summary>
    private static async Task<IResult> GetTextAsync(
        Guid id, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        var userId = principal.GetUserId();
        var document = await db.Documents.FirstOrDefaultAsync(d => d.Id == id && d.UserId == userId, ct);
        if (document is null)
            return Results.NotFound();

        var chunks = await db.Chunks
            .Where(c => c.DocumentId == id)
            .OrderBy(c => c.Index)
            .Select(c => c.Text)
            .ToListAsync(ct);
        return Results.Text(string.Join("\n\n", chunks), "text/plain; charset=utf-8");
    }

    private static async Task<IResult> UploadAsync(
        IFormFile file, ClaimsPrincipal principal, AppDbContext db,
        IFileStorage storage, IIndexingQueue queue, CancellationToken ct)
    {
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!AllowedExtensions.Contains(extension))
            return Results.BadRequest(new { error = $"Supported file types: {string.Join(", ", AllowedExtensions)}." });
        if (file.Length is 0 or > MaxFileSizeBytes)
            return Results.BadRequest(new { error = "File is empty or larger than 50 MB." });

        var userId = principal.GetUserId();

        // Reject uploads that would push the user over their per-account storage quota.
        var currentUsage = await db.Documents
            .Where(d => d.UserId == userId)
            .SumAsync(d => d.SizeBytes, ct);
        if (currentUsage + file.Length > StorageQuotaBytes)
            return Results.BadRequest(new { error = "Storage quota exceeded." });

        var document = new ArchiveDocument
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            FileName = Path.GetFileName(file.FileName),
            ContentType = file.ContentType,
            SizeBytes = file.Length,
            StoragePath = string.Empty
        };

        await using (var content = file.OpenReadStream())
            document.StoragePath = await storage.SaveAsync(userId, document.Id, extension, content, ct);

        // Images wait for the browser to do OCR; every other format goes straight into the queue.
        var isImage = ImageExtensions.Contains(extension);
        document.Status = isImage ? DocumentStatus.AwaitingOcr : DocumentStatus.Uploaded;

        db.Documents.Add(document);
        await db.SaveChangesAsync(ct);
        if (!isImage) await queue.EnqueueAsync(document.Id, ct);

        return Results.Accepted($"/api/documents/{document.Id}", ToDto(document));
    }

    /// <summary>Store OCR text produced by the browser for an image document, then chunk + embed + index it.</summary>
    private static async Task<IResult> UpdateOcrTextAsync(
        Guid id, OcrTextRequest request, ClaimsPrincipal principal,
        AppDbContext db, ITextChunker chunker, IEmbeddingClient embeddings, CancellationToken ct)
    {
        var userId = principal.GetUserId();
        var document = await db.Documents.FirstOrDefaultAsync(d => d.Id == id && d.UserId == userId, ct);
        if (document is null) return Results.NotFound();
        if (document.Status != DocumentStatus.AwaitingOcr)
            return Results.BadRequest(new { error = "This document is not awaiting OCR." });
        if (string.IsNullOrWhiteSpace(request.Text))
            return Results.BadRequest(new { error = "Recognized text is empty." });
        if (request.Text.Length > MaxOcrTextChars)
            return Results.BadRequest(new { error = $"Recognized text exceeds {MaxOcrTextChars} characters." });

        document.Status = DocumentStatus.Indexing;
        await db.SaveChangesAsync(ct);

        try
        {
            var parsed = new ParsedDocument([new ParsedPage(1, request.Text)]);
            var chunks = chunker.Split(parsed);

            const int embeddingBatchSize = 32;
            var entities = new List<DocumentChunk>(chunks.Count);
            foreach (var batch in chunks.Chunk(embeddingBatchSize))
            {
                var vectors = await embeddings.EmbedAsync(batch.Select(c => c.Text).ToList(), ct);
                entities.AddRange(batch.Select((c, i) => new DocumentChunk
                {
                    Id = Guid.NewGuid(),
                    DocumentId = document.Id,
                    Index = c.Index,
                    Page = c.Page,
                    Text = c.Text,
                    Embedding = new Vector(vectors[i])
                }));
            }

            db.Chunks.AddRange(entities);
            document.PageCount = parsed.Pages.Count;
            document.Status = DocumentStatus.Indexed;
            document.Error = null;
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        }
        catch (Exception ex)
        {
            document.Status = DocumentStatus.Failed;
            document.Error = ex.Message;
            await db.SaveChangesAsync(ct);
            return Results.Problem(ex.Message);
        }
    }

    private static async Task<IResult> ListAsync(ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        var userId = principal.GetUserId();
        var documents = await db.Documents
            .Where(d => d.UserId == userId)
            .OrderByDescending(d => d.UploadedAt)
            .ToListAsync(ct);
        return Results.Ok(documents.Select(ToDto));
    }

    private static async Task<IResult> GetStorageAsync(
        ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        var userId = principal.GetUserId();
        var used = await db.Documents
            .Where(d => d.UserId == userId)
            .SumAsync(d => d.SizeBytes, ct);
        return Results.Ok(new StorageDto(used, StorageQuotaBytes));
    }

    private static async Task<IResult> DeleteBatchAsync(
        DeleteBatchRequest request, ClaimsPrincipal principal,
        AppDbContext db, IFileStorage storage, CancellationToken ct)
    {
        if (request.Ids.Count == 0)
            return Results.Ok(new { deleted = 0 });

        var userId = principal.GetUserId();
        var documents = await db.Documents
            .Where(d => d.UserId == userId && request.Ids.Contains(d.Id))
            .ToListAsync(ct);

        db.Documents.RemoveRange(documents); // chunks cascade
        await db.SaveChangesAsync(ct);
        foreach (var doc in documents) storage.Delete(doc.StoragePath);

        return Results.Ok(new { deleted = documents.Count });
    }

    private static async Task<IResult> GetAsync(Guid id, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        var userId = principal.GetUserId();
        var document = await db.Documents.FirstOrDefaultAsync(d => d.Id == id && d.UserId == userId, ct);
        return document is null ? Results.NotFound() : Results.Ok(ToDto(document));
    }

    private static async Task<IResult> DeleteAsync(
        Guid id, ClaimsPrincipal principal, AppDbContext db, IFileStorage storage, CancellationToken ct)
    {
        var userId = principal.GetUserId();
        var document = await db.Documents.FirstOrDefaultAsync(d => d.Id == id && d.UserId == userId, ct);
        if (document is null)
            return Results.NotFound();

        db.Documents.Remove(document); // chunks are removed by cascade delete
        await db.SaveChangesAsync(ct);
        storage.Delete(document.StoragePath);

        return Results.NoContent();
    }

    private static DocumentDto ToDto(ArchiveDocument d) =>
        new(d.Id, d.FileName, d.SizeBytes, d.Status.ToString(), d.Error, d.PageCount, d.UploadedAt);
}
