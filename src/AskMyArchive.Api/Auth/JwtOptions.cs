namespace AskMyArchive.Api.Auth;

public sealed class JwtOptions
{
    public const string Section = "Jwt";

    public string Issuer { get; set; } = "AskMyArchive";
    public string Audience { get; set; } = "AskMyArchive";

    /// <summary>HS256 key, at least 32 bytes. Override outside of dev via the Jwt__Key env var.</summary>
    public string Key { get; set; } = "dev-only-secret-change-me-0123456789abcdef";

    public int LifetimeMinutes { get; set; } = 24 * 60;
}
