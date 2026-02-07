import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import config


class EmailProvider:
    def send_email(
        self,
        *,
        to_email: str,
        subject: str,
        text: str,
        html: str | None = None,
        reply_to: str | None = None,
    ) -> None:
        raise NotImplementedError


class SMTPEmailProvider(EmailProvider):
    def __init__(
        self,
        *,
        host: str,
        port: int,
        user: str | None,
        password: str | None,
        use_tls: bool,
        use_ssl: bool,
        email_from: str,
    ) -> None:
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.use_tls = use_tls
        self.use_ssl = use_ssl
        self.email_from = email_from

    def send_email(
        self,
        *,
        to_email: str,
        subject: str,
        text: str,
        html: str | None = None,
        reply_to: str | None = None,
    ) -> None:
        if html:
            message = MIMEMultipart("alternative")
            message.attach(MIMEText(text, "plain", "utf-8"))
            message.attach(MIMEText(html, "html", "utf-8"))
        else:
            message = MIMEText(text, "plain", "utf-8")

        message["Subject"] = subject
        message["From"] = self.email_from
        message["To"] = to_email
        if reply_to:
            message["Reply-To"] = reply_to

        if self.use_ssl:
            with smtplib.SMTP_SSL(self.host, self.port) as server:
                if self.user:
                    server.login(self.user, self.password or "")
                server.send_message(message)
        else:
            with smtplib.SMTP(self.host, self.port) as server:
                if self.use_tls:
                    server.starttls()
                if self.user:
                    server.login(self.user, self.password or "")
                server.send_message(message)


def build_email_provider_from_config() -> EmailProvider | None:
    if not config.EMAIL_ENABLED:
        return None
    if not config.EMAIL_FROM:
        raise ValueError("EMAIL_FROM must be set when EMAIL_ENABLED is true.")
    if not config.SMTP_HOST:
        raise ValueError("SMTP_HOST must be set when EMAIL_ENABLED is true.")

    return SMTPEmailProvider(
        host=config.SMTP_HOST,
        port=config.SMTP_PORT,
        user=config.SMTP_USER,
        password=config.SMTP_PASSWORD,
        use_tls=config.SMTP_USE_TLS,
        use_ssl=config.SMTP_USE_SSL,
        email_from=config.EMAIL_FROM,
    )
