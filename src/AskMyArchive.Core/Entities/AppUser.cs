namespace AskMyArchive.Core.Entities;

public class AppUser
{
    public Guid Id { get; set; }
    public required string Email { get; set; }
    // Null for accounts that only sign in through an external provider (e.g. Google).
    public string? PasswordHash { get; set; }
    // Google "sub" claim; null unless the account is linked to Google sign-in.
    public string? GoogleId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    // Null until the user proves control of the mailbox (or signs in with Google, which verifies it).
    public DateTimeOffset? EmailConfirmedAt { get; set; }
}
