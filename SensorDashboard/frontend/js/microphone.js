/**
 * Microphone Dashboard Module.
 * Visualizes microphone audio metrics.
 * Implements a dual-input architecture:
 * 1. Arduino Mode: Synthesizes oscilloscope waves and spectral distributions at 30Hz based on serial peak/RMS.
 * 2. Browser Mode: Captures true, high-fidelity browser mic stream using Web Audio API and AnalyserNode at 60FPS.
 */

class MicrophoneController {
  constructor() {
    this.inputMode = "arduino"; // "arduino" or "browser"
    
    // Canvas dimensions
    this.waveCanvas = null;
    this.fftCanvas = null;
    
    // Arduino Mode metrics
    this.peak = 0;
    this.rms = 0.0;
    
    // Web Audio API objects (Browser Mode)
    this.audioContext = null;
    this.analyser = null;
    this.microphoneStream = null;
    this.dataArray = null;
    this.bufferLength = 0;
    
    // Animation frame handle
    this.animFrameId = null;
    
    // Historical sound log
    this.soundHistory = [];
    this.maxHistoryPoints = 120;
    this.historyCanvas = null;
  }

  init() {
    console.log("Initializing Microphone Tab Visualizers...");
    this.waveCanvas = document.getElementById("mic-waveform-canvas");
    this.fftCanvas = document.getElementById("mic-fft-canvas");
    this.historyCanvas = document.getElementById("mic-history-canvas");

    this._setupInputToggle();
    
    // Start the drawing loop (updates canvases at browser refresh rate)
    this._startDrawLoop();
  }

  _setupInputToggle() {
    const btnArduino = document.getElementById("mic-btn-arduino");
    const btnBrowser = document.getElementById("mic-btn-browser");

    if (btnArduino && btnBrowser) {
      btnArduino.addEventListener("click", () => {
        this.setMode("arduino");
      });
      btnBrowser.addEventListener("click", () => {
        this.setMode("browser");
      });
    }
  }

  async setMode(mode) {
    if (this.inputMode === mode) return;
    this.inputMode = mode;
    console.log(`Microphone input source changed to: ${mode}`);

    // Update button selections
    const btnArduino = document.getElementById("mic-btn-arduino");
    const btnBrowser = document.getElementById("mic-btn-browser");

    if (mode === "browser") {
      if (btnArduino) btnArduino.className = "px-3 py-1.5 rounded-md text-xs font-semibold bg-slate-800/40 text-slate-400 hover:bg-slate-700/50";
      if (btnBrowser) btnBrowser.className = "px-3 py-1.5 rounded-md text-xs font-semibold bg-indigo-600 text-white shadow-lg shadow-indigo-600/30";
      
      // Request permission and start analyzer
      await this._startBrowserMic();
    } else {
      if (btnArduino) btnArduino.className = "px-3 py-1.5 rounded-md text-xs font-semibold bg-indigo-600 text-white shadow-lg shadow-indigo-600/30";
      if (btnBrowser) btnBrowser.className = "px-3 py-1.5 rounded-md text-xs font-semibold bg-slate-800/40 text-slate-400 hover:bg-slate-700/50";
      
      // Stop browser audio processes
      this._stopBrowserMic();
    }

    if (window.App) {
      window.App.showToast(`Microphone mode: ${mode.toUpperCase()}`, "success");
    }
  }

  async _startBrowserMic() {
    try {
      this._stopBrowserMic(); // Clean first
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.microphoneStream = stream;

      // Initialize AudioContext
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
      
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256; // 128 frequency bars

      source.connect(this.analyser);

      this.bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(this.bufferLength);
      
      console.log("Browser microphone recording active.");
    } catch (err) {
      console.error("Access to browser microphone was denied or failed:", err);
      if (window.App) {
        window.App.showToast("Failed to access local microphone.", "error");
      }
      this.setMode("arduino"); // Fallback
    }
  }

  _stopBrowserMic() {
    if (this.microphoneStream) {
      this.microphoneStream.getTracks().forEach(track => track.stop());
      this.microphoneStream = null;
    }
    if (this.audioContext) {
      if (this.audioContext.state !== "closed") {
        this.audioContext.close();
      }
      this.audioContext = null;
    }
    this.analyser = null;
    this.dataArray = null;
    console.log("Browser microphone recording stopped.");
  }

  update(packet) {
    // Only capture numeric metrics from Arduino telemetry
    // (Used as primary source in Arduino mode, or as card stats)
    this.peak = packet.sound || 0;
    this.rms = packet.sound_rms || 0.0;

    // Update sound intensity history queue
    this.soundHistory.push(this.rms);
    if (this.soundHistory.length > this.maxHistoryPoints) {
      this.soundHistory.shift();
    }

    // Update Numerical Cards
    const elPeak = document.getElementById("mic-peak");
    const elRMS = document.getElementById("mic-rms");
    const elMeterVal = document.getElementById("mic-meter-fill");

    if (elPeak) elPeak.textContent = this.peak;
    if (elRMS) elRMS.textContent = this.rms.toFixed(1);
    
    if (elMeterVal) {
      // Map Peak value (0-2000 standard range) to scale percent
      const percent = Math.min(100, (this.peak / 1500) * 100);
      elMeterVal.style.width = `${percent}%`;
      // Change color based on peak range
      if (percent < 50) {
        elMeterVal.className = "h-full bg-emerald-500 rounded-lg transition-all duration-75";
      } else if (percent < 85) {
        elMeterVal.className = "h-full bg-amber-500 rounded-lg transition-all duration-75";
      } else {
        elMeterVal.className = "h-full bg-rose-500 rounded-lg transition-all duration-75";
      }
    }
  }

  _startDrawLoop() {
    const draw = () => {
      this.animFrameId = requestAnimationFrame(draw);

      if (this.inputMode === "browser" && this.analyser && this.dataArray) {
        // --- REAL MODE: Draw using Web Audio API data ---
        
        // 1. Get FFT and Waveform arrays
        const timeData = new Uint8Array(this.bufferLength);
        this.analyser.getByteTimeDomainData(timeData);
        this.analyser.getByteFrequencyData(this.dataArray);

        // Calculate dynamic Peak & RMS from Web Audio stream to sync stats cards!
        let sumSq = 0;
        let peakMax = 0;
        for (let i = 0; i < timeData.length; i++) {
          const val = (timeData[i] - 128) / 128.0; // scale -1.0 to 1.0
          sumSq += val * val;
          const absVal = Math.abs(timeData[i] - 128);
          if (absVal > peakMax) peakMax = absVal;
        }
        const calculatedRMS = Math.sqrt(sumSq / timeData.length) * 1000;
        const calculatedPeak = peakMax * 20; // Scale to match Arduino range
        
        // Update cards with browser values when in browser mode
        const elPeak = document.getElementById("mic-peak");
        const elRMS = document.getElementById("mic-rms");
        if (elPeak) elPeak.textContent = Math.round(calculatedPeak);
        if (elRMS) elRMS.textContent = calculatedRMS.toFixed(1);

        // Draw Browser Oscilloscope
        this._drawRealWaveform(timeData);
        // Draw Browser FFT Bars
        this._drawRealFFT(this.dataArray);

      } else {
        // --- ARDUINO SIMULATED MODE: Synthesize graphics ---
        this._drawSimulatedWaveform();
        this._drawSimulatedFFT();
      }

      // Always draw the history rolling graph
      this._drawHistoryGraph();
    };

    draw();
  }

  _drawRealWaveform(timeData) {
    if (!this.waveCanvas) return;
    const ctx = this.waveCanvas.getContext("2d");
    const width = this.waveCanvas.width = this.waveCanvas.clientWidth;
    const height = this.waveCanvas.height = this.waveCanvas.clientHeight || 120;

    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = "#06b6d4"; // Cyan trace line
    ctx.lineWidth = 2.0;
    ctx.beginPath();

    const sliceWidth = width / timeData.length;
    let x = 0;

    for (let i = 0; i < timeData.length; i++) {
      const v = timeData[i] / 128.0; // normalize 0-2
      const y = (v * height) / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }
    ctx.stroke();
  }

  _drawRealFFT(frequencyData) {
    if (!this.fftCanvas) return;
    const ctx = this.fftCanvas.getContext("2d");
    const width = this.fftCanvas.width = this.fftCanvas.clientWidth;
    const height = this.fftCanvas.height = this.fftCanvas.clientHeight || 120;

    ctx.clearRect(0, 0, width, height);

    const barWidth = (width / frequencyData.length) * 1.5;
    let barHeight;
    let x = 0;

    // Draw bars
    for (let i = 0; i < frequencyData.length; i++) {
      barHeight = (frequencyData[i] / 255.0) * height;

      // Color gradient transitions purple to indigo
      const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
      gradient.addColorStop(0, "rgba(99, 102, 241, 0.4)");
      gradient.addColorStop(1, "rgba(168, 85, 247, 0.85)");

      ctx.fillStyle = gradient;
      ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);

      x += barWidth;
    }
  }

  _drawSimulatedWaveform() {
    if (!this.waveCanvas) return;
    const ctx = this.waveCanvas.getContext("2d");
    const width = this.waveCanvas.width = this.waveCanvas.clientWidth;
    const height = this.waveCanvas.height = this.waveCanvas.clientHeight || 120;

    ctx.clearRect(0, 0, width, height);
    
    // Draw static center line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Map Arduino RMS level to simulated wave amplitude
    const amp = Math.min(height / 2 - 5, (this.rms / 50.0) * (height / 2));
    if (amp <= 1) return; // Keep trace silent if no amplitude

    ctx.strokeStyle = "#6366f1"; // Indigo wave
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    const t = Date.now() / 150.0;
    const points = 180;
    const step = width / points;

    for (let i = 0; i < points; i++) {
      const angle = (i / points) * Math.PI * 8;
      // Compose multiple frequencies for voice-like trace
      const sineVal = Math.sin(angle + t) * 0.7 + Math.sin(angle * 2.5 - t * 1.5) * 0.3;
      
      // Multiplied by envelope (fade out at ends)
      const envelope = Math.sin((i / points) * Math.PI);
      const y = height / 2 + sineVal * amp * envelope;

      if (i === 0) {
        ctx.moveTo(0, y);
      } else {
        ctx.lineTo(i * step, y);
      }
    }
    ctx.stroke();
  }

  _drawSimulatedFFT() {
    if (!this.fftCanvas) return;
    const ctx = this.fftCanvas.getContext("2d");
    const width = this.fftCanvas.width = this.fftCanvas.clientWidth;
    const height = this.fftCanvas.height = this.fftCanvas.clientHeight || 120;

    ctx.clearRect(0, 0, width, height);

    const bars = 40;
    const barWidth = width / bars;
    const t = Date.now() / 300.0;

    for (let i = 0; i < bars; i++) {
      // Map height using RMS and mathematical noise model
      const baseVal = Math.sin(i * 0.2 + t) * 0.3 + 0.5;
      const noise = Math.sin(i * 1.8 - t * 2) * 0.2;
      const normalizedHeight = Math.max(0.05, (baseVal + noise) * (this.rms / 60.0));
      
      const barHeight = Math.min(height, normalizedHeight * height);

      const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
      gradient.addColorStop(0, "rgba(99, 102, 241, 0.4)");
      gradient.addColorStop(1, "rgba(6, 182, 212, 0.8)");

      ctx.fillStyle = gradient;
      ctx.fillRect(i * barWidth, height - barHeight, barWidth - 2, barHeight);
    }
  }

  _drawHistoryGraph() {
    const canvas = this.historyCanvas;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const width = canvas.width = canvas.clientWidth;
    const height = canvas.height = canvas.clientHeight || 100;

    ctx.clearRect(0, 0, width, height);

    if (this.soundHistory.length < 2) return;

    // Draw baseline
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    ctx.strokeStyle = "#a855f7"; // Purple history line
    ctx.lineWidth = 2.0;
    ctx.beginPath();

    const maxVal = Math.max(20.0, ...this.soundHistory); // Min max reference of 20
    const step = width / (this.maxHistoryPoints - 1);

    for (let i = 0; i < this.soundHistory.length; i++) {
      const normalized = this.soundHistory[i] / maxVal;
      const x = i * step;
      const y = height - (normalized * (height - 8)) - 4;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Fade area below line
    ctx.lineTo((this.soundHistory.length - 1) * step, height);
    ctx.lineTo(0, height);
    ctx.fillStyle = "rgba(168, 85, 247, 0.04)";
    ctx.fill();
  }

  shutdown() {
    this._stopBrowserMic();
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }
  }
}

// Attach globally
window.Microphone = new MicrophoneController();
window.addEventListener("DOMContentLoaded", () => {
  window.Microphone.init();
});
