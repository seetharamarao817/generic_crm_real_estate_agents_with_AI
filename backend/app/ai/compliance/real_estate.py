"""Real Estate compliance pack: Fair Housing Act, steering, accurate property claims."""
from __future__ import annotations
import re
from app.ai.compliance.base import ComplianceContext, PackResult, RuleViolation, RuleResult

PACK_ID = "real_estate"
PACK_VERSION = "1.0"

# Fair Housing Act protected class language
FHA_STEERING_PATTERNS = [
    r"\b(perfect for (families|singles|couples|young people|retirees|seniors))\b",
    r"\b(great (neighborhood|area|community) for (your|a) (type|kind|people like you))\b",
    r"\b(quiet|safe|good schools|nice area)\b",  # These phrases can imply steering
    r"\b(exclusive|prestigious|elite|high-class) (community|neighborhood|area)\b",
    r"\b(blockbusting|redlining|steering)\b",
    r"\b(no section 8|cash buyers only)\b",
]

# Property claim red flags
UNSUPPORTED_CLAIM_PATTERNS = [
    r"\b(guaranteed|100% sure|definitely will|absolutely)\b",
    r"\b(best investment|can't lose|sure profit|guaranteed returns)\b",
    r"\b(approve[d]? for|will qualify for)\b",
]


def _check_fair_housing(ctx: ComplianceContext) -> RuleResult:
    """Fair Housing Act: no steering, no discrimination by protected class."""
    violations = []
    warnings = []
    content_lower = ctx.content.lower()

    for pattern in FHA_STEERING_PATTERNS:
        match = re.search(pattern, content_lower, re.IGNORECASE)
        if match:
            # Determine severity: explicit discrimination = block, implicit = warn
            is_explicit = any(kw in match.group().lower() for kw in
                               ["no section 8", "cash buyers only", "blockbusting", "redlining"])
            violation = RuleViolation(
                rule_id="FHA-001",
                severity="block" if is_explicit else "warn",
                description="Draft contains language that may violate the Fair Housing Act.",
                offending_text=match.group(),
                suggestion="Focus on property features, amenities, and objective facts. Avoid characterizing neighborhoods in ways that could imply preference based on protected class.",
            )
            if is_explicit:
                violations.append(violation)
            else:
                warnings.append(violation)

    return RuleResult(rule_id="FHA-001", passed=len(violations) == 0, violations=violations, warnings=warnings)


def _check_property_claims(ctx: ComplianceContext) -> RuleResult:
    """No unsupported investment or financing claims."""
    warnings = []
    for pattern in UNSUPPORTED_CLAIM_PATTERNS:
        match = re.search(pattern, ctx.content, re.IGNORECASE)
        if match:
            warnings.append(RuleViolation(
                rule_id="RE-002",
                severity="warn",
                description="Draft contains unsupported or absolute investment/financing claims.",
                offending_text=match.group(),
                suggestion="Replace absolute claims with qualified language: 'historically strong returns', 'may qualify for', 'based on current market trends'.",
            ))
    return RuleResult(rule_id="RE-002", passed=True, warnings=warnings)


def run_real_estate(ctx: ComplianceContext) -> PackResult:
    """Run all real estate compliance checks."""
    all_violations = []
    all_warnings = []

    for check_fn in [_check_fair_housing, _check_property_claims]:
        result = check_fn(ctx)
        all_violations.extend(result.violations)
        all_warnings.extend(result.warnings)

    if all_violations:
        overall = "fail"
    elif all_warnings:
        overall = "warn"
    else:
        overall = "pass"

    return PackResult(
        pack_id=PACK_ID,
        pack_version=PACK_VERSION,
        overall=overall,
        violations=all_violations,
        warnings=all_warnings,
    )
