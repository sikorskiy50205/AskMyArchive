using System.IdentityModel.Tokens.Jwt;
using System.Net.Mail;
using System.Security.Claims;
using System.Text;
using AskMyArchive.Core.Entities;
using AskMyArchive.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace AskMyArchive.Api.Auth;

public record RegisterRequest(string Email, string Password);
public record LoginRequest(string Email, string Password);

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth").WithTags("Auth");

        group.MapPost("/register", RegisterAsync);
        group.MapPost("/login", LoginAsync);
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
