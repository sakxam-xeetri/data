/**
 * IMU Dashboard Module.
 * Initializes Three.js WebGL scene, builds a detailed procedural Arduino Nano model,
 * runs sensor fusion tilt-compensated compass yaw algorithms,
 * updates IMU numerical panels, and draws high-frequency rolling canvas sparklines.
 */

class IMUController {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.board = null;
    this.controls = null;
    
    // Axes helpers
    this.localAxes = null;
    this.worldAxes = null;
    
    // Rotation state
    this.pitch = 0.0;
    this.roll = 0.0;
    this.yaw = 0.0;
    
    // Charts variables
    this.accelHistory = { x: [], y: [], z: [] };
    this.gyroHistory = { x: [], y: [], z: [] };
    this.maxHistoryPoints = 150;
  }

  init() {
    console.log("Initializing IMU Three.js Visualizer...");
    this._initThree();
    this._initCanvasSparklines();
  }

  _initThree() {
    const container = document.getElementById("three-container");
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight || 300;

    // 1. Create Scene
    this.scene = new THREE.Scene();
    this.scene.background = null; // transparent to inherit page theme

    // 2. Camera Setup
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(6, 4, 8);

    // 3. Renderer Setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    // 4. Add Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(5, 10, 7);
    dirLight.castShadow = true;
    this.scene.add(dirLight);

    // 5. Add Axes Helpers
    this.worldAxes = new THREE.AxesHelper(3);
    this.scene.add(this.worldAxes);

    // 6. Build the Board Group
    this.board = new THREE.Group();
    this._buildProceduralArduino();
    
    // Add local axes to the board so they rotate with it
    this.localAxes = new THREE.AxesHelper(1.5);
    // Tint local axes slightly differently to distinguish from world
    this.localAxes.material.opacity = 0.6;
    this.localAxes.material.transparent = true;
    this.board.add(this.localAxes);

    this.scene.add(this.board);

    // 7. Add Orbit Controls
    if (typeof THREE.OrbitControls !== 'undefined') {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.maxPolarAngle = Math.PI / 2 + 0.1; // Don't orbit below ground
    }

    // 8. Handle Resizing
    window.addEventListener("resize", () => {
      if (!container || !this.camera || !this.renderer) return;
      const w = container.clientWidth;
      const h = container.clientHeight || 300;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });

    // 9. Start Render Loop
    const animate = () => {
      requestAnimationFrame(animate);
      if (this.controls) this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  _buildProceduralArduino() {
    // Generates a beautiful schematic 3D Arduino Nano 33 BLE Sense board using primitives
    
    // 1. PCB (Arduino Teal Blue)
    const pcbGeo = new THREE.BoxGeometry(3, 0.1, 7);
    const pcbMat = new THREE.MeshPhongMaterial({ color: 0x00979c, shininess: 30 });
    const pcbMesh = new THREE.Mesh(pcbGeo, pcbMat);
    pcbMesh.receiveShadow = true;
    this.board.add(pcbMesh);

    // 2. Micro USB Port (Silver metallic box at back end, z = -3.3)
    const usbGeo = new THREE.BoxGeometry(0.8, 0.4, 1.0);
    const usbMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
    const usbMesh = new THREE.Mesh(usbGeo, usbMat);
    usbMesh.position.set(0, 0.25, -3.2);
    this.board.add(usbMesh);

    // 3. BLE Nina-B306 Module (Metal shield box at middle-back)
    const ninaGeo = new THREE.BoxGeometry(1.2, 0.3, 1.5);
    const ninaMat = new THREE.MeshStandardMaterial({ color: 0xa8a29e, metalness: 0.9, roughness: 0.1 });
    const ninaMesh = new THREE.Mesh(ninaGeo, ninaMat);
    ninaMesh.position.set(0, 0.2, -1.0);
    this.board.add(ninaMesh);

    // 4. Main Processor CPU (Dark gray square chip at center)
    const cpuGeo = new THREE.BoxGeometry(0.8, 0.15, 0.8);
    const cpuMat = new THREE.MeshPhongMaterial({ color: 0x1f2937 });
    const cpuMesh = new THREE.Mesh(cpuGeo, cpuMat);
    cpuMesh.position.set(0, 0.12, 1.0);
    this.board.add(cpuMesh);

    // 5. APDS9960 Sensor (Small black package with gold core at front-middle)
    const apdsGeo = new THREE.BoxGeometry(0.4, 0.12, 0.4);
    const apdsMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
    const apdsMesh = new THREE.Mesh(apdsGeo, apdsMat);
    apdsMesh.position.set(0.5, 0.11, 2.5);
    this.board.add(apdsMesh);

    const lensGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.03, 8);
    const lensMat = new THREE.MeshPhongMaterial({ color: 0xf59e0b, emissive: 0xd97706 });
    const lensMesh = new THREE.Mesh(lensGeo, lensMat);
    lensMesh.position.set(0.5, 0.18, 2.5);
    this.board.add(lensMesh);

    // 6. Color LED indicators (RGB LEDs)
    const ledGeo = new THREE.BoxGeometry(0.15, 0.1, 0.15);
    const ledMat = new THREE.MeshPhongMaterial({ color: 0xff3333, emissive: 0xff0000 });
    const ledMesh = new THREE.Mesh(ledGeo, ledMat);
    ledMesh.position.set(-0.8, 0.1, 2.5);
    this.board.add(ledMesh);

    // 7. Side Pin Headers (Two black long boxes down the sides with gold pins pointing down)
    const leftHeaderGeo = new THREE.BoxGeometry(0.2, 0.5, 6.2);
    const rightHeaderGeo = new THREE.BoxGeometry(0.2, 0.5, 6.2);
    const headerMat = new THREE.MeshPhongMaterial({ color: 0x374151 });
    
    const leftHeader = new THREE.Mesh(leftHeaderGeo, headerMat);
    leftHeader.position.set(-1.35, -0.25, 0);
    this.board.add(leftHeader);

    const rightHeader = new THREE.Mesh(rightHeaderGeo, headerMat);
    rightHeader.position.set(1.35, -0.25, 0);
    this.board.add(rightHeader);

    // Build the pins pointing down
    const pinGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.8, 4);
    const pinMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.2 }); // Gold pins
    
    for (let z = -2.8; z <= 2.8; z += 0.8) {
      const pinLeft = new THREE.Mesh(pinGeo, pinMat);
      pinLeft.position.set(-1.35, -0.7, z);
      this.board.add(pinLeft);

      const pinRight = new THREE.Mesh(pinGeo, pinMat);
      pinRight.position.set(1.35, -0.7, z);
      this.board.add(pinRight);
    }
  }

  _initCanvasSparklines() {
    this.accelCanvas = document.getElementById("accel-sparkline");
    this.gyroCanvas = document.getElementById("gyro-sparkline");
  }

  update(packet) {
    // 1. Read derived properties
    const dev = packet.derived || {};
    this.pitch = dev.pitch || 0.0;
    this.roll = dev.roll || 0.0;
    
    // 2. Perform sensor-fusion tilt-compensated compass yaw calculation
    const accel = packet.accelerometer || { x: 0, y: 0, z: 1 };
    const mag = packet.magnetometer || { x: 0, y: 0, z: 0 };
    
    const pitchRad = (this.pitch * Math.PI) / 180.0;
    const rollRad = (this.roll * Math.PI) / 180.0;
    
    // Compensation formulas
    const Xh = mag.x * Math.cos(pitchRad) + mag.z * Math.sin(pitchRad);
    const Yh = mag.x * Math.sin(rollRad) * Math.sin(pitchRad) + mag.y * Math.cos(rollRad) - mag.z * Math.sin(rollRad) * Math.cos(pitchRad);
    
    let heading = Math.atan2(-Yh, Xh) * 180.0 / Math.PI;
    if (heading < 0) heading += 360;
    this.yaw = heading;

    // 3. Rotate Three.js model
    // Accel pitch corresponds to rotation around X
    // Accel roll corresponds to rotation around Z
    // Compass heading corresponds to rotation around Y
    if (this.board) {
      // Smooth transitions using slerp or raw rotation setting (standard dashboard updates are fast enough at 30Hz)
      this.board.rotation.x = rollRad;
      this.board.rotation.y = - (heading * Math.PI / 180.0); // Invert yaw to rotate model logically
      this.board.rotation.z = - pitchRad;
    }

    // 4. Update Compass visual representation
    const compassDial = document.getElementById("compass-dial");
    const headingValue = document.getElementById("heading-value");
    if (compassDial) {
      // Rotate the compass dial SVG according to heading
      compassDial.style.transform = `rotate(${-heading}deg)`;
    }
    if (headingValue) {
      headingValue.textContent = `${Math.round(heading)}°`;
    }

    // 5. Update numerical panels
    this._updateCardText("imu-pitch", `${this.pitch.toFixed(1)}°`);
    this._updateCardText("imu-roll", `${this.roll.toFixed(1)}°`);
    this._updateCardText("imu-yaw", `${this.yaw.toFixed(1)}°`);
    
    const ax = accel.x, ay = accel.y, az = accel.z;
    this._updateCardText("accel-val", `X: ${ax.toFixed(2)} | Y: ${ay.toFixed(2)} | Z: ${az.toFixed(2)}`);
    this._updateCardText("accel-mag", `${(dev.accel_magnitude || 0).toFixed(2)} g`);
    
    const gyro = packet.gyroscope || { x: 0, y: 0, z: 0 };
    this._updateCardText("gyro-val", `X: ${gyro.x.toFixed(1)} | Y: ${gyro.y.toFixed(1)} | Z: ${gyro.z.toFixed(1)}`);
    this._updateCardText("gyro-mag", `${(dev.gyro_magnitude || 0).toFixed(0)} dps`);

    const magVal = packet.magnetometer || { x: 0, y: 0, z: 0 };
    this._updateCardText("mag-val", `X: ${magVal.x.toFixed(1)} | Y: ${magVal.y.toFixed(1)} | Z: ${magVal.z.toFixed(1)}`);

    // Update Matrix / Quaternions representations text
    this._updateMatrixText(rollRad, pitchRad, heading * Math.PI / 180.0);

    // 6. Draw Sparklines
    this._updateSparklineData(accel, gyro);
    this._drawSparkline(this.accelCanvas, this.accelHistory, -2.0, 2.0, ["#ef4444", "#10b981", "#3b82f6"]);
    this._drawSparkline(this.gyroCanvas, this.gyroHistory, -250, 250, ["#ef4444", "#10b981", "#3b82f6"]);
  }

  _updateCardText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  _updateMatrixText(roll, pitch, yaw) {
    // Calculates and displays the 3D Rotation Matrix and Quaternions on panels
    const q = new THREE.Quaternion();
    const e = new THREE.Euler(roll, -yaw, -pitch, 'YXZ');
    q.setFromEuler(e);

    const quaternionText = document.getElementById("imu-quaternion");
    if (quaternionText) {
      quaternionText.textContent = `W: ${q.w.toFixed(3)}, X: ${q.x.toFixed(3)}, Y: ${q.y.toFixed(3)}, Z: ${q.z.toFixed(3)}`;
    }

    const matrixText = document.getElementById("imu-matrix");
    if (matrixText) {
      const m = new THREE.Matrix4();
      m.makeRotationFromQuaternion(q);
      const te = m.elements;
      // Format 3x3 rotation representation
      matrixText.innerHTML = `
        [ ${te[0].toFixed(2)}, ${te[4].toFixed(2)}, ${te[8].toFixed(2)} ]<br>
        [ ${te[1].toFixed(2)}, ${te[5].toFixed(2)}, ${te[9].toFixed(2)} ]<br>
        [ ${te[2].toFixed(2)}, ${te[6].toFixed(2)}, ${te[10].toFixed(2)} ]
      `;
    }
  }

  _updateSparklineData(accel, gyro) {
    // Slide values into history array
    this.accelHistory.x.push(accel.x);
    this.accelHistory.y.push(accel.y);
    this.accelHistory.z.push(accel.z);

    this.gyroHistory.x.push(gyro.x);
    this.gyroHistory.y.push(gyro.y);
    this.gyroHistory.z.push(gyro.z);

    if (this.accelHistory.x.length > this.maxHistoryPoints) {
      this.accelHistory.x.shift();
      this.accelHistory.y.shift();
      this.accelHistory.z.shift();
      
      this.gyroHistory.x.shift();
      this.gyroHistory.y.shift();
      this.gyroHistory.z.shift();
    }
  }

  _drawSparkline(canvas, dataObj, minVal, maxVal, colors) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = canvas.width = canvas.clientWidth;
    const height = canvas.height = canvas.clientHeight || 80;

    ctx.clearRect(0, 0, width, height);

    // Draw grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    const keys = ["x", "y", "z"];
    keys.forEach((key, colorIdx) => {
      const history = dataObj[key];
      if (history.length < 2) return;

      ctx.strokeStyle = colors[colorIdx];
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      const step = width / (this.maxHistoryPoints - 1);
      const range = maxVal - minVal;

      for (let i = 0; i < history.length; i++) {
        // Clamp and normalize value to fit height
        const val = Math.max(minVal, Math.min(maxVal, history[i]));
        const normalized = (val - minVal) / range;
        const x = i * step;
        const y = height - (normalized * height);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    });
  }

  toggleAxes(local, world) {
    if (this.localAxes) this.localAxes.visible = local;
    if (this.worldAxes) this.worldAxes.visible = world;
  }
}

// Attach to global scope
window.IMU = new IMUController();
window.addEventListener("DOMContentLoaded", () => {
  window.IMU.init();
});
