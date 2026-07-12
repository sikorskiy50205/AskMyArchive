using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using AskMyArchive.Core.Entities;
using AskMyArchive.Infrastructure.Persistence;
using Microsoft.IdentityModel.Tokens;

namespace AskMyArchive.Api.Auth;

public static class TokenIssuer
{
    /// <summary>Creates access + refresh tokens, persists the refresh hash, sets the refresh cookie, returns the access JWT.</summary>
    public static async Task<string> IssueTokenPairAsync(
        HttpContext ctx, AppUser user,
        AppDbContext db, JwtOptions jwt, RefreshTokenOptions refreshOptions, CancellationToken ct)
    {
        var accessToken = CreateAccessToken(user, jwt);
        var (rawRefresh, hash) = GenerateRefreshToken();
        var expiresAt = DateTimeOffset.UtcNow.AddDays(refreshOptions.LifetimeDays);

        db.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            TokenHash = hash,
            ExpiresAt = expiresAt
        });
        await db.SaveChangesAsync(ct);

        SetRefreshCookie(ctx.Response, rawRefresh, expiresAt, refreshOptions);
        return accessToken;
    }

    public static string CreateAccessToken(AppUser user, JwtOptions jwt)
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

    public static (string rawToken, string hash) GenerateRefreshToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        var raw = Base64UrlEncoder.Encode(bytes);
        return (raw, HashToken(raw));
    }

    public static string HashToken(string raw)
    {
        var digest = SHA256.HashData(Encoding.UTF8.GetBytes(raw));
        return Convert.ToBase64String(digest);
    }

    public static void SetRefreshCookie(HttpResponse response, string rawToken, DateTimeOffset expiresAt, RefreshTokenOptions opts)
    {
        response.Cookies.Append(opts.CookieName, rawToken, BuildCookieOptions(opts, expiresAt));
    }

    public static void ClearRefreshCookie(HttpResponse response, RefreshTokenOptions opts)
    {
        // Path must match the one used when the cookie was set, otherwise the browser keeps it.
        response.Cookies.Delete(opts.CookieName, BuildCookieOptions(opts, expiresAt: null));
    }

    private static CookieOptions BuildCookieOptions(RefreshTokenOptions opts, DateTimeOffset? expiresAt)
    {
        return new CookieOptions
        {
            HttpOnly = true,
            Secure = opts.SecureCookie,
            SameSite = ParseSameSite(opts.SameSite),
            // Restrict the cookie to auth endpoints so it isn't sent with every /api/documents request.
            Path = "/api/auth",
            Expires = expiresAt,
            IsEssential = true
        };
    }

    private static SameSiteMode ParseSameSite(string s) => s?.ToLowerInvariant() switch
    {
        "none" => SameSiteMode.None,
        "strict" => SameSiteMode.Strict,
        _ => SameSiteMode.Lax
    };
}
