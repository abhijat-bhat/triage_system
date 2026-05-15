"""Drug safety agent for interaction and contraindication risk detection.

Architecture:

1. Deterministic interaction screen against a curated high-risk pair list and
   simple BP-aware contraindication rules (e.g. beta blocker + hypotension).
2. Optional Mistral augmentation that can:
     * recognise medications written with brand names, misspellings, or
       class names (e.g. "ASA" -> aspirin, "Coumadin" -> warfarin),
     * surface patient-specific risks the static list cannot capture
       (e.g. NSAIDs + acute kidney injury, QT-prolonging combinations),
     * up-tier severity or flag for review when the rule engine missed a
       high-risk pattern.

The LLM cannot override the deterministic high-risk pair detection -- those
flags are marked as hard-rule flags through the ``major_``/``severe_``
markers checked in :mod:`triage_system.agents.llm_augment`.
"""

from __future__ import annotations

from itertools import combinations

from triage_system.agents.base_agent import BaseTriageAgent
from triage_system.core.constants import AgentName, TriagePriority
from triage_system.core.schemas import AgentInput, AgentOutput


HIGH_RISK_INTERACTIONS = {
    frozenset(("warfarin", "aspirin")): "bleeding_risk",
    frozenset(("warfarin", "ibuprofen")): "major_bleeding_risk",
    frozenset(("nitrate", "sildenafil")): "severe_hypotension_risk",
}


_DRUG_ALLOWED_FLAGS: set[str] = {
    "bleeding_risk",
    "major_bleeding_risk",
    "severe_hypotension_risk",
    "relative_contraindication_hypotension",
    "qt_prolongation_risk",
    "serotonin_syndrome_risk",
    "renal_nsaid_risk",
    "anticholinergic_burden",
    "opioid_benzodiazepine_combo",
    "allergy_cross_reactivity",
    "drug_disease_contraindication",
    "requires_human_review",
}


_ROLE_BLOCK = (
    "You are a medication safety analyst for emergency triage. You receive a "
    "patient's medication list, allergies, vitals, complaint, and history. "
    "Identify dangerous drug-drug, drug-disease, or drug-allergy interactions "
    "that the static rule list may have missed (consider class effects, "
    "brand-to-generic mapping, common misspellings, and patient-specific "
    "contraindications). You may only escalate or flag; you must not "
    "recommend de-escalation below an existing hard-rule trigger."
)


class DrugSafetyAgent(BaseTriageAgent[AgentInput, AgentOutput]):
    """Evaluates medication list for high-risk interactions and contraindications."""

    @property
    def agent_name(self) -> str:
        return AgentName.DRUG.value

    async def run(self, payload: AgentInput) -> AgentOutput:
        meds_raw = [m.name for m in payload.patient_input.ehr_data.medications]
        meds = [m.lower().strip() for m in meds_raw]
        allergies = payload.patient_input.ehr_data.allergies
        flags: list[str] = []

        for pair in combinations(meds, 2):
            key = frozenset(pair)
            if key in HIGH_RISK_INTERACTIONS:
                flags.append(HIGH_RISK_INTERACTIONS[key])

        systolic_bp = payload.patient_input.vitals.systolic_bp
        if "beta blocker" in meds and systolic_bp < 90:
            flags.append("relative_contraindication_hypotension")

        if any("major" in flag or "severe" in flag for flag in flags):
            triage = TriagePriority.P2
            confidence = 0.84
        elif flags:
            triage = TriagePriority.P3
            confidence = 0.72
        else:
            triage = TriagePriority.P5
            confidence = 0.60

        deterministic = AgentOutput(
            triage_level=triage,
            confidence=confidence,
            reasoning="Drug interaction screen completed against high-risk pair list.",
            flags=flags,
        )

        # Skip the LLM when there is nothing to screen or when a clearly
        # severe pattern already triggered -- the LLM cannot improve a P2
        # major-bleeding-risk verdict and would only add latency.
        if not meds_raw or any("major" in f or "severe" in f for f in flags):
            return deterministic

        complaint = self.sanitize(payload.patient_input.chief_complaint)
        history = self.sanitize(", ".join(payload.patient_input.ehr_data.history))
        allergy_text = self.sanitize(", ".join(allergies))
        meds_text = self.sanitize("; ".join(
            f"{m.name}"
            + (f" {m.dose}" if m.dose else "")
            + (f" for {m.indication}" if m.indication else "")
            for m in payload.patient_input.ehr_data.medications
        ))

        user_prompt = (
            f"Deterministic screen found flags: {flags or 'none'}; tentative {triage.value}.\n"
            f"SBP={systolic_bp}, HR={payload.patient_input.vitals.hr}, "
            f"SpO2={payload.patient_input.vitals.spo2}%.\n"
            "<patient_text>\n"
            f"Medications: {meds_text}\n"
            f"Allergies: {allergy_text}\n"
            f"Complaint: {complaint}\n"
            f"History: {history}\n"
            "</patient_text>\n"
            "Identify any additional interaction or contraindication risk."
        )
        return await self.augment(
            deterministic,
            role_block=_ROLE_BLOCK,
            user_prompt=user_prompt,
            allowed_flag_namespace=_DRUG_ALLOWED_FLAGS,
        )
