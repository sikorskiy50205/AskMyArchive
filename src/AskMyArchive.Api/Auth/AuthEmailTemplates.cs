namespace AskMyArchive.Api.Auth;

/// <summary>
/// Plain-text + HTML bodies for the two auth-flow emails. Kept together so tweaks
/// to copy or link shape are a single-file change.
/// </summary>
public static class AuthEmailTemplates
{
    public static (string subject, string html, string plain) ConfirmationEmail(string linkBaseUrl, string rawToken)
    {
        var link = $"{linkBaseUrl.TrimEnd('/')}/confirm-email?token={Uri.EscapeDataString(rawToken)}";
        var subject = "Подтвердите email в AskMyArchive";
        var plain =
            "Здравствуйте!\n\n" +
            "Подтвердите свой email по ссылке:\n" +
            $"{link}\n\n" +
            "Ссылка действует 24 часа.";
        var html =
            "<p>Здравствуйте!</p>" +
            "<p>Подтвердите свой email по ссылке:</p>" +
            $"<p><a href=\"{link}\">{link}</a></p>" +
            "<p style=\"color:#888;font-size:12px\">Ссылка действует 24 часа.</p>";
        return (subject, html, plain);
    }

    public static (string subject, string html, string plain) PasswordResetEmail(string linkBaseUrl, string rawToken)
    {
        var link = $"{linkBaseUrl.TrimEnd('/')}/reset-password?token={Uri.EscapeDataString(rawToken)}";
        var subject = "Сброс пароля в AskMyArchive";
        var plain =
            "Здравствуйте!\n\n" +
            "Чтобы задать новый пароль, перейдите по ссылке:\n" +
            $"{link}\n\n" +
            "Если вы не запрашивали сброс — проигнорируйте это письмо.\n" +
            "Ссылка действует 1 час.";
        var html =
            "<p>Здравствуйте!</p>" +
            "<p>Чтобы задать новый пароль, перейдите по ссылке:</p>" +
            $"<p><a href=\"{link}\">{link}</a></p>" +
            "<p>Если вы не запрашивали сброс — проигнорируйте это письмо.</p>" +
            "<p style=\"color:#888;font-size:12px\">Ссылка действует 1 час.</p>";
        return (subject, html, plain);
    }
}
