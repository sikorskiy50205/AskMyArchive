using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using AskMyArchive.Core.Llm;
using AskMyArchive.Infrastructure.Options;
using Microsoft.Extensions.Options;

namespace AskMyArchive.Infrastructure.Llm;

/// <summary>Embeddings client for any OpenAI-compatible /embeddings endpoint.</summary>
public sealed class OpenAiCompatibleEmbeddingClient(HttpClient http, IOptions<EmbeddingOptions> options)
    : IEmbeddingClient
{
    public async Task<float[]> EmbedAsync(string text, CancellationToken ct = default) =>
        (await EmbedAsync([text], ct))[0];

    public async Task<IReadOnlyList<float[]>> EmbedAsync(IReadOnlyList<string> texts, CancellationToken ct = default)
    {
        var cfg = options.Value;

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{cfg.BaseUrl.TrimEnd('/')}/embeddings");
        if (!string.IsNullOrWhiteSpace(cfg.ApiKey))
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", cfg.ApiKey);
        request.Content = JsonContent.Create(new { model = cfg.Model, input = texts });

        using var response = await http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStreamAsync(ct));
        return doc.RootElement.GetProperty("data").EnumerateArray()
            .OrderBy(item => item.GetProperty("index").GetInt32())
            .Select(item => item.GetProperty("embedding").EnumerateArray()
                .Select(v => v.GetSingle())
                .ToArray())
            .ToList();
    }
}
