using AskMyArchive.Core.Notifications;
using AskMyArchive.Infrastructure.Options;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MimeKit;

namespace AskMyArchive.Infrastructure.Notifications;

public class SmtpEmailSender(IOptions<EmailOptions> options, ILogger<SmtpEmailSender> log) : IEmailSender
{
    private readonly EmailOptions _options = options.Value;

    public async Task SendAsync(string toEmail, string subject, string htmlBody, string plainBody, CancellationToken ct)
    {
        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(_options.FromName, _options.FromAddress));
        message.To.Add(MailboxAddress.Parse(toEmail));
        message.Subject = subject;

        var builder = new BodyBuilder
        {
            TextBody = plainBody,
            HtmlBody = htmlBody
        };
        message.Body = builder.ToMessageBody();

        using var client = new SmtpClient();
        // Mailhog and other dev inboxes accept plain SMTP; production providers require TLS.
        var secure = _options.UseSsl ? SecureSocketOptions.StartTlsWhenAvailable : SecureSocketOptions.None;
        await client.ConnectAsync(_options.SmtpHost, _options.SmtpPort, secure, ct);

        if (!string.IsNullOrEmpty(_options.SmtpUsername))
            await client.AuthenticateAsync(_options.SmtpUsername, _options.SmtpPassword ?? string.Empty, ct);

        await client.SendAsync(message, ct);
        await client.DisconnectAsync(true, ct);

        log.LogInformation("Email sent to {To}: {Subject}", toEmail, subject);
    }
}
