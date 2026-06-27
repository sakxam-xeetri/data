import os

class Settings:
    # Serial Port Settings
    SERIAL_PORT: str = "AUTO"  # AUTO will trigger scanning and auto-selection of Arduino
    BAUDRATE: int = 115200
    
    # Server Settings
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    
    # Mock Data settings (fallback if no Arduino connected)
    MOCK_MODE: bool = True  # Enable mock telemetry fallback if serial connection fails
    MOCK_INTERVAL: float = 0.033  # ~30Hz (33ms)

    # Logging Settings
    LOG_FILE: str = "logs/sensor_dashboard.log"
    LOG_LEVEL: str = "INFO"
    
    # Chart Buffer Size
    MAX_BUFFER_POINTS: int = 1000

# Instantiate configurations
settings = Settings()

# Ensure logs folder exists
os.makedirs("logs", exist_ok=True)
