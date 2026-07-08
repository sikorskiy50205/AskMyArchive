namespace AskMyArchive.Infrastructure.Options;

/// <summary>Any OpenAI-compatible chat endpoint: DeepSeek, OpenAI, Ollama, LM Studio…</summary>
public sealed class ChatOptions
{
    public const string Section = "Llm:Chat";

    public string BaseUrl { get; set; } = "https://api.deepseek.com/v1";
    public string ApiKey { get; set; } = string.Empty;
    public string Model { get; set; } = "deepseek-chat";
}

/// <summary>
/// Any OpenAI-compatible embeddings endpoint.
/// Dimensions must match the pgvector column, so changing the model means re-indexing.
/// </summary>
public sealed class EmbeddingOptions
{
    public const string Section = "Llm:Embeddings";

    public string BaseUrl { get; set; } = "http://localhost:11434/v1";
    public string ApiKey { get; set; } = string.Empty;
    public string Model { get; set; } = "nomic-embed-text";
    public int Dimensions { get; set; } = 768;
}
