using AskMyArchive.Core.Parsing;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;

namespace AskMyArchive.Infrastructure.Parsing;

public sealed class DocxParser : IDocumentParser
{
    public IReadOnlyCollection<string> SupportedExtensions { get; } = [".docx"];

    public ParsedDocument Parse(Stream content)
    {
        using var word = WordprocessingDocument.Open(content, isEditable: false);
        var body = word.MainDocumentPart?.Document?.Body;
        var text = body is null
            ? string.Empty
            : string.Join("\n\n", body.Descendants<Paragraph>()
                .Select(p => p.InnerText)
                .Where(t => !string.IsNullOrWhiteSpace(t)));

        // .docx has no fixed pagination before rendering, so the whole document is one "page"
        return new ParsedDocument([new ParsedPage(1, text)]);
    }
}
