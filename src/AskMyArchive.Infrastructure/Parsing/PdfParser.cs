using AskMyArchive.Core.Parsing;
using UglyToad.PdfPig;

namespace AskMyArchive.Infrastructure.Parsing;

public sealed class PdfParser : IDocumentParser
{
    public IReadOnlyCollection<string> SupportedExtensions { get; } = [".pdf"];

    public ParsedDocument Parse(Stream content)
    {
        using var pdf = PdfDocument.Open(content);
        var pages = pdf.GetPages()
            .Select(page => new ParsedPage(page.Number, page.Text))
            .ToList();
        return new ParsedDocument(pages);
    }
}
