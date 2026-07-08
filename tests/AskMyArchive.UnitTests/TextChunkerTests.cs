using AskMyArchive.Core.Chunking;
using AskMyArchive.Core.Parsing;

namespace AskMyArchive.UnitTests;

public class TextChunkerTests
{
    private static ParsedDocument Doc(params string[] pages) =>
        new(pages.Select((text, i) => new ParsedPage(i + 1, text)).ToList());

    [Fact]
    public void Short_text_becomes_a_single_chunk()
    {
        var chunker = new TextChunker(maxChunkChars: 100, overlapChars: 10);

        var chunks = chunker.Split(Doc("Hello, archive!"));

        var chunk = Assert.Single(chunks);
        Assert.Equal("Hello, archive!", chunk.Text);
        Assert.Equal(1, chunk.Page);
        Assert.Equal(0, chunk.Index);
    }

    [Fact]
    public void Blank_pages_produce_no_chunks()
    {
        var chunker = new TextChunker();

        Assert.Empty(chunker.Split(Doc("", "   \n  ")));
    }

    [Fact]
    public void Long_text_is_split_into_chunks_within_the_limit()
    {
        var text = string.Join(" ", Enumerable.Range(1, 200).Select(i => $"Sentence number {i}."));
        var chunker = new TextChunker(maxChunkChars: 300, overlapChars: 50);

        var chunks = chunker.Split(Doc(text));

        Assert.True(chunks.Count > 1);
        Assert.All(chunks, c => Assert.True(c.Text.Length <= 300));
        Assert.Contains("Sentence number 1.", chunks[0].Text);
        Assert.Contains("Sentence number 200.", chunks[^1].Text);
    }

    [Fact]
    public void Consecutive_chunks_overlap()
    {
        var text = string.Join(" ", Enumerable.Range(1, 500).Select(i => $"w{i}"));
        var chunker = new TextChunker(maxChunkChars: 200, overlapChars: 40);

        var chunks = chunker.Split(Doc(text));

        Assert.True(chunks.Count > 1);
        for (var i = 1; i < chunks.Count; i++)
        {
            var firstWord = chunks[i].Text.Split(' ')[0];
            Assert.Contains(firstWord, chunks[i - 1].Text);
        }
    }

    [Fact]
    public void Page_numbers_are_preserved_and_chunk_index_is_global()
    {
        var chunker = new TextChunker(maxChunkChars: 100, overlapChars: 10);

        var chunks = chunker.Split(Doc("First page text.", "Second page text."));

        Assert.Equal(2, chunks.Count);
        Assert.Equal(new[] { 0, 1 }, chunks.Select(c => c.Index).ToArray());
        Assert.Equal(new int?[] { 1, 2 }, chunks.Select(c => c.Page).ToArray());
    }

    [Fact]
    public void Overlap_must_be_less_than_half_of_chunk_size()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => new TextChunker(maxChunkChars: 100, overlapChars: 60));
    }
}
