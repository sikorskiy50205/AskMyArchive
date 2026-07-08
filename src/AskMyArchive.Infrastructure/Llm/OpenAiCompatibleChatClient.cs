using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text.Json;
using AskMyArchive.Core.Llm;
using AskMyArchive.Infrastructure.Options;
using Microsoft.Extensions.Options;

namespace AskMyArchive.Infrastructure.Llm;

/// <summary>
/// Streaming chat client for any OpenAI-compatible /chat/completions endpoint
/// (DeepSeek, OpenAI, Ollama, LM Studio…).
/// </summary>
public sealed class OpenAiCompatibleChatClient(HttpClient http, IOptions<ChatOptions> options) : IChatClient
{
    public async IAsyncEnumerable<string> StreamAsync(
        IReadOnlyList<LlmMessage> messages,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        var cfg = options.Value;
        if (string.IsNullOrWhiteSpace(cfg.ApiKey))
            throw new InvalidOperationException("Llm:Chat:ApiKey is not configured.");

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{cfg.BaseUrl.TrimEnd('/')}/chat/completions");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", cfg.ApiKey);
        request.Content = JsonContent.Create(new
        {
            model = cfg.Model,
            stream = true,
            messages = messages.Select(m => new { role = m.Role, content = m.Content })
        });

        using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        response.EnsureSuccessStatusCode();

        using var reader = new StreamReader(await response.Content.ReadAsStreamAsync(ct));
        while (await reader.ReadLineAsync(ct) is { } line)
        {
            if (!line.StartsWith("data: ", StringComparison.Ordinal))
                continue;

            var payload = line["data: ".Length..].Trim();
            if (payload == "[DONE]")
                yield break;

            var delta = ExtractDelta(payload);
            if (!string.IsNullOrEmpty(delta))
                yield return delta;
        }
    }

    private static string? ExtractDelta(string json)
    {
        using var doc = JsonDocument.Parse(json);
        if (doc.RootElement.TryGetProperty("choices", out var choices)
            && choices.GetArrayLength() > 0
            && choices[0].TryGetProperty("delta", out var delta)
            && delta.TryGetProperty("content", out var content))
            return content.GetString();
        return null;
    }
}
