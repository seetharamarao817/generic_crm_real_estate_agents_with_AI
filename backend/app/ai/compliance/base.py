"""Compliance rule and rule pack protocol interfaces."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Literal, Protocol


@dataclass
class RuleViolation:
    rule_id: str
    severity: Literal["block", "warn"]
    description: str
    offending_text: str | None = None
    suggestion: str | None = None


@dataclass
class RuleResult:
    rule_id: str
    passed: bool
    violations: list[RuleViolation] = field(default_factory=list)
    warnings: list[RuleViolation] = field(default_factory=list)


@dataclass
class ComplianceContext:
    team_id: str
    lead_id: str | None
    content: str               # The draft text to check
    action_type: str           # email | sms
    to_email: str | None = None
    to_phone: str | None = None
    has_sms_consent: bool = False
    has_email_consent: bool = True
    team_signature_block: str | None = None  # Physical address for CAN-SPAM


@dataclass
class PackResult:
    pack_id: str
    pack_version: str
    overall: Literal["pass", "fail", "warn"]
    violations: list[RuleViolation] = field(default_factory=list)
    warnings: list[RuleViolation] = field(default_factory=list)
