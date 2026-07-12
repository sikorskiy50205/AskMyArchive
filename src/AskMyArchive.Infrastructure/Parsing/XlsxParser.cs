using System.Text;
using AskMyArchive.Core.Parsing;
using ClosedXML.Excel;

namespace AskMyArchive.Infrastructure.Parsing;

public sealed class XlsxParser : IDocumentParser
{
    public IReadOnlyCollection<string> SupportedExtensions { get; } = [".xlsx"];

    public ParsedDocument Parse(Stream content)
    {
        using var workbook = new XLWorkbook(content);
        var pages = new List<ParsedPage>();

        // One worksheet == one "page". This maps sheet order to citations like [file, p.3],
        // which is the same convention PDFs use elsewhere in the app.
        int pageNumber = 0;
        foreach (var sheet in workbook.Worksheets)
        {
            pageNumber++;
            var sb = new StringBuilder();
            sb.Append("# ").AppendLine(sheet.Name);

            var used = sheet.RangeUsed();
            if (used is null)
            {
                pages.Add(new ParsedPage(pageNumber, sb.ToString().TrimEnd()));
                continue;
            }

            // TSV rather than CSV so we don't have to escape commas; formatted strings preserve
            // dates/numbers the way the user sees them in Excel, which is what a reader will look for.
            foreach (var row in used.Rows())
            {
                var cells = row.Cells().Select(c => c.GetFormattedString() ?? string.Empty);
                sb.AppendLine(string.Join('\t', cells));
            }

            pages.Add(new ParsedPage(pageNumber, sb.ToString().TrimEnd()));
        }

        return new ParsedDocument(pages);
    }
}
