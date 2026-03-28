"""Entrypoint for running single-case and batch triage simulations."""

from __future__ import annotations

import asyncio
from pprint import pprint

from triage_system.agents.orchestrator import OrchestratorAgent
from triage_system.core.config import DEFAULT_TRIAGE_CONFIG
from triage_system.simulation.hospital_simulator import HospitalSimulator
from triage_system.simulation.scenario_generator import critical_case


async def run_single_demo() -> None:
    """Run one critical scenario and print full structured output."""
    orchestrator = OrchestratorAgent(DEFAULT_TRIAGE_CONFIG)
    output = await orchestrator.run(critical_case())

    print("=== SINGLE CASE OUTPUT ===")
    pprint(output.model_dump())


async def run_batch_demo() -> None:
    """Run all predefined scenarios and print compact summary."""
    simulator = HospitalSimulator(DEFAULT_TRIAGE_CONFIG)
    batch = await simulator.run_batch()

    print("\n=== BATCH SUMMARY ===")
    for name, output in batch.items():
        print(
            f"{name}: priority={output.final_priority.value}, "
            f"confidence={output.confidence_score:.2f}, "
            f"human_review={output.requires_human_review}"
        )


async def run_operational_simulation_demo() -> None:
    """Run a larger resource-allocation simulation and print metrics."""
    simulator = HospitalSimulator(DEFAULT_TRIAGE_CONFIG)
    result = await simulator.run_generated_simulation(
        patient_count=60,
        pattern="burst",
        scheduling_strategy="strict_priority",
        seed=42,
        db_session=None,
    )

    print("\n=== RESOURCE SIMULATION SUMMARY ===")
    print(
        f"patients_total={result.total_patients}, completed={result.completed_patients}, "
        f"pending={result.pending_patients}, events={len(result.events)}"
    )
    print("Average wait by priority:")
    for priority, wait in sorted(result.metrics.avg_wait_time_by_priority.items()):
        print(f"- {priority}: {wait:.2f} ticks")
    print("Utilization:")
    for key, value in result.metrics.utilization_stats.items():
        print(f"- {key}: {value:.2f}%")
    print("Bottlenecks:")
    if result.metrics.bottlenecks:
        for item in result.metrics.bottlenecks:
            print(f"- {item}")
    else:
        print("- none")

    print("Sample allocation decisions (first 5):")
    for decision in result.allocation_decisions[:5]:
        print(
            f"- patient={decision.patient_id} wait={decision.wait_required} "
            f"priority_score={decision.priority_score} resources={decision.assigned_resources}"
        )


async def main() -> None:
    """Execute demo flows."""
    await run_single_demo()
    await run_batch_demo()
    await run_operational_simulation_demo()


if __name__ == "__main__":
    asyncio.run(main())
