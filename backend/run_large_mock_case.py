"""Run the triage pipeline on a robust synthetic large mock case."""

from __future__ import annotations

import asyncio
from pprint import pprint

from triage_system.agents.orchestrator import OrchestratorAgent
from triage_system.core.config import DEFAULT_TRIAGE_CONFIG
from triage_system.simulation.large_mock_data import robust_large_case


async def main() -> None:
    orchestrator = OrchestratorAgent(DEFAULT_TRIAGE_CONFIG)
    case = robust_large_case()
    output = await orchestrator.run(case)

    print("=== LARGE MOCK INPUT SUMMARY ===")
    print(f"History items: {len(case.ehr_data.history)}")
    print(f"Medications: {len(case.ehr_data.medications)}")
    print(f"Labs: {len(case.ehr_data.labs)}")
    print(f"Social context fields: {len(case.ehr_data.social_context)}")
    print()

    print("=== TRIAGE OUTPUT ===")
    print(f"Final priority: {output.final_priority.value}")
    print(f"Confidence: {output.confidence_score:.3f}")
    print(f"Requires human review: {output.requires_human_review}")
    print("Differential diagnosis:")
    for item in output.differential_diagnosis:
        print(f"- {item}")
    print("Recommended actions:")
    for item in output.recommended_actions:
        print(f"- {item}")
    print()

    print("=== AUDIT TRACE SUMMARY ===")
    print(f"Audit entries: {len(output.audit_log.entries)}")
    print("Stages:")
    for entry in output.audit_log.entries:
        print(f"- {entry.stage}")

    print()
    print("=== SAMPLE AUDIT PAYLOADS ===")
    worker_entry = next((e for e in output.audit_log.entries if e.stage == "worker_outputs"), None)
    if worker_entry is not None:
        pprint(worker_entry.payload)


if __name__ == "__main__":
    asyncio.run(main())
