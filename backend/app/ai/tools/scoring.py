"""P2P (Propensity to Purchase) scoring algorithm.

Factors and weights:
- Budget alignment vs product price: 0-30 pts
- Timeline urgency: 0-25 pts
- Property preference match: 0-20 pts
- Engagement quality: 0-15 pts
- Lead source credibility: 0-10 pts
"""
from __future__ import annotations
from typing import Any


TIMELINE_SCORES = {
    "immediate": 25,
    "3months": 18,
    "6months": 12,
    "1year": 5,
    "flexible": 8,
    "unknown": 3,
}

SOURCE_SCORES = {
    "campaign": 10,
    "referral": 9,
    "website": 8,
    "portal": 7,
    "walk-in": 6,
    "cold-call": 4,
    "social": 5,
}


def calculate_p2p(
    lead: dict,
    product: dict | None = None,
) -> dict[str, Any]:
    """
    Calculate P2P score for a lead.

    Args:
        lead: Lead record as dict (must have budget_min, budget_max, timeline, property_preferences, etc.)
        product: Product/listing record as dict (must have price, property_details)

    Returns:
        {score: int, breakdown: dict, priority: str, summary: str, next_action: str}
    """
    breakdown: dict[str, Any] = {}
    total = 0

    # ─── 1. Budget Alignment (0-30 pts) ──────────────────────────────────────
    budget_score = 0
    budget_note = "No budget vs product comparison available"
    if product and product.get("price") and (lead.get("budget_min") or lead.get("budget_max")):
        product_price = float(product["price"])
        b_min = float(lead.get("budget_min") or 0)
        b_max = float(lead.get("budget_max") or b_min * 2)

        if b_max == 0:
            b_max = b_min * 1.5

        if product_price <= 0:
            budget_score = 15
            budget_note = "Product price not set"
        elif b_min <= product_price <= b_max:
            # Perfect fit — product is within budget range
            budget_score = 30
            budget_note = f"Product price (₹{product_price:,.0f}) within budget range"
        elif product_price < b_min:
            # Under budget — might be looking for something more premium
            ratio = product_price / b_min
            budget_score = max(5, int(30 * ratio))
            budget_note = f"Product (₹{product_price:,.0f}) is below minimum budget (₹{b_min:,.0f})"
        elif product_price <= b_max * 1.2:
            # Slightly over max budget — stretch buy possible
            budget_score = 18
            budget_note = f"Product slightly above max budget but within reach"
        else:
            # Too expensive
            ratio = b_max / product_price
            budget_score = max(2, int(30 * ratio * 0.5))
            budget_note = f"Product (₹{product_price:,.0f}) significantly exceeds budget (₹{b_max:,.0f})"
    elif not product:
        budget_score = 15  # No product to compare, neutral
        budget_note = "No product linked for budget comparison"
    else:
        budget_score = 10  # Budget not specified
        budget_note = "Lead has not specified budget"

    breakdown["budget_alignment"] = {"score": budget_score, "max": 30, "note": budget_note}
    total += budget_score

    # ─── 2. Timeline Urgency (0-25 pts) ──────────────────────────────────────
    timeline = (lead.get("timeline") or "unknown").lower()
    timeline_score = TIMELINE_SCORES.get(timeline, TIMELINE_SCORES["unknown"])
    breakdown["timeline_urgency"] = {
        "score": timeline_score,
        "max": 25,
        "note": f"Timeline: {timeline}",
    }
    total += timeline_score

    # ─── 3. Property Preference Match (0-20 pts) ──────────────────────────────
    pref_score = 0
    pref_note = "No property preferences specified"
    prefs = lead.get("property_preferences") or {}
    product_details = (product or {}).get("property_details") or {}

    if prefs:
        matches = 0
        checks = 0

        # Check property type match
        if prefs.get("property_type") and product_details.get("property_type"):
            checks += 1
            if prefs["property_type"].lower() == product_details["property_type"].lower():
                matches += 1

        # Check location match
        if prefs.get("location") and product_details.get("location"):
            checks += 1
            lead_loc = prefs["location"].lower()
            prod_loc = product_details["location"].lower()
            if lead_loc in prod_loc or prod_loc in lead_loc:
                matches += 1

        # Check bedroom/size match
        if prefs.get("bedrooms") and product_details.get("bedrooms"):
            checks += 1
            if abs(int(prefs["bedrooms"]) - int(product_details["bedrooms"])) <= 1:
                matches += 1

        # Check furnishing match
        if prefs.get("furnishing") and product_details.get("furnishing"):
            checks += 1
            if prefs["furnishing"].lower() == product_details["furnishing"].lower():
                matches += 1

        # More detailed preferences provided = signal of serious buyer
        detail_bonus = min(5, len(prefs) * 1)

        if checks > 0:
            pref_score = int((matches / checks) * 15) + detail_bonus
        else:
            pref_score = 8 + detail_bonus  # Has preferences but can't match

        pref_note = f"{matches}/{checks} preferences matched, {len(prefs)} preferences specified"
    else:
        pref_score = 5  # No preferences = less specific, less serious

    pref_score = min(20, pref_score)
    breakdown["preference_match"] = {"score": pref_score, "max": 20, "note": pref_note}
    total += pref_score

    # ─── 4. Engagement Quality (0-15 pts) ─────────────────────────────────────
    request_count = int(lead.get("request_count") or 1)
    meeting_count = int(lead.get("meeting_count") or 0)

    engagement_score = min(15, (request_count - 1) * 3 + meeting_count * 5 + 3)
    engagement_note = f"{request_count} inquiry(ies), {meeting_count} meeting(s)"
    breakdown["engagement"] = {"score": engagement_score, "max": 15, "note": engagement_note}
    total += engagement_score

    # ─── 5. Lead Source (0-10 pts) ───────────────────────────────────────────
    source = (lead.get("source") or "unknown").lower()
    source_score = SOURCE_SCORES.get(source, 3)
    breakdown["lead_source"] = {"score": source_score, "max": 10, "note": f"Source: {source}"}
    total += source_score

    # ─── Final Score ──────────────────────────────────────────────────────────
    score = min(100, total)

    if score >= 75:
        priority = "hot"
        next_action = "Schedule site visit or video call immediately"
        summary = f"Highly motivated lead with {timeline} timeline and well-aligned preferences. Prioritize immediate outreach."
    elif score >= 50:
        priority = "warm"
        next_action = "Send personalized property brochure and follow-up within 48h"
        summary = f"Qualified lead showing genuine interest. Timeline and budget partially aligned. nurture with relevant content."
    elif score >= 30:
        priority = "warm"
        next_action = "Add to nurture sequence, follow up in 1 week"
        summary = f"Early-stage prospect. Budget or timeline not fully confirmed. Nurture with educational content."
    else:
        priority = "cold"
        next_action = "Add to long-term nurture list, low priority for active outreach"
        summary = f"Low engagement or poor budget/preference fit. Include in periodic broadcasts but don't prioritize active follow-up."

    return {
        "score": score,
        "breakdown": breakdown,
        "priority": priority,
        "summary": summary,
        "next_action": next_action,
    }
