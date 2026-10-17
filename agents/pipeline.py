"""ADK orchestration. Two stages, each its own root agent:

  extract  = ExtractorAgent                                   (before the interview, so it can ask about the notebook)
  assess   = Sequential[ Benchmark → Parallel[Reconciler, Integrity] → Policy → Memo(Gemini writer) ]
"""

from __future__ import annotations

import logging
from typing import AsyncGenerator

from google.adk.agents import ParallelAgent, SequentialAgent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from agents.assess import (BenchmarkAgent, IntegrityAgent, MemoAgent, PolicyAgent, ReconcilerAgent,
                           build_memo_writer)
from agents.extractor import ExtractorAgent

log = logging.getLogger("bukti.pipeline")
APP_NAME = "bukti"

sessions = InMemorySessionService()


def build_extract_stage() -> ExtractorAgent:
    return ExtractorAgent(name="extractor", description="Reads ledger pages and payment statements with Gemini vision")


def build_assess_stage() -> SequentialAgent:
    return SequentialAgent(
        name="assess",
        description="Verifies the evidence, applies policy, and writes the credit memo",
        sub_agents=[
            BenchmarkAgent(name="benchmark", description="Peer benchmarks from BigQuery"),
            ParallelAgent(name="verify", description="Independent verification", sub_agents=[
                ReconcilerAgent(name="reconciler", description="Notebook vs payment-rail reconciliation"),
                IntegrityAgent(name="integrity", description="Fabrication signals"),
            ]),
            PolicyAgent(name="policy", description="Affordability and cash-flow-shaped repayment"),
            MemoAgent(name="memo", description="Explains the decision", sub_agents=[build_memo_writer()]),
        ],
    )


_runners = {
    "extract": Runner(app_name=APP_NAME, agent=build_extract_stage(), session_service=sessions),
    "assess": Runner(app_name=APP_NAME, agent=build_assess_stage(), session_service=sessions),
}


async def run_stage(stage: str, app_id: str) -> AsyncGenerator[dict, None]:
    """Run one stage and yield the UI payloads its agents emit."""
    runner = _runners[stage]
    session = await sessions.create_session(app_name=APP_NAME, user_id=app_id, state={"app_id": app_id})
    message = types.Content(role="user", parts=[types.Part(text=f"Run the {stage} stage for application {app_id}.")])
    async for event in runner.run_async(user_id=app_id, session_id=session.id, new_message=message):
        payload = (event.custom_metadata or {}).get("sse")
        if payload:
            yield payload
        elif event.error_message:
            log.warning("agent event error", extra={"stage": stage, "error": event.error_message})
