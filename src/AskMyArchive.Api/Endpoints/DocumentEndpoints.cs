using System.Security.Claims;
using AskMyArchive.Api.Auth;
using AskMyArchive.Core.Entities;
using AskMyArchive.Core.Indexing;
using AskMyArchive.Core.Storage;
using AskMyArchive.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AskMyArchive.Api.Endpoints;

public record DocumentDto(
    Guid Id, string FileName, long SizeBytes, string Status, string? Error, int PageCount, DateTimeOffset UploadedAt);

public record DeleteBatchRequest(List<Guid> Ids);
public record StorageDto(long UsedBytes, long LimitBytes);

public static class DocumentEndpoints
{
    private static readonly string[] AllowedExtensions = [".pdf", ".docx", ".xlsx", ".txt", ".md"];
    private const long MaxFileSizeBytes = 50 * 1024 * 1024;
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
        group.MapDelete("/{id:guid}", DeleteAsync);
    }

    private static readonly Dictionary<string, string> ContentTypeByExtension = new(StringComparer.OrdinalIgnoreCase)
    {
        [".pdf"] = "application/pdf",
        [".docx"] = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        [".xlsx"] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        [".txt"] = "text/plain; charset=utf-8",
        [".md"] = "text/markdown; charset=utf-8",
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

        db.Documents.Add(document);
        await db.SaveChangesAsync(ct);
        await queue.EnqueueAsync(document.Id, ct);

        return Results.Accepted($"/api/documents/{document.Id}", ToDto(document));
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
