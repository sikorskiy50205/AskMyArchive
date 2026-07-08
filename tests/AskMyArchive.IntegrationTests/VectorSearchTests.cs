using AskMyArchive.Core.Entities;
using AskMyArchive.Infrastructure.Options;
using AskMyArchive.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Pgvector;
using Pgvector.EntityFrameworkCore;
using Testcontainers.PostgreSql;

namespace AskMyArchive.IntegrationTests;

public class VectorSearchTests
{
    [SkippableFact]
    public async Task Cosine_search_returns_nearest_chunk_of_the_right_user()
    {
        Skip.IfNot(Environment.GetEnvironmentVariable("RUN_INTEGRATION_TESTS") == "1",
            "Set RUN_INTEGRATION_TESTS=1 to run tests that need Docker.");

        await using var postgres = new PostgreSqlBuilder("pgvector/pgvector:pg17").Build();
        await postgres.StartAsync();

        var contextOptions = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(postgres.GetConnectionString(), o => o.UseVector())
            .Options;
        var embeddingOptions = Microsoft.Extensions.Options.Options.Create(new EmbeddingOptions { Dimensions = 3 });

        var userId = Guid.NewGuid();
        var strangerId = Guid.NewGuid();

        await using (var db = new AppDbContext(contextOptions, embeddingOptions))
        {
            await db.Database.EnsureCreatedAsync();
            db.Documents.AddRange(
                MakeDocument(userId, "near.txt", [0.9f, 0.1f, 0f]),
                MakeDocument(userId, "far.txt", [0f, 1f, 0f]),
                MakeDocument(strangerId, "stranger.txt", [1f, 0f, 0f]));
            await db.SaveChangesAsync();
        }

        await using (var db = new AppDbContext(contextOptions, embeddingOptions))
        {
            var searcher = new PgVectorChunkSearcher(db);

            var hits = await searcher.SearchAsync(userId, [1f, 0f, 0f], topK: 1);

            var hit = Assert.Single(hits);
            Assert.Equal("near.txt", hit.FileName); // nearest vector, and the stranger's document is invisible
        }
    }

    private static ArchiveDocument MakeDocument(Guid userId, string fileName, float[] embedding) => new()
    {
        Id = Guid.NewGuid(),
        UserId = userId,
        FileName = fileName,
        ContentType = "text/plain",
        StoragePath = fileName,
        Status = DocumentStatus.Indexed,
        Chunks =
        [
            new DocumentChunk { Id = Guid.NewGuid(), Index = 0, Page = 1, Text = fileName, Embedding = new Vector(embedding) }
        ]
    };
}
