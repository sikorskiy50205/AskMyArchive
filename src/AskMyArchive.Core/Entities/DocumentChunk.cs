using Pgvector;

namespace AskMyArchive.Core.Entities;

public class DocumentChunk
{
    public Guid Id { get; set; }
    public Guid DocumentId { get; set; }
    public ArchiveDocument? Document { get; set; }
    public int Index { get; set; }
    public int? Page { get; set; }
    public required string Text { get; set; }
    public Vector? Embedding { get; set; }
}
