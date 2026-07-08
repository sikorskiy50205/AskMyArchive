namespace AskMyArchive.Core.Llm;

public record LlmMessage(string Role, string Content);

public interface IChatClient
{
    IAsyncEnumerable<string> StreamAsync(IReadOnlyList<LlmMessage> messages, CancellationToken ct = default);
}
