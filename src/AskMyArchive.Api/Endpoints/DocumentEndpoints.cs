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

public static class DocumentEndpoints
{
    private static readonly string[] AllowedExtensions = [".pdf", ".docx", ".txt", ".md"];
    private const long MaxFileSizeBytes = 50 * 1024 * 1024;

    public static void MapDocumentEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/documents").WithTags("Documents").RequireAuthorization();

        group.MapPost("/", UploadAsync).DisableAntiforgery();
        group.MapGet("/", ListAsync);
        group.MapGet("/{id:guid}", GetAsync);
        group.MapDelete("/{id:guid}", DeleteAsync);
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
