using AskMyArchive.Core.Search;
using Microsoft.EntityFrameworkCore;
using Pgvector;

namespace AskMyArchive.Infrastructure.Persistence;

public sealed class PgVectorChunkSearcher(AppDbContext db) : IChunkSearcher
{
    // Take the closest N chunks *per document* before ranking globally, so a large document
    // can't crowd every slot with its own chunks. EF Core's GroupBy().SelectMany() doesn't
    // translate reliably when a pgvector operator is inside, so this uses raw SQL.
    private const int MaxChunksPerDocument = 2;

    public async Task<IReadOnlyList<ChunkHit>> SearchAsync(
        Guid userId, float[] queryEmbedding, int topK, CancellationToken ct = default)
    {
        var query = new Vector(queryEmbedding);

        var rows = await db.Database
            .SqlQuery<SearchRow>($"""
                SELECT r."DocumentId", r."FileName", r."Page", r."Text", r."Distance"
                FROM (
                    SELECT
                        c."DocumentId",
                        d."FileName",
                        c."Page",
                        c."Text",
                        c."Embedding" <=> {query} AS "Distance",
                        ROW_NUMBER() OVER (PARTITION BY c."DocumentId" ORDER BY c."Embedding" <=> {query}) AS rn
                    FROM "Chunks" c
                    JOIN "Documents" d ON d."Id" = c."DocumentId"
                    WHERE d."UserId" = {userId} AND c."Embedding" IS NOT NULL
                ) r
                WHERE r.rn <= {MaxChunksPerDocument}
                ORDER BY r."Distance"
                LIMIT {topK}
                """)
            .ToListAsync(ct);

        return rows
            .Select(r => new ChunkHit(r.DocumentId, r.FileName, r.Page, r.Text, r.Distance))
            .ToList();
    }

    private sealed record SearchRow(Guid DocumentId, string FileName, int? Page, string Text, double Distance);
}
