"""Metrics and bottleneck analytics for hospital simulation runs."""

from __future__ import annotations

from collections import defaultdict

from triage_system.core.schemas import HospitalStateSnapshot, SimulationMetrics


class MetricsTracker:
    """Collects wait and utilization metrics from event-driven simulation."""

    def __init__(self) -> None:
        self.wait_times: dict[str, list[int]] = defaultdict(list)
        self._resource_time_accumulator: dict[str, float] = defaultdict(float)
        self._total_time: int = 0
        self._queue_high_watermark: int = 0
        self._queue_time_accumulator: float = 0.0
        self._queue_overflow_time: int = 0

    def record_wait(self, priority: str, wait_ticks: int) -> None:
        """Record wait duration for one completed allocation."""
        self.wait_times[priority].append(wait_ticks)

    def record_queue_size(self, size: int) -> None:
        """Track queue pressure over time."""
        self._queue_high_watermark = max(self._queue_high_watermark, size)

    def observe_interval(self, snapshot: HospitalStateSnapshot, delta_ticks: int, queue_size: int) -> None:
        """Accumulate utilization-time products over simulated interval."""
        if delta_ticks <= 0:
            return

        self._total_time += delta_ticks
        self._queue_time_accumulator += queue_size * delta_ticks
        if queue_size >= 8:
            self._queue_overflow_time += delta_ticks

        icu_occ = snapshot.icu_beds_occupied
        gen_occ = snapshot.general_beds_occupied
        vent_occ = snapshot.machines_total.get("ventilator", 0) - snapshot.machines_available.get("ventilator", 0)
        mon_occ = snapshot.machines_total.get("monitor", 0) - snapshot.machines_available.get("monitor", 0)
        ecg_occ = snapshot.machines_total.get("ecg", 0) - snapshot.machines_available.get("ecg", 0)

        self._resource_time_accumulator["icu_occupied"] += icu_occ * delta_ticks
        self._resource_time_accumulator["general_occupied"] += gen_occ * delta_ticks
        self._resource_time_accumulator["ventilator_occupied"] += vent_occ * delta_ticks
        self._resource_time_accumulator["monitor_occupied"] += mon_occ * delta_ticks
        self._resource_time_accumulator["ecg_occupied"] += ecg_occ * delta_ticks

        self._resource_time_accumulator["icu_capacity"] += snapshot.icu_beds_total * delta_ticks
        self._resource_time_accumulator["general_capacity"] += snapshot.general_beds_total * delta_ticks
        self._resource_time_accumulator["ventilator_capacity"] += snapshot.machines_total.get("ventilator", 0) * delta_ticks
        self._resource_time_accumulator["monitor_capacity"] += snapshot.machines_total.get("monitor", 0) * delta_ticks
        self._resource_time_accumulator["ecg_capacity"] += snapshot.machines_total.get("ecg", 0) * delta_ticks

    def build_metrics(self) -> SimulationMetrics:
        """Compute final metrics bundle and bottleneck flags."""
        all_priorities = ["P1", "P2", "P3", "P4", "P5"]
        avg_wait = {
            priority: (
                sum(self.wait_times.get(priority, [])) / len(self.wait_times.get(priority, []))
                if self.wait_times.get(priority, [])
                else 0.0
            )
            for priority in all_priorities
        }

        avg_queue_length = (self._queue_time_accumulator / self._total_time) if self._total_time > 0 else 0.0
        queue_overflow_pct = (100.0 * self._queue_overflow_time / self._total_time) if self._total_time > 0 else 0.0

        utilization = {
            "icu_occupancy_pct": self._safe_pct("icu_occupied", "icu_capacity"),
            "general_bed_occupancy_pct": self._safe_pct("general_occupied", "general_capacity"),
            "ventilator_usage_pct": self._safe_pct("ventilator_occupied", "ventilator_capacity"),
            "monitor_usage_pct": self._safe_pct("monitor_occupied", "monitor_capacity"),
            "ecg_usage_pct": self._safe_pct("ecg_occupied", "ecg_capacity"),
            "avg_queue_length": avg_queue_length,
            "queue_overflow_pct": queue_overflow_pct,
            "queue_peak": float(self._queue_high_watermark),
        }

        bottlenecks: list[str] = []
        if utilization["icu_occupancy_pct"] >= 85.0:
            bottlenecks.append("High ICU occupancy")
        if utilization["general_bed_occupancy_pct"] >= 85.0:
            bottlenecks.append("High general bed occupancy")

        constrained = any(
            utilization[k] >= 70.0
            for k in [
                "icu_occupancy_pct",
                "general_bed_occupancy_pct",
                "ventilator_usage_pct",
                "monitor_usage_pct",
            ]
        )

        if constrained and self._queue_high_watermark >= 10:
            bottlenecks.append(f"Queue length spike detected under constrained capacity (max={self._queue_high_watermark})")

        if constrained and (avg_queue_length >= 3.0 or queue_overflow_pct >= 20.0):
            bottlenecks.append("Sustained queue pressure with constrained resources (starvation risk)")

        return SimulationMetrics(
            avg_wait_time_by_priority=avg_wait,
            utilization_stats=utilization,
            bottlenecks=bottlenecks,
        )

    def _safe_pct(self, occupied_key: str, capacity_key: str) -> float:
        capacity = self._resource_time_accumulator.get(capacity_key, 0.0)
        if capacity <= 0:
            return 0.0
        return 100.0 * self._resource_time_accumulator.get(occupied_key, 0.0) / capacity
