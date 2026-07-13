using System.Text.RegularExpressions;
using AskMyArchive.Core.Parsing;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;

namespace AskMyArchive.Infrastructure.Parsing;

public sealed partial class DocxParser : IDocumentParser
{
    public IReadOnlyCollection<string> SupportedExtensions { get; } = [".docx"];

    public ParsedDocument Parse(Stream content)
    {
        using var word = WordprocessingDocument.Open(content, isEditable: false);
        var body = word.MainDocumentPart?.Document?.Body;
        var text = body is null
            ? string.Empty
            : string.Join("\n\n", body.Descendants<Paragraph>()
                .Select(p => CleanParagraph(p.InnerText))
                .Where(t => !string.IsNullOrWhiteSpace(t)));

        // .docx has no fixed pagination before rendering, so the whole document is one "page"
        return new ParsedDocument([new ParsedPage(1, text)]);
    }

    // Documents converted from HTML templates carry literal "&nbsp;" runs used as layout
    // filler; they bloat chunks and poison embeddings.
    private static string CleanParagraph(string text) =>
        CollapseSpaces().Replace(text.Replace("&nbsp;", " "), " ");

    [GeneratedRegex(@"[ \t]{2,}")]
    private static partial Regex CollapseSpaces();
}
