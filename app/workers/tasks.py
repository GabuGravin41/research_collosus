from __future__ import annotations

import asyncio
from datetime import datetime

from sqlmodel import select

from app.db.models import AgentLog, ResearchBranch, ResearchSession, ResearchTask, KnowledgeFact
from app.db.session import engine
from app.services import gemini_service
from app.services.gemini_service import QuotaExhaustedError
from app.workers.celery_app import celery_app


@celery_app.task(name="run_research_loop")
def run_research_loop(session_id: int) -> None:
    """
    Celery task that drives a simple research loop for a session.
    This is a simplified version of the frontend scheduler: it will
    repeatedly pick the highest-priority pending task and run it.
    """

    async def _run() -> None:
        from sqlmodel.ext.asyncio.session import AsyncSession

        async with AsyncSession(engine) as session:
            res = await session.exec(
                select(ResearchSession).where(ResearchSession.id == session_id)
            )
            research_session = res.one_or_none()
            if not research_session:
                return

            research_session.status = "running"
            await session.commit()

            try:
                await _execute_research_loop(session, research_session, session_id)
            except QuotaExhaustedError as e:
                # Mark session as failed and log the quota error
                research_session.status = "failed"
                await session.commit()
                log = AgentLog(
                    session_id=session_id,
                    agent_name="System",
                    message=f"Research halted: {str(e)}",
                    type="error",
                    timestamp=datetime.utcnow(),
                )
                session.add(log)
                await session.commit()
                return

        async def _execute_research_loop(session, research_session, session_id):
            """Inner loop for research execution."""
            while True:
                # Fetch next pending task ordered by priority desc, then id
                task_res = await session.exec(
                    select(ResearchTask)
                    .join(ResearchBranch)
                    .where(
                        ResearchBranch.session_id == session_id,
                        ResearchTask.status == "pending",
                    )
                    .order_by(ResearchTask.priority.desc(), ResearchTask.id)
                )
                task = task_res.first()
                if not task:
                    break

                task.status = "running"
                await session.commit()

                # Build simple knowledge context
                facts_res = await session.exec(
                    select(KnowledgeFact).where(KnowledgeFact.session_id == session_id)
                )
                facts = facts_res.all()
                context = "\n".join(f"- [{f.source_agent}] {f.content}" for f in facts)

                content, urls = await gemini_service.execute_agent_task(
                    task_desc=task.description,
                    role=task.assigned_to,
                    context=context,
                )

                # Save result and mark as done
                task.result = content
                task.status = "done"
                await session.commit()

                # Log simple completion
                log = AgentLog(
                    session_id=session_id,
                    agent_name=task.assigned_to,
                    message=f"Completed task: {task.description[:100]}",
                    type="success",
                    timestamp=datetime.utcnow(),
                )
                session.add(log)
                await session.commit()

            # After all tasks are done, synthesize a final report
            facts_res = await session.exec(
                select(KnowledgeFact).where(KnowledgeFact.session_id == session_id)
            )
            facts = facts_res.all()
            facts_payload = [
                {"source_agent": f.source_agent, "content": f.content, "confidence": f.confidence}
                for f in facts
            ]
            synthesis = await gemini_service.synthesize_research(
                original_prompt=research_session.original_prompt,
                knowledge_facts=facts_payload,
            )

            research_session.status = "completed"
            research_session.final_synthesis = synthesis
            await session.commit()

    asyncio.run(_run())


