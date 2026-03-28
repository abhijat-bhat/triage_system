"""Async-safe hospital resource state container with snapshot and reset support."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

from triage_system.core.schemas import HospitalStateSnapshot


@dataclass(slots=True)
class HospitalStateConfig:
    """Initial hospital capacity configuration."""

    available_doctors: dict[str, int] = field(default_factory=lambda: {"emergency": 4, "general": 6, "critical_care": 2})
    available_nurses: int = 14
    icu_beds_total: int = 8
    general_beds_total: int = 26
    machines_total: dict[str, int] = field(default_factory=lambda: {"ventilator": 6, "monitor": 16, "ecg": 8})


class HospitalState:
    """Mutable hospital state with async-safe resource allocation updates."""

    def __init__(self, config: HospitalStateConfig | None = None) -> None:
        self.config = config or HospitalStateConfig()
        self._lock = asyncio.Lock()
        self.reset_sync()

    def reset_sync(self) -> None:
        """Reset capacities to initial configuration in non-async contexts."""
        self.available_doctors = dict(self.config.available_doctors)
        self.available_nurses = self.config.available_nurses
        self.icu_beds_total = self.config.icu_beds_total
        self.icu_beds_occupied = 0
        self.general_beds_total = self.config.general_beds_total
        self.general_beds_occupied = 0
        self.machines_total = dict(self.config.machines_total)
        self.machines_available = dict(self.config.machines_total)

    async def reset(self) -> None:
        """Reset capacities to initial configuration in async contexts."""
        async with self._lock:
            self.reset_sync()

    async def can_allocate(self, requested: dict[str, int], doctor_specialty: str | None) -> bool:
        """Check whether requested resources are currently available."""
        async with self._lock:
            return self._can_allocate_unlocked(requested, doctor_specialty)

    async def allocate(self, requested: dict[str, int], doctor_specialty: str | None) -> bool:
        """Try to allocate requested resources atomically."""
        async with self._lock:
            if not self._can_allocate_unlocked(requested, doctor_specialty):
                return False

            doctors = requested.get("doctor", 0)
            if doctors > 0 and doctor_specialty is not None:
                self.available_doctors[doctor_specialty] -= doctors

            self.available_nurses -= requested.get("nurse", 0)
            self.icu_beds_occupied += requested.get("icu_bed", 0)
            self.general_beds_occupied += requested.get("general_bed", 0)

            for machine in ("ventilator", "monitor", "ecg"):
                self.machines_available[machine] -= requested.get(machine, 0)

            return True

    async def release(self, assigned: dict[str, int], doctor_specialty: str | None) -> None:
        """Release previously allocated resources atomically."""
        async with self._lock:
            doctors = assigned.get("doctor", 0)
            if doctors > 0 and doctor_specialty is not None:
                self.available_doctors[doctor_specialty] += doctors

            self.available_nurses += assigned.get("nurse", 0)
            self.icu_beds_occupied = max(0, self.icu_beds_occupied - assigned.get("icu_bed", 0))
            self.general_beds_occupied = max(0, self.general_beds_occupied - assigned.get("general_bed", 0))

            for machine in ("ventilator", "monitor", "ecg"):
                self.machines_available[machine] = min(
                    self.machines_total[machine],
                    self.machines_available[machine] + assigned.get(machine, 0),
                )

    async def snapshot(self) -> HospitalStateSnapshot:
        """Return immutable snapshot for allocator and metrics usage."""
        async with self._lock:
            return HospitalStateSnapshot(
                available_doctors=dict(self.available_doctors),
                available_nurses=self.available_nurses,
                icu_beds_total=self.icu_beds_total,
                icu_beds_occupied=self.icu_beds_occupied,
                general_beds_total=self.general_beds_total,
                general_beds_occupied=self.general_beds_occupied,
                machines_total=dict(self.machines_total),
                machines_available=dict(self.machines_available),
            )

    def _can_allocate_unlocked(self, requested: dict[str, int], doctor_specialty: str | None) -> bool:
        doctors = requested.get("doctor", 0)
        nurses = requested.get("nurse", 0)
        icu = requested.get("icu_bed", 0)
        general = requested.get("general_bed", 0)

        if doctors > 0:
            if doctor_specialty is None:
                return False
            if self.available_doctors.get(doctor_specialty, 0) < doctors:
                return False

        if self.available_nurses < nurses:
            return False

        if (self.icu_beds_total - self.icu_beds_occupied) < icu:
            return False

        if (self.general_beds_total - self.general_beds_occupied) < general:
            return False

        for machine in ("ventilator", "monitor", "ecg"):
            if self.machines_available.get(machine, 0) < requested.get(machine, 0):
                return False

        return True
