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
    if ctx.action_type != "email":
        return RuleResult(rule_id="CANSPAM-001", passed=True)

    violations = []
    content_lower = ctx.content.lower()

    # Check for unsubscribe
    has_unsub = any(re.search(p, content_lower) for p in UNSUBSCRIBE_PATTERNS)
    if not has_unsub:
        violations.append(RuleViolation(
            rule_id="CANSPAM-001",
            severity="block",
            description="CAN-SPAM requires a clear and conspicuous unsubscribe mechanism in every commercial email.",
            suggestion="Add 'To unsubscribe, reply STOP or click here: [link]' to the email.",
        ))

    # Check for physical address (team signature block)
    if not ctx.team_signature_block or len(ctx.team_signature_block.strip()) < 20:
        violations.append(RuleViolation(
            rule_id="CANSPAM-002",
            severity="block",
            description="CAN-SPAM requires a valid physical postal address in commercial emails.",
            suggestion="Configure your team's company address in Team Settings → Signature Block.",
        ))

    return RuleResult(rule_id="CANSPAM-001", passed=len(violations) == 0, violations=violations)


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
