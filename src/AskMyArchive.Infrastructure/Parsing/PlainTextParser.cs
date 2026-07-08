using AskMyArchive.Core.Parsing;

namespace AskMyArchive.Infrastructure.Parsing;

public sealed class PlainTextParser : IDocumentParser
{
    public IReadOnlyCollection<string> SupportedExtensions { get; } = [".txt", ".md"];

    public ParsedDocument Parse(Stream content)
    {
        using var reader = new StreamReader(content);
        return new ParsedDocument([new ParsedPage(1, reader.ReadToEnd())]);
    }
}
