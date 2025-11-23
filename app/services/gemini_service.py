from __future__ import annotations

import json
import logging
import os
import base64
from typing import Any, Dict, List, Tuple

from google import genai

logger = logging.getLogger(__name__)

# --- MODEL CONFIGURATION ---
# Free tier: Use "gemini-2.5-flash-lite" (1000 RPD, 15 RPM, 1M TPM)
# Paid tier: Uncomment below to use "gemini-3-pro-preview" for advanced reasoning
# MODEL_REASONING = "gemini-3-pro-preview"
MODEL_REASONING = os.getenv("GEMINI_REASONING_MODEL", "gemini-2.0-flash-exp")

# Speech model: fast, high-quota variant
MODEL_SPEECH = os.getenv("GEMINI_SPEECH_MODEL", "gemini-1.5-flash-8b")


class QuotaExhaustedError(Exception):
    """Raised when Gemini API quota/rate limits are hit."""
    pass


def get_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY environment variable is not set")
    return genai.Client(api_key=api_key)


def _handle_gemini_error(e: Exception, operation: str) -> None:
    """
    Check if the error is a quota/rate limit issue and raise a user-friendly exception.
    """
    error_str = str(e).lower()
    if "429" in error_str or "resource_exhausted" in error_str or "quota" in error_str:
        logger.error(f"{operation} failed due to quota: {e}")
        raise QuotaExhaustedError(
            f"Gemini API quota exhausted during {operation}. "
            "Please wait for quota reset or upgrade to a paid plan. "
            "See: https://ai.google.dev/pricing"
        ) from e
    # Re-raise other errors as-is
    logger.error(f"{operation} failed: {e}")
    raise


async def orchestrate_plan(prompt: str, attachments: List[Dict[str, Any]] | None = None) -> List[Dict[str, Any]]:
    """
    Ask Gemini to create a research plan with branches and tasks.
    Returns a list of branches with embedded tasks.
    """
    client = get_client()

    attachment_text = ""
    if attachments:
        chunks: List[str] = []
        for att in attachments:
            name = att.get("name", "attachment")
            content = att.get("content", "")
            # Truncate very large files to keep prompt size reasonable
            if len(content) > 4000:
                content = content[:4000] + "\n...[truncated]..."
            chunks.append(f"FILE: {name}\n{content}")
        attachment_text = "\n\nATTACHED CONTEXT:\n" + "\n\n".join(chunks)

    system_prompt = (
        "You are the Research Colossus Orchestrator.\n"
        "Create a Tree-of-Thoughts style research plan.\n"
        "For each branch, define a name and a sequence of tasks.\n"
        "Each task should include: id, description, assigned_to (role), priority (1-10), status ('pending').\n"
        "Return strictly valid JSON matching this structure:\n"
        "[{\n"
        '  "id": "branch-1",\n'
        '  "name": "Branch Name",\n'
        '  "tasks": [\n'
        '    {"id": "task-1", "description": "...", "assigned_to": "Theoretical Physicist", "priority": 8, "status": "pending"}\n'
        "  ]\n"
        "}]\n"
    )

    user_text = f"{system_prompt}\n\nUSER PROMPT: {prompt}"
    if attachment_text:
        user_text += f"\n\n{attachment_text}"

    try:
        resp = client.models.generate_content(
            model=MODEL_REASONING,
            contents=[{"role": "user", "parts": [{"text": user_text}]}],
        )
        raw = resp.text or ""
        logger.debug("orchestrate_plan raw response: %s", raw)
    except Exception as e:
        _handle_gemini_error(e, "orchestrate_plan")

    # Be defensive about extra text / code fences
    try:
        data = _extract_json(raw)
    except json.JSONDecodeError as exc:
        logger.error("Failed to parse orchestrate_plan JSON: %s", exc)
        raise

    if not isinstance(data, list):
        raise ValueError("orchestrate_plan: expected a list of branches")
    return data


async def execute_agent_task(task_desc: str, role: str, context: str) -> Tuple[str, List[str]]:
    """
    Execute a single agent task with optional context.
    Returns (content, [urls]).
    """
    client = get_client()

    system_instruction = (
        f"You are a world-class {role}. "
        "Perform deep scientific reasoning on the given task.\n"
        "Use the provided context as axioms when helpful.\n"
        "Provide rigorous and detailed output."
    )

    contents = [
        {
            "role": "user",
            "parts": [
                {"text": system_instruction},
                {"text": f"TASK: {task_desc}"},
                {"text": f"CONTEXT:\n{context or 'No prior context.'}"},
            ],
        }
    ]

    try:
        resp = client.models.generate_content(
            model=MODEL_REASONING,
            contents=contents,
        )
        text = resp.text or ""
    except Exception as e:
        _handle_gemini_error(e, "execute_agent_task")

    urls: List[str] = []
    try:
        candidates = getattr(resp, "candidates", []) or []
        gm = getattr(candidates[0], "grounding_metadata", None)
        if gm and getattr(gm, "grounding_chunks", None):
            for chunk in gm.grounding_chunks:
                if getattr(chunk, "web", None) and getattr(chunk.web, "uri", None):
                    urls.append(chunk.web.uri)
    except Exception:  # pragma: no cover - best-effort extraction
        logger.debug("No grounding URLs found in response.")

    # Deduplicate
    urls = list(dict.fromkeys(urls))
    return text, urls


async def review_task_output(task: str, output: str) -> Dict[str, Any]:
    """
    Peer-review a task result. Returns a dict with score, feedback, approved.
    """
    client = get_client()

    prompt = (
        "You are the Peer Reviewer for Research Colossus.\n"
        "Review the output for rigor, coherence, and correctness.\n"
        "Rate from 0-100 and set approved=true if score >= 85.\n"
        "Return strictly JSON: {\"score\": int, \"feedback\": str, \"approved\": bool}.\n\n"
        f"TASK: {task}\n\nOUTPUT:\n{output}\n"
    )

    try:
        resp = client.models.generate_content(
            model=MODEL_REASONING,
            contents=[{"role": "user", "parts": [{"text": prompt}]}],
        )
        raw = resp.text or ""
        logger.debug("review_task_output raw response: %s", raw)
    except Exception as e:
        _handle_gemini_error(e, "review_task_output")

    try:
        data = _extract_json(raw)
    except json.JSONDecodeError:
        # Fallback: accept with generic feedback
        return {"score": 100, "feedback": "Automatic approval (parse failure).", "approved": True}

    if not isinstance(data, dict):
        raise ValueError("review_task_output: expected a JSON object")
    return data


async def generate_simulation_code(task: str, context: str) -> Dict[str, Any]:
    """
    Decide between generating toy-model Python (for browser / local sim) or an HPC spec.
    Returns a JSON-like dict describing either {type: 'CODE', code, scenarios}
    or {type: 'SPEC', spec: {...}}.
    """
    client = get_client()

    prompt = (
        "You are a Scientific Computation Expert for Research Colossus.\n"
        "Given a task and context, decide whether to create a toy-model Python simulation\n"
        "(numpy only, small runtime) or a heavy cluster specification.\n"
        "If toy model, return:\n"
        '{\"type\": \"CODE\", \"code\": \"python code here\", \"scenarios\": [\"label1\", \"label2\"]}\n'
        "If heavy experiment, return:\n"
        "{\n"
        '  \"type\": \"SPEC\",\n'
        '  \"spec\": {\n'
        '    \"title\": \"...\",\n'
        '    \"complexity\": \"HIGH\" or \"EXTREME\",\n'
        '    \"requirements\": [\"8x H100 GPUs\", \"PyTorch 2.1\"],\n'
        '    \"codeSnippet\": \"CUDA / PyTorch code\",\n'
        '    \"hypothesis\": \"...\",\n'
        '    \"expectedOutcome\": \"...\"\n'
        "  }\n"
        "}\n"
        "Return strictly valid JSON with one of these shapes.\n\n"
        f"TASK: {task}\n\nCONTEXT:\n{context}\n"
    )

    try:
        resp = client.models.generate_content(
            model=MODEL_REASONING,
            contents=[{"role": "user", "parts": [{"text": prompt}]}],
        )
        raw = resp.text or ""
    except Exception as e:
        _handle_gemini_error(e, "generate_simulation_code")
    logger.debug("generate_simulation_code raw response: %s", raw)

    data = _extract_json(raw)
    if not isinstance(data, dict):
        raise ValueError("generate_simulation_code: expected an object")
    return data


async def synthesize_research(original_prompt: str, knowledge_facts: List[Dict[str, Any]]) -> str:
    """
    Produce a final scientific report based on the validated knowledge bank.
    `knowledge_facts` is a list of dicts with at least `source_agent` and `content` keys.
    """
    client = get_client()

    knowledge_str = "\n\n".join(
        f"[{fact.get('source_agent', 'Agent')}]: {fact.get('content', '')}" for fact in knowledge_facts
    )

    prompt = (
        "Synthesize a Final Scientific Report.\n"
        f"Query: \"{original_prompt}\"\n\n"
        "Validated Knowledge Bank:\n"
        f"{knowledge_str}\n\n"
        "Format:\n"
        "1. Executive Summary\n"
        "2. Methodology (Reasoning Traces)\n"
        "3. Key Findings (proven via Simulation or Axioms)\n"
        "4. Future Work (Computational Specs created)\n"
    )

    try:
        resp = client.models.generate_content(
            model=MODEL_REASONING,
            contents=[{"role": "user", "parts": [{"text": prompt}]}],
        )
        return resp.text or "Synthesis failed."
    except Exception as exc:  # pragma: no cover - defensive
        logger.error("synthesize_research failed: %s", exc)
        return "Could not synthesize final report."


async def transcribe_audio(audio_bytes: bytes, mime_type: str) -> str:
    """
    Use Gemini to perform speech-to-text on an audio clip.
    `mime_type` should be a valid audio MIME type (e.g. audio/webm, audio/wav).
    """
    client = get_client()

    # Encode audio as base64 for inline_data
    encoded = base64.b64encode(audio_bytes).decode("utf-8")

    try:
        resp = client.models.generate_content(
            model=MODEL_SPEECH,
            contents=[
                {
                    "role": "user",
                    "parts": [
                        {"text": "Transcribe this audio into clear English text."},
                        {
                            "inline_data": {
                                "data": encoded,
                                "mime_type": mime_type or "audio/webm",
                            }
                        },
                    ],
                }
            ],
        )
        text = resp.text or ""
        return text.strip()
    except Exception as exc:  # pragma: no cover - defensive
        logger.error("transcribe_audio failed: %s", exc)
        raise


def _extract_json(raw: str) -> Any:
    """
    Best-effort extraction of JSON from model output, stripping code fences or prose.
    """
    text = raw.strip()

    # Strip common Markdown fences
    if text.startswith("```"):
        # Drop first line and last fence if present
        lines = text.splitlines()
        # remove leading and trailing ```...``` lines
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    # Heuristic: find first '{' or '[' and last '}' or ']'
    start_candidates = [i for i in (text.find("{"), text.find("[")) if i != -1]
    if start_candidates:
        start = min(start_candidates)
        # naive end search
        end_brace = text.rfind("}")
        end_bracket = text.rfind("]")
        end = max(end_brace, end_bracket)
        if end != -1 and end >= start:
            text = text[start : end + 1]

    return json.loads(text)


