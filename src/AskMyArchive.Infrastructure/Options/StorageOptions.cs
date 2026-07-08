namespace AskMyArchive.Infrastructure.Options;

public sealed class StorageOptions
{
    public const string Section = "Storage";

    public string RootPath { get; set; } = "data/uploads";
}
