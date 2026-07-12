namespace AskMyArchive.Api.Auth;

public sealed class RefreshTokenOptions
{
    public const string Section = "RefreshToken";

    public int LifetimeDays { get; set; } = 30;
    public string CookieName { get; set; } = "askmyarchive_refresh";
    // Off for local http dev; enable in production (behind HTTPS).
    public bool SecureCookie { get; set; } = false;
    // "Lax" is fine for localhost:3000 ↔ localhost:5014 (same site, different ports).
    // Use "None" when frontend and backend live on different registrable domains — then SecureCookie must be true.
    public string SameSite { get; set; } = "Lax";
}
