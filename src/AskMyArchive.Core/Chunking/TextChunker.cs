using AskMyArchive.Core.Parsing;

namespace AskMyArchive.Core.Chunking;

/// <summary>
/// Splits parsed documents into overlapping chunks sized for embedding models.
/// Prefers to break on a paragraph, then a sentence, then a word boundary.
/// </summary>
public sealed class TextChunker : ITextChunker
{
    private static readonly char[] SentenceEnds = ['.', '!', '?'];

    private readonly int _maxChunkChars;
    private readonly int _overlapChars;

    public TextChunker(int maxChunkChars = 1500, int overlapChars = 200)
    {
        if (maxChunkChars <= 0)
            throw new ArgumentOutOfRangeException(nameof(maxChunkChars));
        if (overlapChars < 0 || overlapChars >= maxChunkChars / 2)
            throw new ArgumentOutOfRangeException(nameof(overlapChars),
                "Overlap must be non-negative and less than half of the chunk size.");

        _maxChunkChars = maxChunkChars;
        _overlapChars = overlapChars;
    }

    public IReadOnlyList<TextChunk> Split(ParsedDocument document)
    {
        var chunks = new List<TextChunk>();
        foreach (var page in document.Pages)
            foreach (var piece in SplitText(page.Text))
                chunks.Add(new TextChunk(chunks.Count, page.Number, piece));
        return chunks;
    }

    private IEnumerable<string> SplitText(string text)
    {
        var clean = text.Trim();
        if (clean.Length == 0)
            yield break;

        var start = 0;
        while (start < clean.Length)
        {
            var end = Math.Min(start + _maxChunkChars, clean.Length);

            if (end < clean.Length)
            {
                var window = clean.AsSpan(start, end - start);
                var breakAt = window.LastIndexOf("\n\n");
                if (breakAt <= _maxChunkChars / 2)
                    breakAt = window.LastIndexOfAny(SentenceEnds);
                if (breakAt <= _maxChunkChars / 2)
                    breakAt = window.LastIndexOf(' ');
                if (breakAt > _maxChunkChars / 2)
                    end = start + breakAt + 1;
            }

            var piece = clean[start..end].Trim();
            if (piece.Length > 0)
                yield return piece;

            if (end >= clean.Length)
                yield break;

            // overlap < maxChunkChars / 2 < (end - start), so the loop always advances
            start = end - _overlapChars;
        }
    }
}
