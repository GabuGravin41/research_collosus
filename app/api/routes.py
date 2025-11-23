from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.socket_manager import socket_manager
from app.db.models import AgentLog, ResearchBranch, ResearchSession, ResearchTask, KnowledgeFact
from app.db.session import get_session
from app.services import gemini_service
from app.services.gemini_service import QuotaExhaustedError
from app.workers.tasks import run_research_loop


router = APIRouter(prefix="/research", tags=["research"])


@router.get("/health")
async def health_check() -> Dict[str, str]:
    return {"status": "ok"}


@router.post("/start")
async def start_research(
    payload: Dict[str, Any],
    session: AsyncSession = Depends(get_session),
) -> Dict[str, Any]:
    """
    Create a new ResearchSession, ask Gemini to orchestrate the plan,
    persist branches/tasks, then enqueue the Celery research loop.
    """
    prompt = payload.get("prompt", "").strip()
    attachments = payload.get("attachments") or []
    if not prompt:
        return {"error": "prompt is required"}

    research_session = ResearchSession(original_prompt=prompt, status="pending")
    session.add(research_session)
    await session.commit()
    await session.refresh(research_session)

    # Call Gemini to get branches/tasks (include any attached context)
    try:
        branches = await gemini_service.orchestrate_plan(prompt, attachments)
    except QuotaExhaustedError as e:
        # Mark session as failed and return user-friendly error
        research_session.status = "failed"
        await session.commit()
        raise HTTPException(status_code=503, detail=str(e)) from e

    # Persist branches and tasks
    for branch_data in branches:
        branch = ResearchBranch(
            session_id=research_session.id,
            name=branch_data.get("name", "Branch"),
            status="active",
        )
        session.add(branch)
        await session.commit()
        await session.refresh(branch)

        for task_data in branch_data.get("tasks", []):
            task = ResearchTask(
                branch_id=branch.id,
                description=task_data.get("description", ""),
                assigned_to=task_data.get("assigned_to", "Agent"),
                status=task_data.get("status", "pending"),
                priority=task_data.get("priority", 5),
                dependencies=task_data.get("dependencies") or [],
            )
            session.add(task)
        await session.commit()

    # Kick off Celery worker
    run_research_loop.delay(research_session.id)

    return {"session_id": research_session.id}


@router.get("/{session_id}")
async def get_research_state(
    session_id: int,
    db: AsyncSession = Depends(get_session),
) -> Dict[str, Any]:
    """
    Return full state for a session: branches, tasks, logs, knowledge facts.
    """
    res = await db.exec(select(ResearchSession).where(ResearchSession.id == session_id))
    session_obj = res.one_or_none()
    if not session_obj:
        return {"error": "session not found"}

    # Branches and tasks
    branches_res = await db.exec(
        select(ResearchBranch).where(ResearchBranch.session_id == session_id)
    )
    branches = branches_res.all()

    result_branches: list[dict[str, Any]] = []
    for branch in branches:
        tasks_res = await db.exec(
            select(ResearchTask).where(ResearchTask.branch_id == branch.id)
        )
        tasks = tasks_res.all()
        result_branches.append(
            {
                "id": branch.id,
                "name": branch.name,
                "status": branch.status,
                "tasks": [
                    {
                        "id": t.id,
                        "description": t.description,
                        "assigned_to": t.assigned_to,
                        "status": t.status,
                        "priority": t.priority,
                        "result": t.result,
                        "python_code": t.python_code,
                        "experiment_spec": t.experiment_spec,
                        "dependencies": t.dependencies,
                    }
                    for t in tasks
                ],
            }
        )

    # Logs
    logs_res = await db.exec(
        select(AgentLog).where(AgentLog.session_id == session_id).order_by(AgentLog.timestamp)
    )
    logs = logs_res.all()

    # Knowledge
    facts_res = await db.exec(
        select(KnowledgeFact).where(KnowledgeFact.session_id == session_id)
    )
    facts = facts_res.all()

    return {
        "session": {
            "id": session_obj.id,
            "original_prompt": session_obj.original_prompt,
            "status": session_obj.status,
            "created_at": session_obj.created_at.isoformat(),
            "final_synthesis": session_obj.final_synthesis,
        },
        "branches": result_branches,
        "logs": [
            {
                "id": log.id,
                "agent_name": log.agent_name,
                "message": log.message,
                "type": log.type,
                "timestamp": log.timestamp.isoformat(),
            }
            for log in logs
        ],
        "knowledge": [
            {
                "id": fact.id,
                "content": fact.content,
                "source_agent": fact.source_agent,
                "confidence": fact.confidence,
                "created_at": fact.created_at.isoformat(),
            }
            for fact in facts
        ],
    }


@router.post("/pause/{branch_id}")
async def pause_branch(
    branch_id: int,
    db: AsyncSession = Depends(get_session),
) -> Dict[str, Any]:
    res = await db.exec(select(ResearchBranch).where(ResearchBranch.id == branch_id))
    branch = res.one_or_none()
    if not branch:
        return {"error": "branch not found"}

    branch.status = "paused" if branch.status != "paused" else "active"
    await db.commit()
    return {"branch_id": branch.id, "status": branch.status}


@router.post("/stt")
async def transcribe_speech(
    file: UploadFile = File(...),
) -> Dict[str, Any]:
    """
    Backend speech-to-text endpoint.
    Accepts an audio file upload and returns a transcript using Gemini.
    """
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio file")

    mime_type = file.content_type or "audio/webm"
    try:
        transcript = await gemini_service.transcribe_audio(data, mime_type)
    except Exception as exc:
        # If we've hit a quota / rate limit on Gemini, surface a 429 so the
        # frontend can gracefully fall back to browser-native speech.
        msg = str(exc)
        status_code = 500
        if "RESOURCE_EXHAUSTED" in msg or "429" in msg:
            status_code = 429
        raise HTTPException(status_code=status_code, detail=f"Transcription failed: {exc}") from exc

    return {"transcript": transcript}


@router.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: int) -> None:
    await socket_manager.connect(str(session_id), websocket)
    try:
        while True:
            # We don't expect messages from client right now, but keep connection alive.
            await websocket.receive_text()
    except WebSocketDisconnect:
        socket_manager.disconnect(str(session_id), websocket)



