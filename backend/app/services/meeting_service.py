"""Meeting scheduler service — Google Calendar integration + SMS/Email notifications."""
from __future__ import annotations

import json
import urllib.parse
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog

from app.services.messaging_service import send_email, send_sms
from app.core.config import settings

logger = structlog.get_logger(__name__)

async def create_video_meeting(
    user: Any,
    title: str,
    scheduled_at: datetime,
    duration_minutes: int,
    description: str = "",
    attendee_email: str | None = None,
) -> dict[str, str | None]:
    """
    Creates a video meeting link. 
    Returns {"meet_link": str, "calendar_link": str, "event_id": str}
    Falls back to Jitsi if Google fails.
    """
    # 1. Fallback Jitsi link (always available)
    import uuid
    safe_title = "".join(c for c in title if c.isalnum())
    jitsi_link = f"https://meet.jit.si/acufy-{safe_title}-{uuid.uuid4().hex[:8]}"
    
    result = {
        "meet_link": jitsi_link,
        "calendar_link": None,
        "event_id": None,
        "provider": "jitsi"
    }

    # 2. Try Google if connected
    tokens = user.google_calendar_token
    if not tokens or not tokens.get("refresh_token") or not settings.google_client_id:
        return result

    try:
        # Check if we need to refresh token
        # (Simplified: we always refresh for reliability during the meeting create)
        refresh_data = await refresh_google_token(
            tokens["refresh_token"],
            settings.google_client_id,
            settings.google_client_secret.get_secret_value()
        )
        access_token = refresh_data["access_token"]
        
        # Create event
        event = await create_google_calendar_event(
            access_token=access_token,
            title=title,
            scheduled_at=scheduled_at,
            duration_minutes=duration_minutes,
            description=description,
            attendee_email=attendee_email,
            create_meet=True
        )
        
        # Extract Meet link
        meet_link = None
        conf = event.get("conferenceData", {})
        entry_points = conf.get("entryPoints", [])
        for ep in entry_points:
            if ep.get("entryPointType") == "video":
                meet_link = ep.get("uri")
                break
        
        return {
            "meet_link": meet_link or jitsi_link,
            "calendar_link": event.get("htmlLink"),
            "event_id": event.get("id"),
            "provider": "google" if meet_link else "jitsi"
        }
        
    except Exception as e:
        logger.error("Google Meet creation failed, falling back to Jitsi", error=str(e))
        return result

async def sync_task_to_google_calendar(
    user: Any,
    title: str,
    due_date: datetime,
    description: str = "",
) -> dict[str, str | None]:
    """
    Creates a 30-minute block on Google Calendar for a Task.
    Returns {"calendar_link": str, "event_id": str}
    """
    result = {"calendar_link": None, "event_id": None}
    
    tokens = user.google_calendar_token
    if not tokens or not tokens.get("refresh_token") or not settings.google_client_id:
        return result

    try:
        refresh_data = await refresh_google_token(
            tokens["refresh_token"],
            settings.google_client_id,
            settings.google_client_secret.get_secret_value()
        )
        access_token = refresh_data["access_token"]
        
        event = await create_google_calendar_event(
            access_token=access_token,
            title=f"✓ Task: {title or 'Untitled Task'}",
            scheduled_at=due_date,
            duration_minutes=30,
            description=description,
            create_meet=False
        )
        
        result["calendar_link"] = event.get("htmlLink")
        result["event_id"] = event.get("id")
        return result
        
    except Exception as e:
        logger.error("Google Task sync failed", error=str(e))
        return result

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3"


def build_google_auth_url(client_id: str, redirect_uri: str, state: str) -> str:
    """Build Google OAuth2 authorization URL requesting calendar scope."""
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/calendar openid email profile",
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return f"{GOOGLE_AUTH_URL}?{urllib.parse.urlencode(params)}"


async def exchange_google_code(
    code: str,
    client_id: str,
    client_secret: str,
    redirect_uri: str,
) -> dict[str, Any]:
    """Exchange authorization code for access + refresh tokens."""
    import httpx
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        resp.raise_for_status()
        return resp.json()


async def refresh_google_token(
    refresh_token: str,
    client_id: str,
    client_secret: str,
) -> dict[str, Any]:
    """Refresh an expired access token."""
    import httpx
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "refresh_token": refresh_token,
                "client_id": client_id,
                "client_secret": client_secret,
                "grant_type": "refresh_token",
            },
        )
        resp.raise_for_status()
        return resp.json()


async def create_google_calendar_event(
    access_token: str,
    title: str,
    scheduled_at: datetime,
    duration_minutes: int,
    description: str = "",
    location: str = "",
    attendee_email: str | None = None,
    create_meet: bool = True,
) -> dict[str, Any]:
    """Create a Google Calendar event and optionally add a Meet link."""
    import httpx

    end_at = scheduled_at + timedelta(minutes=duration_minutes)
    event_body: dict[str, Any] = {
        "summary": title,
        "description": description,
        "location": location,
        "start": {
            "dateTime": scheduled_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "timeZone": "UTC",
        },
        "end": {
            "dateTime": end_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "timeZone": "UTC",
        },
    }

    if create_meet:
        event_body["conferenceData"] = {
            "createRequest": {
                "requestId": f"meet-{scheduled_at.timestamp()}",
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }
        }

    if attendee_email:
        event_body["attendees"] = [{"email": attendee_email}]

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{GOOGLE_CALENDAR_API}/calendars/primary/events",
            params={"conferenceDataVersion": 1} if create_meet else {},
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json=event_body,
        )
        resp.raise_for_status()
        return resp.json()


def _format_meeting_datetime_ist(dt: datetime) -> str:
    """Format datetime to IST-friendly string."""
    from datetime import timezone as tz
    ist_offset = timedelta(hours=5, minutes=30)
    ist_time = dt.astimezone(timezone.utc) + ist_offset
    return ist_time.strftime("%A, %d %B %Y at %I:%M %p IST")


async def send_meeting_sms(
    phone: str,
    lead_name: str,
    meeting_title: str,
    scheduled_at: datetime,
    meeting_type: str,
    location: str | None,
    meet_link: str | None,
) -> dict[str, Any]:
    """Send meeting confirmation SMS via Twilio."""
    dt_str = _format_meeting_datetime_ist(scheduled_at)

    if meeting_type == "inperson":
        detail = f"Location: {location or 'To be shared'}"
    elif meeting_type == "video":
        detail = f"Video Link: {meet_link or 'Link will be shared'}"
    else:
        detail = "We'll call you at your registered number"

    message = (
        f"Hi {lead_name}, your meeting '{meeting_title}' is confirmed for {dt_str}. "
        f"{detail}. "
        f"Reply STOP to opt out."
    )

    try:
        return await send_sms(phone, message)
    except Exception as e:
        logger.error("SMS send failed", error=str(e), phone=phone)
        return {"error": str(e)}


async def send_meeting_email(
    email: str,
    lead_name: str,
    meeting_title: str,
    scheduled_at: datetime,
    duration_minutes: int,
    meeting_type: str,
    location: str | None,
    meet_link: str | None,
    calendar_link: str | None,
    notes: str | None,
) -> dict[str, Any]:
    """Send meeting confirmation email via SendGrid."""
    dt_str = _format_meeting_datetime_ist(scheduled_at)
    type_label = {"call": "Phone Call", "video": "Video Meeting", "inperson": "In-Person Visit"}.get(meeting_type, meeting_type)

    if meeting_type == "inperson":
        location_html = f"<p><strong>Location:</strong> {location or 'To be confirmed'}</p>"
    elif meeting_type == "video" and meet_link:
        location_html = f'<p><strong>Join Meeting:</strong> <a href="{meet_link}" style="color:#6366f1;">{meet_link}</a></p>'
    else:
        location_html = "<p><strong>Mode:</strong> We will call you at your registered number.</p>"

    cal_html = f'<p><a href="{calendar_link}" style="background:#6366f1;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:8px;">📅 Add to Google Calendar</a></p>' if calendar_link else ""
    notes_html = f"<p><strong>Notes:</strong> {notes}</p>" if notes else ""

    html_body = f"""
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:24px;border-radius:16px;">
      <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;border-radius:12px;text-align:center;margin-bottom:24px;">
        <h1 style="color:white;margin:0;font-size:24px;">📅 Meeting Confirmed</h1>
        <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;">Your appointment has been scheduled</p>
      </div>

      <div style="background:white;padding:24px;border-radius:12px;border:1px solid #e2e8f0;">
        <p style="color:#475569;margin:0 0 16px;">Dear <strong>{lead_name}</strong>,</p>
        <p style="color:#475569;">Your meeting has been confirmed. Here are the details:</p>

        <div style="background:#f1f5f9;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#1e293b;">{meeting_title}</p>
          <p style="margin:4px 0;color:#475569;"><strong>Type:</strong> {type_label}</p>
          <p style="margin:4px 0;color:#475569;"><strong>Date & Time:</strong> {dt_str}</p>
          <p style="margin:4px 0;color:#475569;"><strong>Duration:</strong> {duration_minutes} minutes</p>
          {location_html}
          {notes_html}
        </div>

        {cal_html}

        <p style="color:#94a3b8;font-size:12px;margin-top:24px;">
          If you have any questions, please contact us. Reply to this email to opt out of communications.
        </p>
      </div>
    </div>
    """

    try:
        return await send_email(email, f"Meeting Confirmed: {meeting_title}", html_body)
    except Exception as e:
        logger.error("Email send failed", error=str(e), email=email)
        return {"error": str(e)}
