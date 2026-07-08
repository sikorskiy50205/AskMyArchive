using System.Threading.Channels;
using AskMyArchive.Core.Indexing;

namespace AskMyArchive.Infrastructure.Indexing;

/// <summary>
/// In-process queue on System.Threading.Channels. Enough for a single instance;
/// the interface allows swapping in RabbitMQ when the worker moves to its own process.
/// </summary>
public sealed class ChannelIndexingQueue : IIndexingQueue
{
    private readonly Channel<Guid> _channel =
        Channel.CreateUnbounded<Guid>(new UnboundedChannelOptions { SingleReader = true });

    public ValueTask EnqueueAsync(Guid documentId, CancellationToken ct = default) =>
        _channel.Writer.WriteAsync(documentId, ct);

    public IAsyncEnumerable<Guid> DequeueAllAsync(CancellationToken ct = default) =>
        _channel.Reader.ReadAllAsync(ct);
}
