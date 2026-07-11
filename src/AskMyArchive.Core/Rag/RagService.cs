using System.Text;
using AskMyArchive.Core.Llm;
using AskMyArchive.Core.Search;

namespace AskMyArchive.Core.Rag;

public sealed record RagAnswer(IReadOnlyList<ChunkHit> Sources, IAsyncEnumerable<string> Tokens);

/// <summary>
/// Retrieval-augmented generation: embed the question, find the nearest chunks
/// in the user's archive and stream an answer grounded in them.
/// </summary>
public sealed class RagService(IEmbeddingClient embeddings, IChatClient chat, IChunkSearcher searcher)
{
    public const int DefaultTopK = 8;

    public async Task<RagAnswer> AskAsync(
        Guid userId,
        string question,
        IReadOnlyList<LlmMessage> history,
        int topK = DefaultTopK,
        CancellationToken ct = default)
    {
        var queryEmbedding = await embeddings.EmbedAsync(question, ct);
        var hits = await searcher.SearchAsync(userId, queryEmbedding, topK, ct);
        var messages = BuildMessages(question, history, hits);
        return new RagAnswer(hits, chat.StreamAsync(messages, ct));
    }

    public static IReadOnlyList<LlmMessage> BuildMessages(
        string question,
        IReadOnlyList<LlmMessage> history,
        IReadOnlyList<ChunkHit> hits)
    {
        var system = new StringBuilder();
        system.AppendLine("You are an assistant that answers questions using only the user's personal document archive.");
        system.AppendLine("Answer in the language of the question.");
        system.AppendLine("If the context below does not contain the answer, say so honestly instead of guessing.");
        system.AppendLine("After every fact taken from a document, cite it as [file name, p. N].");
        system.AppendLine();
        system.AppendLine("Context from the archive:");
        foreach (var hit in hits)
        {
            system.AppendLine($"--- {hit.FileName}{(hit.Page is { } page ? $", p. {page}" : string.Empty)} ---");
            system.AppendLine(hit.Text);
        }

        List<LlmMessage> messages = [new("system", system.ToString())];
        messages.AddRange(history);
        messages.Add(new("user", question));
        return messages;
    }
}
