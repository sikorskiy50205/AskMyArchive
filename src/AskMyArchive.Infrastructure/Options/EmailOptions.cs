namespace AskMyArchive.Infrastructure.Options;

public sealed class EmailOptions
{
    public const string Section = "Email";

    public string SmtpHost { get; set; } = "localhost";
    public int SmtpPort { get; set; } = 1025;
    public string? SmtpUsername { get; set; }
    public string? SmtpPassword { get; set; }
    public bool UseSsl { get; set; } = false;

    public string FromAddress { get; set; } = "noreply@askmyarchive.local";
    public string FromName { get; set; } = "AskMyArchive";

    // Base URL of the web frontend — used to build links inside emails
    // (e.g. https://.../reset-password?token=...).
    public string LinkBaseUrl { get; set; } = "http://localhost:3000";
}
