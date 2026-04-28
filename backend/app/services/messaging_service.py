"""Twilio SMS + SendGrid Email communication service.

IMPORTANT: Uses the application Settings object (pydantic-settings) which
correctly loads .env at startup. Raw os.environ.get() at module-load time
does NOT work with pydantic-settings because the .env is loaded into the
Settings model, not into os.environ.
"""
from __future__ import annotations

import logging
from app.core.config import settings

logger = logging.getLogger(__name__)


def _get_secret(field) -> str:
    """Unwrap pydantic SecretStr or return plain string."""
    if field is None:
        return ""
    if hasattr(field, "get_secret_value"):
        return field.get_secret_value()
    return str(field)


def _build_unsubscribe_footer(unsub_url: str | None) -> str:
    """Return HTML + plain-text unsubscribe footer."""
    if not unsub_url:
        return ""
    return f"""
<hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0;" />
<p style="font-size:12px;color:#6b7280;text-align:center;margin:0;">
  You received this email because you opted in to receive updates from us.<br/>
  <a href="{unsub_url}" style="color:#6b7280;text-decoration:underline;">
    Unsubscribe / Opt-out
  </a>
</p>
"""


async def send_sms(
    to_number: str,
    body: str,
    opt_out_message: str | None = None,
) -> dict:
    """Send SMS via Twilio. Returns status dict."""
    sid = settings.twilio_account_sid
    if not sid:
        logger.info(f"[DEV] SMS skipped (TWILIO_ACCOUNT_SID not set). Target: {to_number}")
        return {"status": "dev_mock", "to": to_number}

    # Append opt-out instruction if not already present
    full_body = body
    if opt_out_message:
        full_body = f"{body}\n\n{opt_out_message}"

    try:
        from twilio.rest import Client
        client = Client(sid, _get_secret(settings.twilio_auth_token))
        message = client.messages.create(
            messaging_service_sid=settings.twilio_messaging_service_sid,
            to=to_number,
            body=full_body[:1600],  # SMS char limit (multi-part allowed)
        )
        return {"status": message.status, "sid": message.sid, "to": to_number}
    except Exception as e:
        logger.error(f"[TWILIO] Send failed: {e}")
        return {"status": "error", "error": str(e)}


async def send_email(
    to_email: str,
    subject: str,
    html_body: str,
    plain_body: str = "",
    unsubscribe_url: str | None = None,
    reply_to: str | None = None,
) -> dict:
    """Send email via SendGrid. Returns status dict.

    Args:
        unsubscribe_url: When provided, injected as a footer link and as the
                         RFC 8058 List-Unsubscribe header so email clients show
                         a native one-click unsubscribe button.
    """
    api_key = _get_secret(settings.sendgrid_api_key)
    from_email = settings.sendgrid_from_email or "seetharamarao170@gmail.com"

    if not api_key:
        logger.info(f"[DEV] Email skipped (SENDGRID_API_KEY not set). Target: {to_email}")
        return {"status": "dev_mock", "to": to_email}

    # Inject unsubscribe footer into HTML
    full_html = html_body
    if unsubscribe_url:
        full_html = html_body + _build_unsubscribe_footer(unsubscribe_url)

    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail, ReplyTo, Header

        message = Mail(
            from_email=from_email,
            to_emails=to_email,
            subject=subject,
            html_content=full_html,
            plain_text_content=(plain_body or "") + (
                f"\n\nTo unsubscribe, visit: {unsubscribe_url}" if unsubscribe_url else ""
            ),
        )

        # RFC 8058 List-Unsubscribe header (shows native unsub button in Gmail, Apple Mail…)
        if unsubscribe_url:
            message.header = Header(
                "List-Unsubscribe",
                f"<{unsubscribe_url}>, <mailto:{from_email}?subject=unsubscribe>"
            )

        if reply_to:
            message.reply_to = ReplyTo(reply_to)

        sg = SendGridAPIClient(api_key)
        response = sg.send(message)
        logger.info(f"[SENDGRID] ✅ Sent to {to_email}, status={response.status_code}")
        return {
            "status": "sent",
            "status_code": response.status_code,
            "to": to_email,
            "from": from_email,
        }
    except Exception as e:
        logger.error(f"[SENDGRID] ❌ Failed for {to_email}: {e}")
        return {"status": "error", "error": str(e)}
