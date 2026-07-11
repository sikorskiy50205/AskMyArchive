using System.IdentityModel.Tokens.Jwt;
using System.Net.Mail;
using System.Security.Claims;
using System.Text;
using AskMyArchive.Core.Entities;
using AskMyArchive.Core.Storage;
using AskMyArchive.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace AskMyArchive.Api.Auth;

public record RegisterRequest(string Email, string Password);
public record LoginRequest(string Email, string Password);
public record ChangePasswordRequest(string CurrentPassword, string NewPassword);
public record DeleteAccountRequest(string Password);

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth").WithTags("Auth");

        group.MapPost("/register", RegisterAsync);
        group.MapPost("/login", LoginAsync);

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
        LoginRequest request, AppDbContext db, IPasswordHasher<AppUser> hasher, JwtOptions jwt, CancellationToken ct)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email, ct);
        if (user is null ||
            hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password) == PasswordVerificationResult.Failed)
            return Results.Unauthorized();

        return Results.Ok(new { token = CreateToken(user, jwt) });
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
            questionCount
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
        if (hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password)
            == PasswordVerificationResult.Failed)
            return Results.BadRequest(new { error = "Password is incorrect." });

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

    private static string CreateToken(AppUser user, JwtOptions jwt)
    {
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email)
        };
        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key)),
            SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: jwt.Issuer,
            audience: jwt.Audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(jwt.LifetimeMinutes),
            signingCredentials: credentials);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
