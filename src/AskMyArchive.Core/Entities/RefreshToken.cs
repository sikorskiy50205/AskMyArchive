namespace AskMyArchive.Core.Entities;

public class RefreshToken
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    // SHA-256 hash (base64) of the raw token that was sent to the client;
    // the raw token is never stored, so a DB leak doesn't hand out sessions.
    public required string TokenHash { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    // Set when the token is rotated (used to issue a new pair) or explicitly revoked (logout).
    public DateTimeOffset? RevokedAt { get; set; }
}
