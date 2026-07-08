using AskMyArchive.Core.Llm;
using AskMyArchive.Core.Rag;
using AskMyArchive.Core.Search;

namespace AskMyArchive.UnitTests;

public class RagPromptTests
{
    [Fact]
    public void Prompt_contains_context_history_and_question_in_order()
    {
        var hits = new List<ChunkHit>
        {
            new(Guid.NewGuid(), "contract.pdf", 3, "The warranty lasts 24 months.", 0.12)
        };
        var history = new List<LlmMessage> { new("user", "Hi"), new("assistant", "Hello!") };

        var messages = RagService.BuildMessages("How long is the warranty?", history, hits);

        Assert.Equal(4, messages.Count);
        Assert.Equal(new[] { "system", "user", "assistant", "user" }, messages.Select(m => m.Role).ToArray());
        Assert.Contains("contract.pdf", messages[0].Content);
        Assert.Contains("The warranty lasts 24 months.", messages[0].Content);
        Assert.Equal("How long is the warranty?", messages[^1].Content);
    }

    [Fact]
    public void Prompt_without_hits_still_has_system_and_question()
    {
        var messages = RagService.BuildMessages("Anything there?", [], []);

        Assert.Equal(2, messages.Count);
        Assert.Equal("system", messages[0].Role);
        Assert.Equal("Anything there?", messages[1].Content);
    }
}
