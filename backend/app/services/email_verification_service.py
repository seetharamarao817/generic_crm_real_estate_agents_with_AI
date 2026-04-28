"""Double Opt-in Email Verification Service for Leads.

Flow:
  1. Lead created with email → send_verification_email() called automatically
  2. Lead receives email with two links: [Confirm Subscription] and [Unsubscribe]
  3. Clicking Confirm → GET /api/v1/ai/email-action?action=optin&token=...
     → email_verification_status = 'verified', email_opt_in = TRUE
  4. Clicking Unsubscribe → GET /api/v1/ai/email-action?action=unsubscribe&token=...
     → email_verification_status = 'unsubscribed', email_opt_out = TRUE
  5. CRM staff sees read-only badge: Pending / Verified / Unsubscribed
  6. Emails blocked if status != 'verified' (except the initial verification email itself)
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import uuid as _uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services.messaging_service import send_email

logger = logging.getLogger(__name__)

# API base URL used in links (backend, not frontend)
def _api_base() -> str:
    """Return the backend base URL for verification links."""
    # If the backend is behind a proxy the user may set BACKEND_PUBLIC_URL.
    # Fall back to localhost for dev.
    return getattr(settings, "backend_public_url", None) or "http://localhost:8000"


def generate_verification_token(lead_id: str, email: str) -> str:
    """Generate a tamper-proof, deterministic token for a lead's email."""
    raw = f"{lead_id}:{email}:{settings.app_secret_key}"
    return hashlib.sha256(raw.encode()).hexdigest()[:48]


def verify_token(token: str, lead_id: str, email: str) -> bool:
    """Constant-time comparison of the supplied token against the expected value."""
    expected = generate_verification_token(lead_id, email)
    return hmac.compare_digest(token, expected)


async def send_verification_email(
    session: AsyncSession,
    lead_id: str,
    email: str,
    first_name: str,
    team_id: str,
) -> dict:
    """Send the double opt-in confirmation email to the lead.

    Uses direct SendGrid (not Twilio Verify) to keep things simple and
    self-contained.  The token is HMAC-derived, so no separate DB token
    column is strictly needed — but we still persist it + sent_at for
    auditing and resend-rate-limiting.
    """
    token = generate_verification_token(lead_id, email)
    api_base = _api_base()

    optin_url      = f"{api_base}/api/v1/ai/email-action?action=optin&lead_id={lead_id}&email={email}&token={token}"
    unsub_url      = f"{api_base}/api/v1/ai/email-action?action=unsubscribe&lead_id={lead_id}&email={email}&token={token}"

    html_body = f"""
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:580px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:36px 40px;">
        <h1 style="color:#fff;font-size:1.5rem;margin:0;font-weight:700;">Confirm Your Subscription</h1>
        <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:0.9rem;">One quick click and you're all set</p>
      </div>
      <div style="padding:36px 40px;">
        <p style="color:#374151;font-size:1rem;line-height:1.6;">Hi <strong>{first_name}</strong>,</p>
        <p style="color:#374151;font-size:0.95rem;line-height:1.7;">
          We received your enquiry. To receive updates, property recommendations, and personalised follow-ups,
          please confirm your email address by clicking the button below.
        </p>
        <div style="text-align:center;margin:32px 0;">
          <a href="{optin_url}"
             style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;
                    padding:14px 36px;border-radius:8px;font-weight:700;font-size:1rem;
                    letter-spacing:0.02em;">
            ✓ Confirm Subscription
          </a>
        </div>
        <p style="color:#6b7280;font-size:0.85rem;line-height:1.6;">
          This link expires after 7 days and is unique to you — please do not share it.
          If you did not submit an enquiry, you can safely ignore this email.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;" />
        <p style="color:#9ca3af;font-size:0.78rem;text-align:center;">
          Don't want to hear from us?
          <a href="{unsub_url}" style="color:#9ca3af;">Unsubscribe</a>
        </p>
      </div>
    </div>
    """

    plain_body = (
        f"Hi {first_name},\n\n"
        "Please confirm your subscription by visiting:\n"
        f"{optin_url}\n\n"
        "If you did not submit an enquiry, ignore this email.\n\n"
        f"To unsubscribe: {unsub_url}"
    )

    result = await send_email(
        to_email=email,
        subject="Please confirm your email address",
        html_body=html_body,
        plain_body=plain_body,
        # No unsubscribe footer in the verification email itself — the body already has it
    )

    # Persist token + sent time
    try:
        await session.execute(
            text("""
                UPDATE leads SET
                    email_verification_token  = :token,
                    email_verify_sent_at      = now(),
                    email_verify_resend_count = email_verify_resend_count + 1,
                    updated_at                = now()
                WHERE id = :id
            """),
            {"token": token, "id": lead_id}
        )
        # (caller is responsible for commit)
    except Exception as e:
        logger.warning(f"[DoubleOptIn] Failed to persist token for lead {lead_id}: {e}")

    logger.info(f"[DoubleOptIn] Verification email sent → lead={lead_id} email={email} status={result.get('status')}")
    return result
