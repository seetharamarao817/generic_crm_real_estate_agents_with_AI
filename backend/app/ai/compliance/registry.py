"""Compliance registry: loads and runs rule packs based on team configuration."""
from __future__ import annotations
from app.ai.compliance.base import ComplianceContext, PackResult, RuleViolation
from app.ai.compliance.universal import run_universal
from app.ai.compliance.real_estate import run_real_estate

PACK_REGISTRY = {
    "universal": run_universal,
    "real_estate": run_real_estate,
}


def run_compliance(ctx: ComplianceContext, rule_packs: list[str]) -> dict:
    """
    Run all specified rule packs and return combined result.
    Universal pack always runs. Real estate added when domain is real_estate.
    Returns dict suitable for storing in compliance_results JSONB column.
    """
    packs_to_run = list(set(["universal"] + rule_packs))
    pack_results: list[PackResult] = []

    for pack_id in packs_to_run:
        runner = PACK_REGISTRY.get(pack_id)
        if runner:
            result = runner(ctx)
            pack_results.append(result)

    all_violations = [v.__dict__ for pr in pack_results for v in pr.violations]
    all_warnings = [w.__dict__ for pr in pack_results for w in pr.warnings]

    has_blocks = any(v["severity"] == "block" for v in all_violations)
    overall = "fail" if has_blocks else ("warn" if all_warnings else "pass")

    return {
        "overall": overall,
        "violations": all_violations,
        "warnings": all_warnings,
        "packs_run": [pr.pack_id for pr in pack_results],
        "blocked": has_blocks,
    }
