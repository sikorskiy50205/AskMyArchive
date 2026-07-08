namespace AskMyArchive.Core.Parsing;

public record ParsedPage(int Number, string Text);

public record ParsedDocument(IReadOnlyList<ParsedPage> Pages);

public interface IDocumentParser
{
    /// <summary>Lower-case file extensions this parser understands, e.g. ".pdf".</summary>
    IReadOnlyCollection<string> SupportedExtensions { get; }

    ParsedDocument Parse(Stream content);
}
