namespace AskMyArchive.Core.Search;

public record ChunkHit(Guid DocumentId, string FileName, int? Page, string Text, double Distance);

public interface IChunkSearcher
{
    Task<IReadOnlyList<ChunkHit>> SearchAsync(Guid userId, float[] queryEmbedding, int topK, CancellationToken ct = default);
}
