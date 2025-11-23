from __future__ import annotations

from typing import Dict, List

from fastapi import WebSocket


class WebSocketManager:
    """
    Keeps track of active WebSocket connections per research session.
    This is an in-process manager; for multiple workers/processes you would
    back this with Redis pub/sub or similar.
    """

    def __init__(self) -> None:
        self._connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.setdefault(session_id, []).append(websocket)

    def disconnect(self, session_id: str, websocket: WebSocket) -> None:
        conns = self._connections.get(session_id)
        if not conns:
            return
        if websocket in conns:
            conns.remove(websocket)
        if not conns:
            self._connections.pop(session_id, None)

    async def send_json(self, session_id: str, message: dict) -> None:
        conns = self._connections.get(session_id, [])
        for ws in list(conns):
            try:
                await ws.send_json(message)
            except Exception:
                # Drop broken connection
                self.disconnect(session_id, ws)


socket_manager = WebSocketManager()


