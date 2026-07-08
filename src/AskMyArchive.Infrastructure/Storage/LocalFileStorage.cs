using AskMyArchive.Core.Storage;
using AskMyArchive.Infrastructure.Options;
using Microsoft.Extensions.Options;

namespace AskMyArchive.Infrastructure.Storage;

/// <summary>
/// Stores uploads on the local disk (or a mounted volume in Docker).
/// Swap for an S3/MinIO implementation without touching the rest of the app.
/// </summary>
public sealed class LocalFileStorage(IOptions<StorageOptions> options) : IFileStorage
{
    public async Task<string> SaveAsync(
        Guid userId, Guid documentId, string extension, Stream content, CancellationToken ct = default)
    {
        var relativePath = Path.Combine(userId.ToString("N"), $"{documentId:N}{extension}");
        var fullPath = GetFullPath(relativePath);
        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);

        await using var file = File.Create(fullPath);
        await content.CopyToAsync(file, ct);
        return relativePath;
    }

    public Stream OpenRead(string storagePath) => File.OpenRead(GetFullPath(storagePath));

    public void Delete(string storagePath)
    {
        var fullPath = GetFullPath(storagePath);
        if (File.Exists(fullPath))
            File.Delete(fullPath);
    }

    private string GetFullPath(string relativePath) =>
        Path.GetFullPath(Path.Combine(options.Value.RootPath, relativePath));
}
