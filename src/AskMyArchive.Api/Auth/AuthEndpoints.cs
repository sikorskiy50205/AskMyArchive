using System.Net.Mail;
using System.Security.Claims;
using AskMyArchive.Core.Entities;
using AskMyArchive.Core.Storage;
using AskMyArchive.Infrastructure.Persistence;
using Google.Apis.Auth;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AskMyArchive.Api.Auth;

public record RegisterRequest(string Email, string Password);
public record LoginRequest(string Email, string Password);
public record GoogleLoginRequest(string IdToken);
public record ChangePasswordRequest(string CurrentPassword, string NewPassword);
public record DeleteAccountRequest(string? Password);

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth").WithTags("Auth");

        group.MapPost("/register", RegisterAsync);
        group.MapPost("/login", LoginAsync);
        group.MapPost("/google", GoogleLoginAsync);
        group.MapPost("/refresh", RefreshAsync);
        group.MapPost("/logout", LogoutAsync);

        var authed = group.MapGroup("/me").RequireAuthorization();
        authed.MapGet("/", GetMeAsync);
        authed.MapPut("/password", ChangePasswordAsync);
        authed.MapDelete("/", DeleteAccountAsync);
    }

    private static async Task<IResult> RegisterAsync(
        RegisterRequest request, AppDbContext db, IPasswordHasher<AppUser> hasher, CancellationToken ct)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        if (!MailAddress.TryCreate(email, out _) || request.Password.Length < 8)
            return Results.BadRequest(new { error = "A valid email and a password of at least 8 characters are required." });

        if (await db.Users.AnyAsync(u => u.Email == email, ct))
            return Results.Conflict(new { error = "User already exists." });

        var user = new AppUser { Id = Guid.NewGuid(), Email = email, PasswordHash = string.Empty };
        user.PasswordHash = hasher.HashPassword(user, request.Password);

        db.Users.Add(user);
        await db.SaveChangesAsync(ct);

        return Results.Created($"/api/users/{user.Id}", new { user.Id, user.Email });
    }

    private static async Task<IResult> LoginAsync(
        LoginRequest request, HttpContext ctx, AppDbContext db,
        IPasswordHasher<AppUser> hasher, JwtOptions jwt, RefreshTokenOptions refreshOptions,
        CancellationToken ct)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email, ct);
        if (user is null || user.PasswordHash is null ||
            hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password) == PasswordVerificationResult.Failed)
            return Results.Unauthorized();

        var token = await TokenIssuer.IssueTokenPairAsync(ctx, user, db, jwt, refreshOptions, ct);
        return Results.Ok(new { token });
    }

    private static async Task<IResult> GoogleLoginAsync(
        GoogleLoginRequest request, HttpContext ctx, AppDbContext db, GoogleAuthOptions googleOptions,
        JwtOptions jwt, RefreshTokenOptions refreshOptions,
        ILoggerFactory loggerFactory, CancellationToken ct)
    {
        var log = loggerFactory.CreateLogger("GoogleAuth");
        if (string.IsNullOrWhiteSpace(googleOptions.ClientId))
            return Results.BadRequest(new { error = "Google sign-in is not configured on the server." });
        if (string.IsNullOrWhiteSpace(request.IdToken))
            return Results.BadRequest(new { error = "idToken is required." });

        GoogleJsonWebSignature.Payload payload;
        try
        {
            payload = await GoogleJsonWebSignature.ValidateAsync(request.IdToken, new GoogleJsonWebSignature.ValidationSettings
            {
                Audience = new[] { googleOptions.ClientId },
                // A little slack to survive minor clock drift on the local machine vs Google.
                IssuedAtClockTolerance = TimeSpan.FromMinutes(5),
                ExpirationTimeClockTolerance = TimeSpan.FromMinutes(5)
            });
        }
        catch (InvalidJwtException ex)
        {
            log.LogWarning("Google ID token validation failed: {Message}. Expected audience: {Audience}",
                ex.Message, googleOptions.ClientId);
            return Results.Unauthorized();
        }

        if (payload.EmailVerified != true || string.IsNullOrWhiteSpace(payload.Email))
            return Results.BadRequest(new { error = "Google account has no verified email." });

        var email = payload.Email.Trim().ToLowerInvariant();
        var googleId = payload.Subject;

        var user = await db.Users.FirstOrDefaultAsync(u => u.GoogleId == googleId, ct)
                   ?? await db.Users.FirstOrDefaultAsync(u => u.Email == email, ct);

        if (user is null)
        {
            user = new AppUser { Id = Guid.NewGuid(), Email = email, PasswordHash = null, GoogleId = googleId };
            db.Users.Add(user);
        }
        else if (user.GoogleId is null)
        {
            // Existing password account: link Google since Google confirmed the same verified email.
            user.GoogleId = googleId;
        }

        await db.SaveChangesAsync(ct);
        var token = await TokenIssuer.IssueTokenPairAsync(ctx, user, db, jwt, refreshOptions, ct);
        return Results.Ok(new { token });
    }

    private static async Task<IResult> RefreshAsync(
        HttpContext ctx, AppDbContext db, JwtOptions jwt, RefreshTokenOptions refreshOptions,
        CancellationToken ct)
    {
        if (!ctx.Request.Cookies.TryGetValue(refreshOptions.CookieName, out var rawToken) ||
            string.IsNullOrEmpty(rawToken))
            return Results.Unauthorized();

        var hash = TokenIssuer.HashToken(rawToken);
        var stored = await db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, ct);

        if (stored is null || stored.RevokedAt is not null || stored.ExpiresAt <= DateTimeOffset.UtcNow)
        {
            TokenIssuer.ClearRefreshCookie(ctx.Response, refreshOptions);
            return Results.Unauthorized();
        }

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == stored.UserId, ct);
        if (user is null)
        {
            TokenIssuer.ClearRefreshCookie(ctx.Response, refreshOptions);
            return Results.Unauthorized();
        }

        // Rotate: revoke the presented token before issuing a new pair, so a stolen refresh token
        // is single-use — a second use would find RevokedAt set and be rejected.
        stored.RevokedAt = DateTimeOffset.UtcNow;
        var token = await TokenIssuer.IssueTokenPairAsync(ctx, user, db, jwt, refreshOptions, ct);
        return Results.Ok(new { token });
    }

    private static async Task<IResult> LogoutAsync(
        HttpContext ctx, AppDbContext db, RefreshTokenOptions refreshOptions, CancellationToken ct)
    {
        if (ctx.Request.Cookies.TryGetValue(refreshOptions.CookieName, out var rawToken)
            && !string.IsNullOrEmpty(rawToken))
        {
            var hash = TokenIssuer.HashToken(rawToken);
            var stored = await db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
            if (stored is not null && stored.RevokedAt is null)
            {
                stored.RevokedAt = DateTimeOffset.UtcNow;
                await db.SaveChangesAsync(ct);
            }
        }

        TokenIssuer.ClearRefreshCookie(ctx.Response, refreshOptions);
        return Results.NoContent();
    }

    private static async Task<IResult> GetMeAsync(
        ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        var userId = principal.GetUserId();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null) return Results.Unauthorized();

        var documentCount = await db.Documents.CountAsync(d => d.UserId == userId, ct);
        // "Questions asked" == user-role chat messages across all conversations.
        var conversationIds = db.Conversations.Where(c => c.UserId == userId).Select(c => c.Id);
        var questionCount = await db.Messages
            .CountAsync(m => m.Role == "user" && conversationIds.Contains(m.ConversationId), ct);

        return Results.Ok(new
        {
            id = user.Id,
            email = user.Email,
            createdAt = user.CreatedAt,
            documentCount,
            questionCount,
            hasPassword = user.PasswordHash is not null,
            hasGoogle = user.GoogleId is not null
        });
    }

    private static async Task<IResult> ChangePasswordAsync(
        ChangePasswordRequest request, ClaimsPrincipal principal,
        AppDbContext db, IPasswordHasher<AppUser> hasher, CancellationToken ct)
    {
        if (request.NewPassword.Length < 8)
            return Results.BadRequest(new { error = "The new password must be at least 8 characters." });

        var userId = principal.GetUserId();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null) return Results.Unauthorized();

        if (user.PasswordHash is null)
            return Results.BadRequest(new { error = "This account signs in with Google; there is no password to change." });

        if (hasher.VerifyHashedPassword(user, user.PasswordHash, request.CurrentPassword)
            == PasswordVerificationResult.Failed)
            return Results.BadRequest(new { error = "Current password is incorrect." });

        user.PasswordHash = hasher.HashPassword(user, request.NewPassword);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> DeleteAccountAsync(
        // DELETE with a body — minimal APIs won't infer the body source automatically.
        [FromBody] DeleteAccountRequest request, ClaimsPrincipal principal,
        AppDbContext db, IPasswordHasher<AppUser> hasher,
        IFileStorage storage, CancellationToken ct)
    {
        var userId = principal.GetUserId();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null) return Results.Unauthorized();

        // Require the current password to guard against session-hijack style deletes.
        // Google-only accounts have no password: possession of a valid JWT is treated as proof enough.
        if (user.PasswordHash is not null)
        {
            if (string.IsNullOrEmpty(request.Password) ||
                hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password)
                    == PasswordVerificationResult.Failed)
                return Results.BadRequest(new { error = "Password is incorrect." });
        }

        // Cascade delete would drop the rows, but files on disk need cleanup too.
        var storagePaths = await db.Documents
            .Where(d => d.UserId == userId)
            .Select(d => d.StoragePath)
            .ToListAsync(ct);
        foreach (var path in storagePaths) storage.Delete(path);

        db.Documents.RemoveRange(db.Documents.Where(d => d.UserId == userId));
        db.Conversations.RemoveRange(db.Conversations.Where(c => c.UserId == userId));
        db.Users.Remove(user);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

}
