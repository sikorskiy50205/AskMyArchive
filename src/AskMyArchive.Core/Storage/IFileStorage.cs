namespace AskMyArchive.Core.Storage;

public interface IFileStorage
{
    /// <summary>Stores the content and returns a storage path to keep in the database.</summary>
    Task<string> SaveAsync(Guid userId, Guid documentId, string extension, Stream content, CancellationToken ct = default);

    Stream OpenRead(string storagePath);

    void Delete(string storagePath);
}
