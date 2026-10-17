"""ADK observability plugin: one structured event per agent run, model call and tool call.

Registered on every Runner (pipeline stages, interviewer, copilot), so the officer's run log and the
BigQuery `bukti.events` table show exactly which agent did what, with which model, how long it took,
how many tokens it used and what it cost.
"""

from __future__ import annotations

import time
from typing import Any

from google.adk.agents import BaseAgent
from google.adk.agents.callback_context import CallbackContext
from google.adk.models import LlmRequest, LlmResponse
from google.adk.plugins.base_plugin import BasePlugin
from google.adk.tools import BaseTool, ToolContext

from app import telemetry


def _app_id(ctx) -> str | None:
    try:
        return ctx.state.get("app_id")
    except Exception:  # noqa: BLE001
        return None


class ObservabilityPlugin(BasePlugin):
    def __init__(self) -> None:
        super().__init__(name="bukti_observability")
        self._t: dict[str, float] = {}

    # ---- agents ----
    async def before_agent_callback(self, *, agent: BaseAgent, callback_context: CallbackContext):
        self._t[f"a:{callback_context.invocation_id}:{agent.name}"] = time.perf_counter()
        telemetry.emit("agent.started", app_id=_app_id(callback_context), agent=agent.name)
        return None

    async def after_agent_callback(self, *, agent: BaseAgent, callback_context: CallbackContext):
        start = self._t.pop(f"a:{callback_context.invocation_id}:{agent.name}", None)
        telemetry.emit("agent.completed", app_id=_app_id(callback_context), agent=agent.name,
                       latency_ms=int((time.perf_counter() - start) * 1000) if start else None)
        return None

    # ---- models ----
    async def before_model_callback(self, *, callback_context: CallbackContext, llm_request: LlmRequest):
        self._t[f"m:{callback_context.invocation_id}:{callback_context.agent_name}"] = time.perf_counter()
        return None

    async def after_model_callback(self, *, callback_context: CallbackContext, llm_response: LlmResponse):
        if llm_response.partial:
            return None
        start = self._t.pop(f"m:{callback_context.invocation_id}:{callback_context.agent_name}", None)
        usage = llm_response.usage_metadata
        telemetry.emit(
            "model.call", app_id=_app_id(callback_context), agent=callback_context.agent_name,
            model=llm_response.model_version or None,
            latency_ms=int((time.perf_counter() - start) * 1000) if start else None,
            input_tokens=getattr(usage, "prompt_token_count", None),
            output_tokens=(getattr(usage, "candidates_token_count", 0) or 0) + (getattr(usage, "thoughts_token_count", 0) or 0)
            if usage else None,
            status="error" if llm_response.error_code else "ok",
            detail=llm_response.error_message or "")
        return None

    async def on_model_error_callback(self, *, callback_context: CallbackContext, llm_request: LlmRequest,
                                      error: Exception):
        telemetry.emit("model.call", app_id=_app_id(callback_context), agent=callback_context.agent_name,
                       model=llm_request.model, status="error", detail=str(error)[:300])
        return None

    # ---- tools ----
    async def before_tool_callback(self, *, tool: BaseTool, tool_args: dict[str, Any], tool_context: ToolContext):
        self._t[f"t:{tool_context.function_call_id}"] = time.perf_counter()
        return None

    async def after_tool_callback(self, *, tool: BaseTool, tool_args: dict[str, Any], tool_context: ToolContext,
                                  result: dict[str, Any]):
        start = self._t.pop(f"t:{tool_context.function_call_id}", None)
        status = "error" if isinstance(result, dict) and result.get("status") == "error" else "ok"
        telemetry.emit("tool.call", app_id=_app_id(tool_context), agent=tool_context.agent_name, tool=tool.name,
                       latency_ms=int((time.perf_counter() - start) * 1000) if start else None, status=status,
                       detail=", ".join(f"{k}={str(v)[:40]}" for k, v in tool_args.items() if k not in ("quote",))[:300])
        return None

    async def on_tool_error_callback(self, *, tool: BaseTool, tool_args: dict[str, Any], tool_context: ToolContext,
                                     error: Exception):
        telemetry.emit("tool.call", app_id=_app_id(tool_context), agent=tool_context.agent_name, tool=tool.name,
                       status="error", detail=str(error)[:300])
        return None
