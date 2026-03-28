"""Hospital triage orchestrator for routing, parallel execution, and synthesis."""

from __future__ import annotations

from triage_system.agents.drug_agent import DrugSafetyAgent
from triage_system.agents.guidelines_agent import GuidelinesAgent
from triage_system.agents.nlp_agent import NLPAgent
from triage_system.agents.social_agent import SocialRiskAgent
from triage_system.agents.vitals_agent import VitalsAgent
from triage_system.agents.vision_agent_stub import VisionAgentStub
from triage_system.aggregation.voting import WeightedVotingAggregator
from triage_system.core.config import TriageConfig
from triage_system.core.constants import DEFAULT_DIFFERENTIALS, DEFAULT_RECOMMENDED_ACTIONS, AgentName
from triage_system.core.schemas import AgentInput, AgentOutput, PatientInput, TriageOutput
from triage_system.critique.self_critique import SelfCritiqueModule
from triage_system.preprocessing.deidentification import DeIdentificationModule
from triage_system.preprocessing.fhir_formatter import FHIRFormatter
from triage_system.utils.async_runner import run_parallel
from triage_system.utils.logger import AuditLogger


class OrchestratorAgent:
    """Main coordinator for deterministic routing and parallel worker execution."""

    def __init__(self, config: TriageConfig) -> None:
        self.config = config
        self.deident = DeIdentificationModule()
        self.formatter = FHIRFormatter()
        self.aggregator = WeightedVotingAggregator()
        self.critique = SelfCritiqueModule()

        self.nlp_agent = NLPAgent(config)
        self.vitals_agent = VitalsAgent(config)
        self.drug_agent = DrugSafetyAgent(config)
        self.guidelines_agent = GuidelinesAgent(config)
        self.social_agent = SocialRiskAgent(config)
        self.vision_agent = VisionAgentStub(config)

    async def run(self, patient_input: PatientInput) -> TriageOutput:
        """Execute full triage pipeline and return final typed triage output."""
        audit = AuditLogger()
        audit.record("input_received", patient_input.model_dump())

        deidentified = self.deident.run(patient_input)
        audit.record("deidentification_complete", deidentified.model_dump())

        fhir_bundle = self.formatter.format(deidentified)
        audit.record("fhir_normalization_complete", fhir_bundle.model_dump())

        agent_input = AgentInput(patient_input=deidentified, fhir_bundle=fhir_bundle)
        selected_agents = self._deterministic_routing(agent_input)
        audit.record("routing_decision", {"selected_agents": [name.value for name in selected_agents]})

        task_map = {
            name.value: self._run_single(name, agent_input)
            for name in selected_agents
        }
        raw_results = await run_parallel(task_map)

        outputs: dict[AgentName, AgentOutput] = {
            AgentName(name): raw_results[name] for name in raw_results
        }
        audit.record(
            "worker_outputs",
            {k.value: v.model_dump() for k, v in outputs.items()},
        )

        aggregation = self.aggregator.aggregate(outputs=outputs, config=self.config)
        audit.record("aggregation_complete", aggregation.model_dump())

        critique = self.critique.evaluate(outputs=outputs, aggregation=aggregation, config=self.config)
        audit.record("self_critique_complete", critique.model_dump())

        final_priority = critique.revised_triage or aggregation.final_priority
        final_output = TriageOutput(
            final_priority=final_priority,
            differential_diagnosis=DEFAULT_DIFFERENTIALS[final_priority],
            recommended_actions=DEFAULT_RECOMMENDED_ACTIONS[final_priority],
            confidence_score=aggregation.confidence_score,
            requires_human_review=critique.flagged_for_review,
            audit_log=audit.export(),
        )
        audit.record("final_output_emitted", final_output.model_dump())

        return final_output

    def _deterministic_routing(self, payload: AgentInput) -> list[AgentName]:
        """Rule + context hybrid routing, deterministic for audit reproducibility."""
        selected = [
            AgentName.NLP,
            AgentName.VITALS,
            AgentName.DRUG,
            AgentName.GUIDELINES,
        ]

        if payload.patient_input.ehr_data.social_context:
            selected.append(AgentName.SOCIAL)

        if payload.patient_input.image:
            selected.append(AgentName.VISION)

        return selected

    async def _run_single(self, agent_name: AgentName, payload: AgentInput) -> AgentOutput:
        if agent_name == AgentName.NLP:
            return await self.nlp_agent.run(payload)
        if agent_name == AgentName.VITALS:
            return await self.vitals_agent.run(payload)
        if agent_name == AgentName.DRUG:
            return await self.drug_agent.run(payload)
        if agent_name == AgentName.GUIDELINES:
            return await self.guidelines_agent.run(payload)
        if agent_name == AgentName.SOCIAL:
            return await self.social_agent.run(payload)
        if agent_name == AgentName.VISION:
            return await self.vision_agent.run(payload)
        raise ValueError(f"Unsupported agent: {agent_name}")
