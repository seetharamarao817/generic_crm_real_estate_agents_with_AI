import os
import secrets
from datetime import datetime, timedelta, timezone

from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

from app.core.config import settings

def generate_invite_token() -> str:
    return secrets.token_urlsafe(32)

async def send_invite_email(to_email: str, inviter_name: str, team_name: str, token: str) -> bool:
    """Send a magic-link invitation via SendGrid."""
    api_key = settings.sendgrid_api_key.get_secret_value() if settings.sendgrid_api_key else os.environ.get("SENDGRID_API_KEY")
    from_email = settings.sendgrid_from_email or os.environ.get("SENDGRID_FROM_EMAIL", "seetharamarao170@gmail.com")

    if not api_key:
        print(f"DEBUG (no SendGrid API Key) - would send invite to {to_email} with token: {token}")
        return True

    # Real SaaS frontend URL mapping, adjust via env if needed
    base_url = os.environ.get("FRONTEND_URL", "http://localhost:5173")
    magic_link = f"{base_url}/invite?token={token}"

    html_content = f"""
    <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
        <h2 style="color: #0f172a;">You've been invited!</h2>
        <p>Hi there,</p>
        <p><strong>{inviter_name}</strong> has invited you to join <strong>{team_name}</strong> on Acufy CRM.</p>
        <div style="margin: 30px 0;">
            <a href="{magic_link}" style="background-color: #8b5cf6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Accept Invitation</a>
        </div>
        <p style="font-size: 14px; color: #64748b;">Or, copy and paste this link down below into your browser:<br>
        <a href="{magic_link}">{magic_link}</a></p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
        <p style="font-size: 12px; color: #94a3b8;">Acufy CRM - The AI-First CRM Platform</p>
    </div>
    """

    message = Mail(
        from_email=from_email,
        to_emails=to_email,
        subject=f"Invitation to join {team_name} on Acufy CRM",
        html_content=html_content
    )

    try:
        sg = SendGridAPIClient(api_key)
        response = sg.send(message)
        return response.status_code in (200, 202)
    except Exception as e:
        print(f"Error sending email via SendGrid: {str(e)}")
        # You would typically raise or handle this properly in production
        return False
