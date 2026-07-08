using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace AskMyArchive.Api.Auth;

public static class ClaimsPrincipalExtensions
{
    public static Guid GetUserId(this ClaimsPrincipal principal)
    {
        var value = principal.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
            ?? throw new InvalidOperationException("Token does not contain a user id claim.");
        return Guid.Parse(value);
    }
}
