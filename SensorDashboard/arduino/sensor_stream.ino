/**
 * Arduino Nano 33 BLE Sense Rev2 Sensor Streamer
 * Reads all onboard sensors and streams JSON over Serial at 30Hz.
 * Includes error handling and fail-safes for unit-test compatibility.
 */

#include <Arduino_BMI270_BMM150.h>
#include <Arduino_HS300x.h>
#include <Arduino_LPS22HB.h>
#include <Arduino_APDS9960.h>
#include <PDM.h>

// Sampling rate config (30Hz = ~33.3ms loop)
const unsigned long LOOP_DELAY_MS = 33;
unsigned long lastSendTime = 0;
unsigned long packetId = 0;

// Sensor status flags
bool imuActive = false;
bool hs300xActive = false;
bool baroActive = false;
bool apdsActive = false;
bool micActive = false;

// Microphone PDM variables
const int BUFFER_SIZE = 256;
short sampleBuffer[BUFFER_SIZE];
volatile int samplesRead = 0;

// Sound level accumulation variables
volatile long soundSumSq = 0;
volatile int soundPeak = 0;
volatile int soundSampleCount = 0;

// Gesture state variables
String currentGesture = "NONE";
int gestureHoldCounter = 0;
int lastProximity = 0;

// Callback function for PDM microphone data
void onPDMdata() {
  int bytesAvailable = PDM.available();
  // Read sample bytes into buffer (16-bit, so 2 bytes per sample)
  PDM.read(sampleBuffer, bytesAvailable);
  samplesRead = bytesAvailable / 2;

  // Process sample values inside ISR or loop?
  // We do basic accumulation quickly to avoid overloading ISR
  for (int i = 0; i < samplesRead; i++) {
    short val = sampleBuffer[i];
    int absVal = abs(val);
    if (absVal > soundPeak) {
      soundPeak = absVal;
    }
    soundSumSq += (long)val * val;
    soundSampleCount++;
  }
}

void setup() {
  Serial.begin(115200);
  
  // Wait up to 3 seconds for Serial connection (USB CDC)
  // Ensures normal execution if powered by external battery bank
  unsigned long start = millis();
  while (!Serial && (millis() - start < 3000));

  Serial.println("{\"log\":\"Initializing Arduino Nano 33 BLE Sense Rev2...\"}");

  // 1. Initialize IMU (BMI270 & BMM150)
  if (IMU.begin()) {
    imuActive = true;
  } else {
    Serial.println("{\"log\":\"Warning: IMU (BMI270/BMM150) failed to initialize!\"}");
  }

  // 2. Initialize Temp & Humidity (HS3003)
  if (HS300x.begin()) {
    hs300xActive = true;
  } else {
    Serial.println("{\"log\":\"Warning: Temp/Humid (HS3003) failed to initialize!\"}");
  }

  // 3. Initialize Barometer (LPS22HB)
  if (BARO.begin()) {
    baroActive = true;
  } else {
    Serial.println("{\"log\":\"Warning: Barometer (LPS22HB) failed to initialize!\"}");
  }

  // 4. Initialize APDS9960 (Color, Proximity, Gesture, Light)
  if (APDS.begin()) {
    apdsActive = true;
    // Set gesture sensitivity (0-100)
    APDS.setGestureSensitivity(80);
  } else {
    Serial.println("{\"log\":\"Warning: APDS9960 failed to initialize!\"}");
  }

  // 5. Initialize PDM Microphone
  PDM.onReceive(onPDMdata);
  // PDM microphone initialized with 1 channel at 16 kHz
  if (PDM.begin(1, 16000)) {
    micActive = true;
    PDM.setGain(20); // Standard gain setting
  } else {
    Serial.println("{\"log\":\"Warning: PDM Microphone failed to initialize!\"}");
  }

  Serial.println("{\"log\":\"Initialization completed. Streaming telemetry...\"}");
  lastSendTime = millis();
}

void loop() {
  unsigned long currentTime = millis();
  
  // Enforce 30 Hz streaming loop rate
  if (currentTime - lastSendTime >= LOOP_DELAY_MS) {
    lastSendTime = currentTime;
    packetId++;

    // --- Read IMU values ---
    float ax = 0, ay = 0, az = 0;
    float gx = 0, gy = 0, gz = 0;
    float mx = 0, my = 0, mz = 0;

    if (imuActive) {
      if (IMU.accelerationAvailable()) IMU.readAcceleration(ax, ay, az);
      if (IMU.gyroscopeAvailable()) IMU.readGyroscope(gx, gy, gz);
      if (IMU.magneticFieldAvailable()) IMU.readMagneticField(mx, my, mz);
    }

    // --- Read HS300x Environment values ---
    float temperature = 0.0;
    float humidity = 0.0;
    if (hs300xActive) {
      temperature = HS300x.readTemperature();
      humidity = HS300x.readHumidity();
    }

    // --- Read LPS22HB Barometer value ---
    float pressure = 0.0;
    if (baroActive) {
      pressure = BARO.readPressure(); // Outputs hPa
    }

    // --- Read APDS9960 Color, Proximity, Gesture, Light values ---
    int r = 0, g = 0, b = 0, c = 0;
    int proximity = 0;
    int light = 0;
    String gestureDetect = "NONE";

    if (apdsActive) {
      // Color & Ambient light (uses clear channel 'c' for raw ambient light value)
      if (APDS.colorAvailable()) {
        APDS.readColor(r, g, b, c);
        light = c;
      }
      
      // Proximity
      if (APDS.proximityAvailable()) {
        proximity = APDS.readProximity(); // 0 (far) - 255 (near)
      }

      // Gesture detection (UP, DOWN, LEFT, RIGHT)
      if (APDS.gestureAvailable()) {
        int gesture = APDS.readGesture();
        switch (gesture) {
          case GESTURE_UP:    gestureDetect = "UP"; break;
          case GESTURE_DOWN:  gestureDetect = "DOWN"; break;
          case GESTURE_LEFT:  gestureDetect = "LEFT"; break;
          case GESTURE_RIGHT: gestureDetect = "RIGHT"; break;
        }
      }
    }

    // --- Dynamic NEAR/FAR Gesture Inference based on Proximity Transitions ---
    if (apdsActive && gestureDetect == "NONE") {
      // If we see a sharp increase in proximity to near-max
      if (proximity > 180 && lastProximity <= 180) {
        gestureDetect = "NEAR";
      }
      // If we see a sharp decrease in proximity to near-min
      else if (proximity < 50 && lastProximity >= 50) {
        gestureDetect = "FAR";
      }
    }
    lastProximity = proximity;

    // --- Handle Gesture Hold Window ---
    if (gestureDetect != "NONE") {
      currentGesture = gestureDetect;
      gestureHoldCounter = 15; // Hold gesture visible for 15 frames (~500ms)
    } else if (gestureHoldCounter > 0) {
      gestureHoldCounter--;
      if (gestureHoldCounter == 0) {
        currentGesture = "NONE";
      }
    }

    // --- Microphone audio metrics (Peak & RMS) ---
    float soundRMS = 0;
    int soundPeakValue = 0;
    
    // Disable interrupts briefly while reading shared PDM variables
    noInterrupts();
    long currentSumSq = soundSumSq;
    int currentPeak = soundPeak;
    int currentCount = soundSampleCount;
    
    // Reset values for next sampling block
    soundSumSq = 0;
    soundPeak = 0;
    soundSampleCount = 0;
    interrupts();

    if (micActive && currentCount > 0) {
      soundRMS = sqrt((float)currentSumSq / currentCount);
      soundPeakValue = currentPeak;
    }

    // --- Construct and stream the JSON packet ---
    Serial.print("{\"timestamp\":");
    Serial.print(currentTime);
    Serial.print(",\"packet_id\":");
    Serial.print(packetId);
    
    // IMU
    Serial.print(",\"accelerometer\":{\"x\":"); Serial.print(ax, 4);
    Serial.print(",\"y\":"); Serial.print(ay, 4);
    Serial.print(",\"z\":"); Serial.print(az, 4); Serial.print("}");
    
    Serial.print(",\"gyroscope\":{\"x\":"); Serial.print(gx, 2);
    Serial.print(",\"y\":"); Serial.print(gy, 2);
    Serial.print(",\"z\":"); Serial.print(gz, 2); Serial.print("}");
    
    Serial.print(",\"magnetometer\":{\"x\":"); Serial.print(mx, 2);
    Serial.print(",\"y\":"); Serial.print(my, 2);
    Serial.print(",\"z\":"); Serial.print(mz, 2); Serial.print("}");
    
    // Environment
    Serial.print(",\"temperature\":"); Serial.print(temperature, 2);
    Serial.print(",\"humidity\":"); Serial.print(humidity, 1);
    Serial.print(",\"pressure\":"); Serial.print(pressure, 2);
    
    // Light & Color
    Serial.print(",\"light\":"); Serial.print(light);
    Serial.print(",\"proximity\":"); Serial.print(proximity);
    Serial.print(",\"color\":{\"r\":"); Serial.print(r);
    Serial.print(",\"g\":"); Serial.print(g);
    Serial.print(",\"b\":"); Serial.print(b); Serial.print("}");
    
    // Gestures & Sound
    Serial.print(",\"gesture\":\""); Serial.print(currentGesture); Serial.print("\"");
    Serial.print(",\"sound\":"); Serial.print(soundPeakValue); // Raw sound value mapped to Peak
    Serial.print(",\"sound_rms\":"); Serial.print(soundRMS, 2);
    Serial.println("}");
  }
}
