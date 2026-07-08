namespace AskMyArchive.Core.Entities;

public enum DocumentStatus
{
    Uploaded,
    Indexing,
    Indexed,
    Failed
}

public class ArchiveDocument
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public required string FileName { get; set; }
    public required string ContentType { get; set; }
    public long SizeBytes { get; set; }
    public required string StoragePath { get; set; }
    public DocumentStatus Status { get; set; } = DocumentStatus.Uploaded;
    public string? Error { get; set; }
    public int PageCount { get; set; }
    public DateTimeOffset UploadedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<DocumentChunk> Chunks { get; set; } = [];
}
