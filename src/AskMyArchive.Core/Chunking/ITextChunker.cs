using AskMyArchive.Core.Parsing;

namespace AskMyArchive.Core.Chunking;

public record TextChunk(int Index, int? Page, string Text);

public interface ITextChunker
{
    IReadOnlyList<TextChunk> Split(ParsedDocument document);
}
