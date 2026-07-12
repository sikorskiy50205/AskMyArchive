namespace AskMyArchive.Core.Entities;

public class AuthToken
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    // SHA-256 hash (base64) of the raw token that was emailed to the user.
    public required string TokenHash { get; set; }
    public required string Purpose { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    // Set when the token is used (successful password reset or email confirmation).
    public DateTimeOffset? ConsumedAt { get; set; }
}

public static class AuthTokenPurpose
{
    public const string EmailConfirmation = "email_confirmation";
    public const string PasswordReset = "password_reset";
}
