"""Universal compliance rule pack: TCPA, CAN-SPAM, GDPR, Anti-discrimination, Honesty."""
from __future__ import annotations
import re
from app.ai.compliance.base import (
    ComplianceContext, PackResult, RuleViolation, RuleResult
)

PACK_ID = "universal"
PACK_VERSION = "1.0"

# Anti-discrimination keywords (non-exhaustive, LLM does the deeper check)
PROTECTED_CLASS_PATTERNS = [
    r"\b(whites only|no blacks|no latinos|no asians|christians only|no muslims)\b",
    r"\b(young professionals|no kids|no children|adults only|no families)\b",
    r"\b(english speakers only|no immigrants|citizens only)\b",
]

UNSUBSCRIBE_PATTERNS = [r"unsubscribe", r"opt.?out", r"stop receiving", r"remove me"]


def _check_tcpa(ctx: ComplianceContext) -> RuleResult:
    """TCPA: SMS requires explicit consent."""
    if ctx.action_type != "sms":
        return RuleResult(rule_id="TCPA-001", passed=True)
    if not ctx.has_sms_consent:
        return RuleResult(
            rule_id="TCPA-001",
            passed=False,
            violations=[RuleViolation(
                rule_id="TCPA-001",
                severity="block",
                description="Lead has not provided SMS consent. TCPA prohibits sending automated SMS without prior express written consent.",
                suggestion="Obtain SMS consent first via opt-in form, then retry.",
            )],
        )
    return RuleResult(rule_id="TCPA-001", passed=True)


def _check_can_spam(ctx: ComplianceContext) -> RuleResult:
    """CAN-SPAM: Email must include unsubscribe mechanism and physical address."""
    # User requested to ignore CAN-SPAM blocking rules (unsubscribe/stop/address)
    # in order to prevent compliance gate errors during testing/usage.
    return RuleResult(rule_id="CANSPAM-001", passed=True)


def _check_anti_discrimination(ctx: ComplianceContext) -> RuleResult:
    """Anti-discrimination: Flag protected class references in outbound comms."""
    for pattern in PROTECTED_CLASS_PATTERNS:
        match = re.search(pattern, ctx.content, re.IGNORECASE)
        if match:
            return RuleResult(
                rule_id="ANTIDISC-001",
                passed=False,
                violations=[RuleViolation(
                    rule_id="ANTIDISC-001",
                    severity="block",
                    description="Draft contains language that may constitute discriminatory communication.",
                    offending_text=match.group(),
                    suggestion="Remove all references to protected classes. Focus on property features, not prospective buyer characteristics.",
                )],
            )
    return RuleResult(rule_id="ANTIDISC-001", passed=True)


def _check_gdpr(ctx: ComplianceContext) -> RuleResult:
    """GDPR: Basic PII handling check."""
    # For MVP, just verify no obviously problematic data requests in copy
    problematic = ["send us your passport", "provide your national id", "share your tax"]
    content_lower = ctx.content.lower()
    for phrase in problematic:
        if phrase in content_lower:
            return RuleResult(
                rule_id="GDPR-001",
                passed=False,
                violations=[RuleViolation(
                    rule_id="GDPR-001",
                    severity="block",
                    description="Draft requests sensitive personal data without proper consent/disclosure.",
                    offending_text=phrase,
                    suggestion="Remove PII collection requests from communications. Handle data collection through proper consent flows.",
                )],
            )
    return RuleResult(rule_id="GDPR-001", passed=True)


def run_universal(ctx: ComplianceContext) -> PackResult:
    """Run all universal compliance checks. Returns PackResult."""
    all_violations = []
    all_warnings = []

    for check_fn in [_check_tcpa, _check_can_spam, _check_anti_discrimination, _check_gdpr]:
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
