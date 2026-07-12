namespace AskMyArchive.Api.Auth;

public sealed class GoogleAuthOptions
{
    public const string Section = "GoogleAuth";

    /// <summary>OAuth 2.0 Client ID from Google Cloud Console. Empty disables Google sign-in.</summary>
    public string ClientId { get; set; } = string.Empty;
}
