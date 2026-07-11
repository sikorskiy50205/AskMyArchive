using System.Security.Claims;
using System.Text;
using System.Text.Json;
using AskMyArchive.Api.Auth;
using AskMyArchive.Core.Entities;
using AskMyArchive.Core.Llm;
using AskMyArchive.Core.Rag;
using AskMyArchive.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AskMyArchive.Api.Endpoints;

public record AskRequest(string Question, Guid? ConversationId);

public static class ChatEndpoints
{
    public static void MapChatEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api").WithTags("Chat").RequireAuthorization();

        group.MapPost("/ask", AskAsync);
        group.MapGet("/conversations", ListConversationsAsync);
        group.MapGet("/conversations/{id:guid}/messages", ListMessagesAsync);
        group.MapDelete("/conversations/{id:guid}", DeleteConversationAsync);
    }

    /// <summary>Answers a question over the user's archive, streaming tokens via server-sent events.</summary>
    private static async Task AskAsync(
        AskRequest request, ClaimsPrincipal principal, AppDbContext db, RagService rag,
        HttpContext http, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Question))
        {
            http.Response.StatusCode = StatusCodes.Status400BadRequest;
            await http.Response.WriteAsJsonAsync(new { error = "Question must not be empty." }, ct);
            return;
        }

        var userId = principal.GetUserId();

        Conversation? conversation;
        var history = new List<LlmMessage>();
        if (request.ConversationId is { } conversationId)
        {
            conversation = await db.Conversations
                .FirstOrDefaultAsync(c => c.Id == conversationId && c.UserId == userId, ct);
            if (conversation is null)
            {
                http.Response.StatusCode = StatusCodes.Status404NotFound;
                return;
            }

            var recent = await db.Messages
                .Where(m => m.ConversationId == conversation.Id)
                .OrderByDescending(m => m.CreatedAt)
                .Take(10)
                .Select(m => new LlmMessage(m.Role, m.Content))
                .ToListAsync(ct);
            recent.Reverse();
            history = recent;
        }
        else
        {
            conversation = new Conversation
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Title = request.Question.Length > 80 ? request.Question[..80] : request.Question
            };
            db.Conversations.Add(conversation);
            await db.SaveChangesAsync(ct);
        }

        RagAnswer answer;
        try
        {
            answer = await rag.AskAsync(userId, request.Question, history, ct: ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            http.Response.StatusCode = StatusCodes.Status502BadGateway;
            await http.Response.WriteAsJsonAsync(new { error = ex.Message }, ct);
            return;
        }

        http.Response.ContentType = "text/event-stream";
        http.Response.Headers.CacheControl = "no-cache";

        await WriteEventAsync(http.Response, "meta", new
        {
            conversationId = conversation.Id,
            sources = answer.Sources.Select(s => new { s.DocumentId, s.FileName, s.Page })
        }, ct);

        var fullAnswer = new StringBuilder();
        try
        {
            await foreach (var token in answer.Tokens.WithCancellation(ct))
            {
                fullAnswer.Append(token);
                await WriteEventAsync(http.Response, "token", new { text = token }, ct);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            await WriteEventAsync(http.Response, "error", new { error = ex.Message }, ct);
            return;
        }

        var now = DateTimeOffset.UtcNow;
        db.Messages.Add(new ChatMessage
        {
            Id = Guid.NewGuid(), ConversationId = conversation.Id,
            Role = "user", Content = request.Question, CreatedAt = now
        });
        db.Messages.Add(new ChatMessage
        {
            Id = Guid.NewGuid(), ConversationId = conversation.Id,
            Role = "assistant", Content = fullAnswer.ToString(), CreatedAt = now.AddMilliseconds(1)
        });
        await db.SaveChangesAsync(CancellationToken.None);

        await WriteEventAsync(http.Response, "done", new { }, ct);
    }

    private static async Task<IResult> ListConversationsAsync(
        ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        var userId = principal.GetUserId();
        var conversations = await db.Conversations
            .Where(c => c.UserId == userId)
            .OrderByDescending(c => c.CreatedAt)
            .Select(c => new { c.Id, c.Title, c.CreatedAt })
            .ToListAsync(ct);
        return Results.Ok(conversations);
    }

    private static async Task<IResult> ListMessagesAsync(
        Guid id, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        var userId = principal.GetUserId();
        var exists = await db.Conversations.AnyAsync(c => c.Id == id && c.UserId == userId, ct);
        if (!exists)
            return Results.NotFound();

        var messages = await db.Messages
            .Where(m => m.ConversationId == id)
            .OrderBy(m => m.CreatedAt)
            .Select(m => new { m.Id, m.Role, m.Content, m.CreatedAt })
            .ToListAsync(ct);
        return Results.Ok(messages);
    }

    private static async Task<IResult> DeleteConversationAsync(
        Guid id, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        var userId = principal.GetUserId();
        var conversation = await db.Conversations
            .FirstOrDefaultAsync(c => c.Id == id && c.UserId == userId, ct);
        if (conversation is null)
            return Results.NotFound();

        db.Conversations.Remove(conversation); // messages are removed by cascade delete
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    // Match the camelCase naming the rest of the API uses (raw Serialize would emit PascalCase).
    private static readonly JsonSerializerOptions SseJsonOptions = new(JsonSerializerDefaults.Web);

    private static async Task WriteEventAsync(HttpResponse response, string eventName, object payload, CancellationToken ct)
    {
        await response.WriteAsync($"event: {eventName}\ndata: {JsonSerializer.Serialize(payload, SseJsonOptions)}\n\n", ct);
        await response.Body.FlushAsync(ct);
    }
}
