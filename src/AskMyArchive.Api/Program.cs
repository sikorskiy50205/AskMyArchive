using System.Net;
using System.Text;
using System.Threading.RateLimiting;
using AskMyArchive.Api.Auth;
using AskMyArchive.Api.Endpoints;
using AskMyArchive.Core.Entities;
using AskMyArchive.Infrastructure;
using AskMyArchive.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Scalar.AspNetCore;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

// Kestrel's default request-body cap is 30 MB, but DocumentEndpoints accepts uploads up to
// 50 MB. Without this override any 30–50 MB file fails with a 413 before the app-level
// check can even run. 60 MB leaves ~10 MB of headroom for multipart boundaries and headers.
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 60 * 1024 * 1024);

builder.Host.UseSerilog((context, loggerConfig) => loggerConfig
    .ReadFrom.Configuration(context.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console());

builder.Services.AddInfrastructure(builder.Configuration);
// Declare the JWT Bearer scheme in the OpenAPI document so Scalar shows an auth input.
builder.Services.AddOpenApi(options =>
{
    options.AddDocumentTransformer((document, context, ct) =>
    {
        document.Components ??= new OpenApiComponents();
        document.Components.SecuritySchemes["Bearer"] = new OpenApiSecurityScheme
        {
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            Description = "Paste the JWT from /api/auth/login (just the token, without the word 'Bearer')."
        };
        document.SecurityRequirements.Add(new OpenApiSecurityRequirement
        {
            [new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
            }] = []
        });
        return Task.CompletedTask;
    });
});
builder.Services.AddSingleton<IPasswordHasher<AppUser>, PasswordHasher<AppUser>>();

var jwt = builder.Configuration.GetSection(JwtOptions.Section).Get<JwtOptions>() ?? new JwtOptions();
// The key in appsettings.json is a placeholder for local development only.
if (!builder.Environment.IsDevelopment() && jwt.Key == "dev-only-secret-change-me-0123456789abcdef")
    throw new InvalidOperationException(
        "Jwt:Key still has the development placeholder value. Set a real secret (user-secrets, env var or vault) before running outside Development.");
builder.Services.AddSingleton(jwt);

var googleAuth = builder.Configuration.GetSection(GoogleAuthOptions.Section).Get<GoogleAuthOptions>() ?? new GoogleAuthOptions();
builder.Services.AddSingleton(googleAuth);

var refreshOptions = builder.Configuration.GetSection(RefreshTokenOptions.Section).Get<RefreshTokenOptions>() ?? new RefreshTokenOptions();
builder.Services.AddSingleton(refreshOptions);
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options => options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidIssuer = jwt.Issuer,
        ValidAudience = jwt.Audience,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key)),
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true
    });
builder.Services.AddAuthorization();

// The web frontend is served from a different origin (Next.js dev server / static hosting),
// so the browser requires CORS headers on API responses.
var corsOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
                  ?? ["http://localhost:3000"];
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    // AllowCredentials is required so the browser sends the refresh cookie on /api/auth/refresh
    // and /api/auth/logout. Origins must be explicit ("*" is incompatible with credentials).
    policy.WithOrigins(corsOrigins).AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

// Trust X-Forwarded-For / X-Forwarded-Proto only from explicitly listed proxy IPs. Left
// empty in the demo, so the middleware is skipped and RemoteIpAddress stays honest for
// local runs. In production, list the reverse proxy's IPs in ForwardedHeaders:KnownProxies
// so the credential rate limiter partitions by the real client, not by the proxy.
var trustedProxies = builder.Configuration
    .GetSection("ForwardedHeaders:KnownProxies").Get<string[]>() ?? [];
if (trustedProxies.Length > 0)
{
    builder.Services.Configure<ForwardedHeadersOptions>(options =>
    {
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        options.KnownProxies.Clear();
        options.KnownNetworks.Clear();
        foreach (var proxy in trustedProxies)
            if (IPAddress.TryParse(proxy, out var address))
                options.KnownProxies.Add(address);
    });
}

// Brute-force protection for credential endpoints (see AuthEndpoints): 5 attempts per minute
// per client IP. Behind a reverse proxy the partition key comes from ForwardedHeaders above.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, ct) =>
    {
        context.HttpContext.Response.ContentType = "application/json";
        await context.HttpContext.Response.WriteAsync(
            """{"error":"Too many attempts. Try again in a minute."}""", ct);
    };
    options.AddPolicy("auth", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromMinutes(1)
            }));

    // /api/ask fans out to a paid LLM per call. Cap each authenticated user at 30 requests
    // per minute — comfortable for real use, but keeps a runaway script from spending the
    // budget. Falls back to IP for anonymous callers, though /api/ask already requires auth.
    options.AddPolicy("ask", context =>
    {
        var partitionKey = context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                        ?? context.User.FindFirst("sub")?.Value
                        ?? context.Connection.RemoteIpAddress?.ToString()
                        ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(partitionKey,
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 30,
                Window = TimeSpan.FromMinutes(1)
            });
    });
});

var app = builder.Build();

// Apply any pending EF Core migrations on startup.
// Set "Database:AutoMigrate": false in appsettings to opt out (e.g. when a separate deploy step runs migrations).
if (app.Configuration.GetValue("Database:AutoMigrate", defaultValue: true))
{
    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();
}

// Must run before anything that reads Request.Scheme or Connection.RemoteIpAddress
// (SerilogRequestLogging, the rate limiter, cookie writers). No-op when the trusted-proxies
// list is empty, so local runs are unaffected.
if (trustedProxies.Length > 0)
    app.UseForwardedHeaders();

app.UseSerilogRequestLogging();

// The OpenAPI document and the Scalar UI enumerate every endpoint and its shape;
// that is helpful in Development but pure attack-surface reconnaissance in production.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference(); // interactive API docs at /scalar/v1
}

app.UseCors();

// Baseline response headers on every API reply. CSP is domain-specific and belongs in the
// reverse-proxy config for the deployed environment, so it is intentionally not set here.
app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;
    headers["X-Content-Type-Options"] = "nosniff";
    headers["Referrer-Policy"] = "no-referrer";
    headers["X-Frame-Options"] = "DENY";
    await next();
});

// Authentication must run before the rate limiter so the "ask" policy can partition by
// the authenticated user id, not by (proxy-shared) client IP.
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapGet("/health", () => Results.Ok(new { status = "ok" })).WithTags("Health");
app.MapAuthEndpoints();
app.MapDocumentEndpoints();
app.MapChatEndpoints();

app.Run();
