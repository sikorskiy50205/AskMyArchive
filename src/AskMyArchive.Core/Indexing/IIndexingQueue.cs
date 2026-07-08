namespace AskMyArchive.Core.Indexing;

public interface IIndexingQueue
{
    ValueTask EnqueueAsync(Guid documentId, CancellationToken ct = default);
    IAsyncEnumerable<Guid> DequeueAllAsync(CancellationToken ct = default);
}
