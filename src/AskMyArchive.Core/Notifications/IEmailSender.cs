namespace AskMyArchive.Core.Notifications;

public interface IEmailSender
{
    Task SendAsync(string toEmail, string subject, string htmlBody, string plainBody, CancellationToken ct);
}
