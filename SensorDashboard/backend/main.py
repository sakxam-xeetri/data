import logging
import sys
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from backend.config import settings
from backend.websocket import manager
from backend.serial_reader import serial_reader

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(settings.LOG_FILE, encoding='utf-8')
    ]
)
logger = logging.getLogger("backend")

# Initialize FastAPI App
app = FastAPI(
    title="Arduino Nano 33 BLE Sense Rev2 Telemetry Server",
    description="Production-grade real-time web telemetry backend",
    version="1.0.0"
)

# Request schema for connection updates
class ConnectionRequest(BaseModel):
    port: str
    baudrate: int = 115200

# 1. Startup & Shutdown Events
@app.on_event("startup")
async def startup_event():
    logger.info("Starting up Telemetry Server...")
    serial_reader.start()

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down Telemetry Server...")
    serial_reader.stop()

# 2. REST API: List active COM ports
@app.get("/api/ports")
def get_ports():
    try:
        ports = serial_reader.get_available_ports()
        # Add MOCK as an explicit option
        ports.append({"device": "MOCK", "description": "Virtual Simulation Telemetry"})
        return {"ports": ports}
    except Exception as e:
        logger.error(f"Error scanning ports: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# 3. REST API: Trigger active connection update
@app.post("/api/connect")
def connect_port(req: ConnectionRequest):
    try:
        serial_reader.change_port(req.port, req.baudrate)
        return {
            "status": "success",
            "message": f"Serial port switched to {req.port} at {req.baudrate} baud.",
            "current_status": {
                "port": serial_reader.connected_port,
                "is_mock": serial_reader.is_mocking
            }
        }
    except Exception as e:
        logger.error(f"Error switching port: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# 4. REST API: Retrieve current status
@app.get("/api/status")
def get_status():
    return {
        "connected": serial_reader.connected_port != "NONE",
        "port": serial_reader.connected_port,
        "baudrate": serial_reader.baudrate,
        "is_mock": serial_reader.is_mocking,
        "packet_count": serial_reader.parser.packet_count,
        "dropped_packets": serial_reader.parser.dropped_packets
    }

# 5. WebSocket Telemetry Broadcast Route
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep socket alive and listen for client commands (if any)
            data = await websocket.receive_text()
            logger.info(f"Received client command over WS: {data}")
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await manager.disconnect(websocket)

# 6. Serve static files (HTML, CSS, JS) at the root
# Mount frontend directory to serve UI assets
# Note: Mount at "/" should be last to avoid hijacking `/api` or `/ws` routes
try:
    app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
    logger.info("Mounted static frontend assets.")
except Exception as e:
    logger.error(f"Failed to mount static files folder: {e}. Check if 'frontend' directory exists.")
