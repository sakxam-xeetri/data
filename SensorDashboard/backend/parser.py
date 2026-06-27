import json
import math
import time
import logging
import psutil

logger = logging.getLogger(__name__)

class PacketParser:
    def __init__(self):
        self.packet_count = 0
        self.dropped_packets = 0
        self.last_packet_id = None
        self.start_time = time.time()

    def parse(self, raw_line: str) -> dict:
        """
        Parses a raw JSON string from the Arduino serial port,
        enriches it with host system telemetry and physical derivations.
        """
        start_parse = time.perf_counter()
        
        try:
            data = json.loads(raw_line)
        except json.JSONDecodeError as e:
            self.dropped_packets += 1
            logger.warning(f"Failed to parse JSON packet: {e}. Raw line: {raw_line[:100]}")
            return None

        self.packet_count += 1
        
        # Calculate dropped packets if packet_id is sequential
        current_packet_id = data.get("packet_id")
        if current_packet_id is not None:
            if self.last_packet_id is not None:
                diff = current_packet_id - self.last_packet_id
                if diff > 1:
                    self.dropped_packets += (diff - 1)
            self.last_packet_id = current_packet_id

        # 1. Host system stats
        cpu_usage = psutil.cpu_percent()
        memory_usage = psutil.virtual_memory().percent
        
        # 2. Extract IMU values for derived calculations
        accel = data.get("accelerometer", {"x": 0.0, "y": 0.0, "z": 0.0})
        gyro = data.get("gyroscope", {"x": 0.0, "y": 0.0, "z": 0.0})
        mag = data.get("magnetometer", {"x": 0.0, "y": 0.0, "z": 0.0})
        
        ax, ay, az = accel.get("x", 0.0), accel.get("y", 0.0), accel.get("z", 1.0)
        gx, gy, gz = gyro.get("x", 0.0), gyro.get("y", 0.0), gyro.get("z", 0.0)
        
        # 3. Physics Derivations
        # Magnitudes
        accel_mag = math.sqrt(ax**2 + ay**2 + az**2)
        gyro_mag = math.sqrt(gx**2 + gy**2 + gz**2)
        
        # Tilt estimation (Pitch & Roll from Accelerometer)
        # Pitch is rotation about Y-axis: atan2(-ax, sqrt(ay^2 + az^2))
        # Roll is rotation about X-axis: atan2(ay, az)
        try:
            pitch = math.atan2(-ax, math.sqrt(ay**2 + az**2)) * 180.0 / math.pi
            roll = math.atan2(ay, az) * 180.0 / math.pi
        except Exception:
            pitch = 0.0
            roll = 0.0
            
        # 4. Altitude calculation from barometric pressure (hPa)
        # International Barometric Formula: altitude = 44330 * (1.0 - (P / P0)^(1/5.255))
        # Where P0 is standard sea level pressure (1013.25 hPa)
        pressure = data.get("pressure", 0.0)
        altitude = 0.0
        if pressure > 0.0:
            try:
                altitude = 44330.0 * (1.0 - (pressure / 1013.25) ** (1.0 / 5.255))
            except Exception as e:
                logger.error(f"Error calculating altitude: {e}")
        
        # Latency of backend parser processing
        parse_duration_ms = (time.perf_counter() - start_parse) * 1000.0

        # Create structured dictionary representing final telemetry broadcast
        enriched_packet = {
            "timestamp": data.get("timestamp", int(time.time() * 1000)),
            "server_time": time.time(),
            "packet_id": current_packet_id or self.packet_count,
            "packet_count": self.packet_count,
            "dropped_packets": self.dropped_packets,
            
            # Host computer system stats
            "host_cpu": cpu_usage,
            "host_memory": memory_usage,
            "parser_latency_ms": parse_duration_ms,
            
            # IMU
            "accelerometer": accel,
            "gyroscope": gyro,
            "magnetometer": mag,
            
            # Derived IMU parameters
            "derived": {
                "accel_magnitude": round(accel_mag, 4),
                "gyro_magnitude": round(gyro_mag, 4),
                "pitch": round(pitch, 2),
                "roll": round(roll, 2),
                "yaw": 0.0, # Will be tilt-compensated & filtered on frontend or kept here
                "altitude": round(altitude, 2)
            },
            
            # Environment
            "temperature": data.get("temperature", 0.0),
            "humidity": data.get("humidity", 0.0),
            "pressure": pressure,
            
            # Light & Color
            "light": data.get("light", 0),
            "proximity": data.get("proximity", 0),
            "color": data.get("color", {"r": 0, "g": 0, "b": 0}),
            
            # Gestures & Sound
            "gesture": data.get("gesture", "NONE"),
            "sound": data.get("sound", 0),
            "sound_rms": data.get("sound_rms", 0.0)
        }
        
        return enriched_packet
