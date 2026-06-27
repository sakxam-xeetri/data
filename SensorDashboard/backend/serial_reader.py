import threading
import time
import serial
import serial.tools.list_ports
import json
import logging
import math
import random
from backend.config import settings
from backend.parser import PacketParser
from backend.websocket import manager

logger = logging.getLogger(__name__)

class SerialReader:
    def __init__(self):
        self.port = settings.SERIAL_PORT
        self.baudrate = settings.BAUDRATE
        self.is_running = False
        self.thread = None
        self.serial_conn = None
        self.parser = PacketParser()
        
        # State indicators
        self.is_mocking = False
        self.connected_port = "NONE"
        
        # Thread lock for switching ports safely
        self._lock = threading.Lock()
        
    def get_available_ports(self):
        """Scans the host system and returns a list of active serial ports."""
        ports = serial.tools.list_ports.comports()
        return [{"device": p.device, "description": p.description} for p in ports]

    def _auto_detect_port(self):
        """Attempts to find an Arduino Nano 33 BLE or any USB serial device."""
        ports = self.get_available_ports()
        if not ports:
            return None
            
        # Prioritize keywords related to Arduino Nano BLE
        for p in ports:
            desc = p["description"].lower()
            dev = p["device"].lower()
            if "arduino" in desc or "mbed" in desc or "nano" in desc or "usb serial" in desc:
                logger.info(f"Auto-detected Arduino port: {p['device']} ({p['description']})")
                return p["device"]
                
        # Fallback to the first available port
        logger.info(f"Using first available serial port: {ports[0]['device']}")
        return ports[0]["device"]

    def start(self):
        """Starts the background serial reader thread."""
        with self._lock:
            if self.is_running:
                return
            self.is_running = True
            self.thread = threading.Thread(target=self._run, name="SerialReaderThread", daemon=True)
            self.thread.start()
            logger.info("Serial reader thread started.")

    def stop(self):
        """Stops the background thread and closes active serial connections."""
        with self._lock:
            self.is_running = False
            self._close_serial()
        if self.thread:
            self.thread.join(timeout=1.0)
            logger.info("Serial reader thread stopped.")

    def change_port(self, new_port: str, new_baudrate: int = 115200):
        """Changes the serial target port dynamically and restarts reader."""
        logger.info(f"Reconfiguring serial reader target: Port={new_port}, Baudrate={new_baudrate}")
        self.stop()
        self.port = new_port
        self.baudrate = new_baudrate
        self.start()

    def _close_serial(self):
        """Closes the PySerial connection if open."""
        if self.serial_conn and self.serial_conn.is_open:
            try:
                self.serial_conn.close()
            except Exception as e:
                logger.error(f"Error closing serial connection: {e}")
        self.serial_conn = None
        self.connected_port = "NONE"

    def _run(self):
        """Main loop of the serial reader thread. Handles reconnects and mocks."""
        while self.is_running:
            target_port = self.port
            if target_port == "AUTO":
                detected = self._auto_detect_port()
                if detected:
                    target_port = detected
                else:
                    logger.warning("No serial port detected. Switching to Mock Telemetry.")
                    target_port = "MOCK"

            if target_port == "MOCK":
                self.is_mocking = True
                self.connected_port = "MOCK"
                self._run_mock_loop()
            else:
                self.is_mocking = False
                logger.info(f"Attempting to open port {target_port} at {self.baudrate} baud...")
                try:
                    self.serial_conn = serial.Serial(
                        port=target_port,
                        baudrate=self.baudrate,
                        timeout=1.0,
                        write_timeout=1.0
                    )
                    self.connected_port = target_port
                    logger.info(f"Serial port {target_port} opened successfully.")
                    
                    # Run the normal serial reading loop
                    self._run_serial_loop()
                except Exception as e:
                    logger.error(f"Serial error on port {target_port}: {e}")
                    self._close_serial()
                    
                    # If physical port fails and mock mode is allowed, fall back to mock
                    if settings.MOCK_MODE:
                        logger.warning("Falling back to Mock Telemetry mode due to serial port error.")
                        self.is_mocking = True
                        self.connected_port = "MOCK"
                        self._run_mock_loop()
                    else:
                        # Wait before retrying to open the serial port
                        time.sleep(2.0)

    def _run_serial_loop(self):
        """Reads lines from the serial port, parses and broadcasts them."""
        # Clear the input buffer to prevent lag/overflow
        try:
            self.serial_conn.reset_input_buffer()
        except Exception:
            pass

        while self.is_running and self.serial_conn and self.serial_conn.is_open:
            try:
                raw_line = self.serial_conn.readline()
                if not raw_line:
                    continue  # Timeout occurred
                
                try:
                    decoded_line = raw_line.decode('utf-8', errors='ignore').strip()
                except Exception:
                    continue
                
                if not decoded_line:
                    continue
                
                # Check for log-level packets (non-JSON status lines from setup)
                if decoded_line.startswith("{\"log\":"):
                    try:
                        log_data = json.loads(decoded_line)
                        logger.info(f"Arduino board message: {log_data['log']}")
                    except Exception:
                        pass
                
                # Parse packet
                parsed_packet = self.parser.parse(decoded_line)
                if parsed_packet:
                    # Inject connection meta
                    parsed_packet["system_status"] = {
                        "connected": True,
                        "port": self.connected_port,
                        "baudrate": self.baudrate,
                        "is_mock": False
                    }
                    # Send to client group
                    import asyncio
                    asyncio.run(manager.broadcast(parsed_packet))
            except Exception as e:
                logger.error(f"Error in serial reading loop: {e}")
                break

    def _run_mock_loop(self):
        """Generates hyper-realistic simulated telemetry mimicking Nano 33 BLE Sense R2."""
        mock_packet_id = 0
        start_time = time.time()
        
        # Periodic state variables for gestures & proximity
        proximity_phase = 0.0
        
        # Heading variables for magnet
        heading_angle = 0.0
        
        logger.info("Mock telemetry simulator loop started.")
        while self.is_running and self.is_mocking:
            try:
                mock_packet_id += 1
                current_time = time.time()
                elapsed_ms = int((current_time - start_time) * 1000)
                
                # 1. IMU Simulation
                # Tilt pitch/roll dynamically with sine/cosine waves to show board rotating
                pitch_target = 15.0 * math.sin(current_time * 0.8) # Slow oscillation
                roll_target = 25.0 * math.cos(current_time * 1.2)
                
                # Accel math: components of gravity + minor vibration noise
                pitch_rad = math.radians(pitch_target)
                roll_rad = math.radians(roll_target)
                ax = -math.sin(pitch_rad) + random.uniform(-0.02, 0.02)
                ay = math.sin(roll_rad) * math.cos(pitch_rad) + random.uniform(-0.02, 0.02)
                az = math.cos(roll_rad) * math.cos(pitch_rad) + random.uniform(-0.02, 0.02)
                
                # Gyro math: derivative of angles + noise
                gx = 15.0 * 0.8 * math.cos(current_time * 0.8) + random.uniform(-1.0, 1.0)
                gy = -25.0 * 1.2 * math.sin(current_time * 1.2) + random.uniform(-1.0, 1.0)
                gz = random.uniform(-2.0, 2.0)
                
                # Magnetometer: rotates slowly
                heading_angle += 0.02
                mx = 35.0 * math.cos(heading_angle) + random.uniform(-1.0, 1.0)
                my = 35.0 * math.sin(heading_angle) + random.uniform(-1.0, 1.0)
                mz = 20.0 + random.uniform(-2.0, 2.0)
                
                # 2. Environment Simulation
                # Temp: base 26.5 C + sine fluctuations + noise
                temperature = 26.5 + 1.2 * math.sin(current_time * 0.05) + random.uniform(-0.05, 0.05)
                # Humidity: base 60%
                humidity = 60.0 + 4.0 * math.cos(current_time * 0.03) + random.uniform(-0.2, 0.2)
                # Pressure: base 1010.5 hPa + slow decay/rise
                pressure = 1010.5 + 2.5 * math.sin(current_time * 0.01) + random.uniform(-0.1, 0.1)
                
                # 3. Ambient Light & Proximity & Gestures
                # Proximity spikes every 12 seconds to simulate waving hand
                proximity_phase += 0.033 # loop is 30Hz
                prox_wave = math.sin(current_time * 2 * math.pi / 12.0)
                proximity = 0
                gesture = "NONE"
                
                # Active waving region
                if prox_wave > 0.6:
                    proximity = int(120 + 130 * ((prox_wave - 0.6) / 0.4)) # scale to 120-250
                    if random.random() < 0.1:
                        # Occasionally trigger directional swipes when hand is close
                        gesture = random.choice(["LEFT", "RIGHT", "UP", "DOWN"])
                else:
                    proximity = int(max(0, 15 + random.randint(-5, 5)))
                    
                # Proximity transition gestures (NEAR/FAR)
                if prox_wave > 0.58 and prox_wave < 0.62:
                    gesture = "NEAR"
                elif prox_wave < -0.58 and prox_wave > -0.62:
                    gesture = "FAR"
                    
                # Light intensity varies with proximity (hand blocks light)
                base_light = int(350 + 50 * math.sin(current_time * 0.05))
                light = max(5, base_light - int(proximity * 1.2) + random.randint(-5, 5))
                
                # Color sensor changes with light
                r = int(min(255, 120 + 0.3 * light + random.randint(-10, 10)))
                g = int(min(255, 95 + 0.2 * light + random.randint(-10, 10)))
                b = int(min(255, 200 - 0.1 * light + random.randint(-10, 10)))
                
                # 4. Microphone Simulation
                # Simulates voice spikes (speaking/clapping) every 5-6 seconds
                mic_wave = math.sin(current_time * 2 * math.pi / 5.5)
                if mic_wave > 0.7:
                    sound_rms = random.uniform(30.0, 120.0)
                    sound = int(sound_rms * 2.8 + random.randint(-10, 10))
                else:
                    sound_rms = random.uniform(2.0, 8.0)
                    sound = int(sound_rms * 1.5 + random.randint(0, 3))
                
                # Assemble dummy JSON line matching format
                raw_json = {
                    "timestamp": elapsed_ms,
                    "packet_id": mock_packet_id,
                    "accelerometer": {"x": round(ax, 4), "y": round(ay, 4), "z": round(az, 4)},
                    "gyroscope": {"x": round(gx, 2), "y": round(gy, 2), "z": round(gz, 2)},
                    "magnetometer": {"x": round(mx, 2), "y": round(my, 2), "z": round(mz, 2)},
                    "temperature": round(temperature, 2),
                    "humidity": round(humidity, 1),
                    "pressure": round(pressure, 2),
                    "light": light,
                    "proximity": proximity,
                    "color": {"r": r, "g": g, "b": b},
                    "gesture": gesture,
                    "sound": sound,
                    "sound_rms": round(sound_rms, 2)
                }
                
                # Parse, enrich and broadcast
                raw_json_str = json.dumps(raw_json)
                parsed_packet = self.parser.parse(raw_json_str)
                if parsed_packet:
                    parsed_packet["system_status"] = {
                        "connected": False,
                        "port": self.connected_port,
                        "baudrate": self.baudrate,
                        "is_mock": True
                    }
                    
                    import asyncio
                    asyncio.run(manager.broadcast(parsed_packet))
                    
                time.sleep(settings.MOCK_INTERVAL)
            except Exception as e:
                logger.error(f"Error in mock loop: {e}")
                time.sleep(1.0)

# Instantiate global serial reader
serial_reader = SerialReader()
