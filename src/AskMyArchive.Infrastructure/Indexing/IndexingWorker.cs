using AskMyArchive.Core.Chunking;
using AskMyArchive.Core.Entities;
using AskMyArchive.Core.Indexing;
using AskMyArchive.Core.Llm;
using AskMyArchive.Core.Parsing;
using AskMyArchive.Core.Storage;
using AskMyArchive.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Pgvector;

namespace AskMyArchive.Infrastructure.Indexing;

/// <summary>
/// Background pipeline: parse → chunk → embed → store.
/// A failure marks the document as Failed instead of crashing the worker.
/// </summary>
public sealed class IndexingWorker(
    IIndexingQueue queue,
    IServiceScopeFactory scopeFactory,
    IEnumerable<IDocumentParser> parsers,
    ITextChunker chunker,
    IFileStorage storage,
    ILogger<IndexingWorker> logger) : BackgroundService
{
    private const int EmbeddingBatchSize = 32;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await RequeuePendingAsync(stoppingToken);

        await foreach (var documentId in queue.DequeueAllAsync(stoppingToken))
        {
            try
            {
                await IndexAsync(documentId, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Indexing failed for document {DocumentId}", documentId);
                await MarkFailedAsync(documentId, ex.Message, stoppingToken);
            }
        }
    }

    // The queue lives in memory, so on startup re-enqueue documents that never finished.
    private async Task RequeuePendingAsync(CancellationToken ct)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var pending = await db.Documents
                .Where(d => d.Status == DocumentStatus.Uploaded || d.Status == DocumentStatus.Indexing)
                .Select(d => d.Id)
                .ToListAsync(ct);
            foreach (var id in pending)
                await queue.EnqueueAsync(id, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Could not requeue pending documents on startup");
        }
    }

    private async Task IndexAsync(Guid documentId, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var embeddings = scope.ServiceProvider.GetRequiredService<IEmbeddingClient>();

        var document = await db.Documents.FirstOrDefaultAsync(d => d.Id == documentId, ct);
        if (document is null)
            return;

        document.Status = DocumentStatus.Indexing;
        await db.SaveChangesAsync(ct);

        var extension = Path.GetExtension(document.FileName).ToLowerInvariant();
        var parser = parsers.FirstOrDefault(p => p.SupportedExtensions.Contains(extension))
            ?? throw new NotSupportedException($"No parser registered for '{extension}' files.");

        ParsedDocument parsed;
        using (var content = storage.OpenRead(document.StoragePath))
            parsed = parser.Parse(content);

        var chunks = chunker.Split(parsed);

        var entities = new List<DocumentChunk>(chunks.Count);
        foreach (var batch in chunks.Chunk(EmbeddingBatchSize))
        {
            var vectors = await embeddings.EmbedAsync(batch.Select(c => c.Text).ToList(), ct);
            entities.AddRange(batch.Select((chunk, i) => new DocumentChunk
            {
                Id = Guid.NewGuid(),
                DocumentId = document.Id,
                Index = chunk.Index,
                Page = chunk.Page,
                Text = chunk.Text,
                Embedding = new Vector(vectors[i])
            }));
        }

        db.Chunks.AddRange(entities);
        document.PageCount = parsed.Pages.Count;
        document.Status = DocumentStatus.Indexed;
        document.Error = null;
        await db.SaveChangesAsync(ct);

        logger.LogInformation("Indexed {FileName}: {ChunkCount} chunks from {PageCount} pages",
            document.FileName, entities.Count, parsed.Pages.Count);
    }

    private async Task MarkFailedAsync(Guid documentId, string error, CancellationToken ct)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Documents
                .Where(d => d.Id == documentId)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(d => d.Status, DocumentStatus.Failed)
                    .SetProperty(d => d.Error, error), ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Could not mark document {DocumentId} as failed", documentId);
        }
    }
}
