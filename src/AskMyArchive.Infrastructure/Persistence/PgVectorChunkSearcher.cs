using AskMyArchive.Core.Search;
using Microsoft.EntityFrameworkCore;
using Pgvector;
using Pgvector.EntityFrameworkCore;

namespace AskMyArchive.Infrastructure.Persistence;

public sealed class PgVectorChunkSearcher(AppDbContext db) : IChunkSearcher
{
    public async Task<IReadOnlyList<ChunkHit>> SearchAsync(
        Guid userId, float[] queryEmbedding, int topK, CancellationToken ct = default)
    {
        var query = new Vector(queryEmbedding);

        return await db.Chunks
            .Where(c => c.Embedding != null && c.Document!.UserId == userId)
            .OrderBy(c => c.Embedding!.CosineDistance(query))
            .Take(topK)
            .Select(c => new ChunkHit(
                c.DocumentId,
                c.Document!.FileName,
                c.Page,
                c.Text,
                c.Embedding!.CosineDistance(query)))
            .ToListAsync(ct);
    }
}
