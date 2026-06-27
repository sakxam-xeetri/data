from typing import Set
from fastapi import WebSocket
import logging
import asyncio

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        # Set of active connections
        self.active_connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket):
        """Accepts a connection and registers it to the broadcast set."""
        await websocket.accept()
        async with self._lock:
            self.active_connections.add(websocket)
        logger.info(f"New client connected. Total clients: {len(self.active_connections)}")

    async def disconnect(self, websocket: WebSocket):
        """Unregisters a connection from the broadcast set."""
        async with self._lock:
            if websocket in self.active_connections:
                self.active_connections.remove(websocket)
        logger.info(f"Client disconnected. Total clients: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """Broadcasts a JSON-serializable dictionary to all active clients."""
        if not self.active_connections:
            return
            
        async with self._lock:
            # Create a snapshot copy to iterate over safely without holding the lock for I/O
            connections = list(self.active_connections)
            
        # Send to all clients asynchronously
        tasks = []
        for connection in connections:
            tasks.append(self._send_json_safe(connection, message))
            
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _send_json_safe(self, websocket: WebSocket, message: dict):
        """Safely sends a JSON message and removes the connection if it failed."""
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.debug(f"Error sending message to client: {e}. Cleaning up connection.")
            await self.disconnect(websocket)

# Instantiate global WebSocket connection manager
manager = ConnectionManager()
