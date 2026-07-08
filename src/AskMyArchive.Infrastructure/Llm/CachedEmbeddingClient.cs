using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using AskMyArchive.Core.Llm;
using AskMyArchive.Infrastructure.Options;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Options;

namespace AskMyArchive.Infrastructure.Llm;

/// <summary>
/// Decorator that caches single-text embeddings (user questions) in the distributed cache,
/// so repeated questions don't hit the embeddings API. Best-effort: if Redis is down,
/// the request still goes through.
/// </summary>
public sealed class CachedEmbeddingClient(
    OpenAiCompatibleEmbeddingClient inner,
    IDistributedCache cache,
    IOptions<EmbeddingOptions> options) : IEmbeddingClient
{
    public async Task<float[]> EmbedAsync(string text, CancellationToken ct = default)
    {
        var key = CacheKey(text);

        try
        {
            if (await cache.GetAsync(key, ct) is { } cached)
                return MemoryMarshal.Cast<byte, float>(cached).ToArray();
        }
        catch (Exception) { /* cache is best-effort */ }

        var embedding = await inner.EmbedAsync(text, ct);

        try
        {
            await cache.SetAsync(key, MemoryMarshal.AsBytes(embedding.AsSpan()).ToArray(),
                new DistributedCacheEntryOptions { SlidingExpiration = TimeSpan.FromDays(7) }, ct);
        }
        catch (Exception) { /* cache is best-effort */ }

        return embedding;
    }

    // Batch calls come from indexing where every text is unique, so caching would not help.
    public Task<IReadOnlyList<float[]>> EmbedAsync(IReadOnlyList<string> texts, CancellationToken ct = default) =>
        inner.EmbedAsync(texts, ct);

    private string CacheKey(string text)
    {
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{options.Value.Model}:{text}")));
        return $"emb:{hash}";
    }
}
