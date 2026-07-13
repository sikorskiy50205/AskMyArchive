using System.Text;
using System.Threading.RateLimiting;
using AskMyArchive.Api.Auth;
using AskMyArchive.Api.Endpoints;
using AskMyArchive.Core.Entities;
using AskMyArchive.Infrastructure;
using AskMyArchive.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Scalar.AspNetCore;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

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

// Brute-force protection for credential endpoints (see AuthEndpoints): 5 attempts per minute
// per client IP. Behind a reverse proxy RemoteIpAddress is the proxy — add ForwardedHeaders
// middleware before enabling this in such a deployment.
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
});

var app = builder.Build();

// Apply any pending EF Core migrations on startup.
// Set "Database:AutoMigrate": false in appsettings to opt out (e.g. when a separate deploy step runs migrations).
if (app.Configuration.GetValue("Database:AutoMigrate", defaultValue: true))
{
    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();
}

app.UseSerilogRequestLogging();

app.MapOpenApi();
app.MapScalarApiReference(); // interactive API docs at /scalar/v1

app.UseCors();
app.UseRateLimiter();

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "ok" })).WithTags("Health");
app.MapAuthEndpoints();
app.MapDocumentEndpoints();
app.MapChatEndpoints();

app.Run();
