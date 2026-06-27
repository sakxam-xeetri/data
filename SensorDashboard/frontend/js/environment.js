/**
 * Environment Dashboard Module.
 * Initializes Canvas-Gauges (Temp, Humidity, Pressure, Altitude),
 * manages rolling historical data queues,
 * computes rolling statistics (min/max/average),
 * draws historical mini-sparkline canvases,
 * and determines barometric pressure trends.
 */

class EnvironmentController {
  constructor() {
    this.gauges = {};
    
    // Telemetry rolling histories
    this.history = {
      temp: [],
      humidity: [],
      pressure: [],
      altitude: []
    };
    
    this.maxPoints = 100;
  }

  init() {
    console.log("Initializing Environment Gauges and Sparklines...");
    this._initGauges();
    this._initSparklines();
  }

  _initGauges() {
    if (typeof RadialGauge === 'undefined') {
      console.warn("RadialGauge library not loaded yet.");
      return;
    }

    // Shared style configuration parameters for gauges (Scientific Telemetry theme)
    const baseGlowConfig = {
      colorPlate: "rgba(15, 23, 42, 0.4)",
      colorNeedle: "#6366f1",
      colorNeedleEnd: "#a855f7",
      colorTitle: "#e2e8f0",
      colorUnits: "#94a3b8",
      colorNumbers: "#cbd5e1",
      borderShadowWidth: 0,
      borders: false,
      needleType: "arrow",
      needleWidth: 3,
      needleCircleSize: 7,
      colorNeedleCircleOuter: "#6366f1",
      colorNeedleCircleInner: "#0f172a",
      needleCircleOuter: true,
      needleCircleInner: true,
      animationDuration: 200,
      animationRule: "linear",
      fontTitleSize: 22,
      fontUnitsSize: 22,
      fontNumbersSize: 22,
      fontValueSize: 24,
      fontUnits: "Outfit",
      fontTitle: "Outfit",
      fontNumbers: "Outfit",
      fontValue: "Outfit",
      valueBox: true,
      colorValueBoxRect: "rgba(0, 0, 0, 0.3)",
      colorValueBoxText: "#f8fafc",
      colorValueBoxBackground: "rgba(15, 23, 42, 0.6)",
      valueDec: 1
    };

    // 1. Temperature Gauge (-10C to 60C)
    this.gauges.temp = new RadialGauge({
      renderTo: 'temp-gauge-canvas',
      width: 170,
      height: 170,
      title: "TEMP",
      units: "°C",
      minValue: -10,
      maxValue: 60,
      majorTicks: ["-10", "0", "10", "20", "30", "40", "50", "60"],
      minorTicks: 5,
      strokeTicks: true,
      highlights: [
        { from: -10, to: 0, color: 'rgba(59, 130, 246, 0.2)' },
        { from: 0, to: 35, color: 'rgba(99, 102, 241, 0.15)' },
        { from: 35, to: 60, color: 'rgba(239, 68, 68, 0.25)' }
      ],
      ...baseGlowConfig
    }).draw();

    // 2. Humidity Gauge (0% to 100%)
    this.gauges.humidity = new RadialGauge({
      renderTo: 'humidity-gauge-canvas',
      width: 170,
      height: 170,
      title: "HUMIDITY",
      units: "%",
      minValue: 0,
      maxValue: 100,
      majorTicks: ["0", "20", "40", "60", "80", "100"],
      minorTicks: 2,
      strokeTicks: true,
      highlights: [
        { from: 0, to: 30, color: 'rgba(245, 158, 11, 0.2)' },
        { from: 30, to: 70, color: 'rgba(16, 185, 129, 0.15)' },
        { from: 70, to: 100, color: 'rgba(6, 182, 212, 0.2)' }
      ],
      ...baseGlowConfig
    }).draw();

    // 3. Pressure Gauge (900 to 1100 hPa)
    this.gauges.pressure = new RadialGauge({
      renderTo: 'pressure-gauge-canvas',
      width: 170,
      height: 170,
      title: "PRESSURE",
      units: "hPa",
      minValue: 900,
      maxValue: 1100,
      majorTicks: ["900", "940", "980", "1020", "1060", "1100"],
      minorTicks: 5,
      strokeTicks: true,
      highlights: [
        { from: 900, to: 980, color: 'rgba(239, 68, 68, 0.2)' },
        { from: 980, to: 1040, color: 'rgba(99, 102, 241, 0.15)' },
        { from: 1040, to: 1100, color: 'rgba(16, 185, 129, 0.2)' }
      ],
      ...baseGlowConfig,
      valueDec: 1
    }).draw();

    // 4. Altitude Gauge (-100 to 2000 m)
    this.gauges.altitude = new RadialGauge({
      renderTo: 'altitude-gauge-canvas',
      width: 170,
      height: 170,
      title: "ALTITUDE",
      units: "m",
      minValue: -100,
      maxValue: 2000,
      majorTicks: ["-100", "300", "700", "1100", "1500", "2000"],
      minorTicks: 10,
      strokeTicks: true,
      highlights: [
        { from: -100, to: 2000, color: 'rgba(168, 85, 247, 0.15)' }
      ],
      ...baseGlowConfig,
      valueDec: 1
    }).draw();
  }

  _initSparklines() {
    this.sparklineCanvases = {
      temp: document.getElementById("temp-sparkline"),
      humidity: document.getElementById("humid-sparkline"),
      pressure: document.getElementById("press-sparkline"),
      altitude: document.getElementById("alt-sparkline")
    };
  }

  update(packet) {
    const temp = packet.temperature || 0.0;
    const humidity = packet.humidity || 0.0;
    const pressure = packet.pressure || 0.0;
    const altitude = (packet.derived && packet.derived.altitude) || 0.0;

    // 1. Update Gauge values
    if (this.gauges.temp) this.gauges.temp.value = temp;
    if (this.gauges.humidity) this.gauges.humidity.value = humidity;
    if (this.gauges.pressure) this.gauges.pressure.value = pressure;
    if (this.gauges.altitude) this.gauges.altitude.value = altitude;

    // 2. Append to rolling queues
    this._appendHistory("temp", temp);
    this._appendHistory("humidity", humidity);
    this._appendHistory("pressure", pressure);
    this._appendHistory("altitude", altitude);

    // 3. Compute stats and update card labels
    this._updateStatsUI("temp", "°C");
    this._updateStatsUI("humidity", "%");
    this._updateStatsUI("pressure", " hPa");
    this._updateStatsUI("altitude", " m");

    // 4. Calculate and update pressure trend
    this._updatePressureTrend(pressure);

    // 5. Draw Sparkline canvases
    this._drawSparkline("temp", "#06b6d4");     // Cyan sparkline
    this._drawSparkline("humidity", "#10b981"); // Green sparkline
    this._drawSparkline("pressure", "#3b82f6"); // Blue sparkline
    this._drawSparkline("altitude", "#a855f7"); // Purple sparkline
  }

  _appendHistory(key, val) {
    const list = this.history[key];
    list.push(val);
    if (list.length > this.maxPoints) {
      list.shift();
    }
  }

  _updateStatsUI(key, unit) {
    const list = this.history[key];
    if (list.length === 0) return;

    const min = Math.min(...list);
    const max = Math.max(...list);
    const sum = list.reduce((a, b) => a + b, 0);
    const avg = sum / list.length;

    // Update panel selectors
    const minEl = document.getElementById(`${key}-min`);
    const maxEl = document.getElementById(`${key}-max`);
    const avgEl = document.getElementById(`${key}-avg`);

    if (minEl) minEl.textContent = `${min.toFixed(1)}${unit}`;
    if (maxEl) maxEl.textContent = `${max.toFixed(1)}${unit}`;
    if (avgEl) avgEl.textContent = `${avg.toFixed(1)}${unit}`;
  }

  _updatePressureTrend(currentPressure) {
    const list = this.history.pressure;
    if (list.length < 20) return; // Need enough history for stability

    // Compare against historical benchmark from 15 frames back (~500ms at 30Hz)
    const prevPressure = list[list.length - 15];
    const diff = currentPressure - prevPressure;
    
    const trendLabel = document.getElementById("pressure-trend");
    const trendIcon = document.getElementById("pressure-trend-icon");
    if (!trendLabel) return;

    if (Math.abs(diff) < 0.05) {
      trendLabel.textContent = "STABLE";
      trendLabel.className = "text-slate-400 font-bold glow-cyan";
      if (trendIcon) trendIcon.innerHTML = "&#x2194;"; // Horizontal arrow
    } else if (diff >= 0.05) {
      trendLabel.textContent = "RISING";
      trendLabel.className = "text-emerald-400 font-bold glow-green";
      if (trendIcon) trendIcon.innerHTML = "&#x2197;"; // Up-Right arrow
    } else {
      trendLabel.textContent = "FALLING";
      trendLabel.className = "text-rose-500 font-bold";
      if (trendIcon) trendIcon.innerHTML = "&#x2198;"; // Down-Right arrow
    }
  }

  _drawSparkline(key, strokeColor) {
    const canvas = this.sparklineCanvases[key];
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const width = canvas.width = canvas.clientWidth;
    const height = canvas.height = canvas.clientHeight || 50;

    const list = this.history[key];
    if (list.length < 2) return;

    ctx.clearRect(0, 0, width, height);

    // Grid center line
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    
    // Set line gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, strokeColor);
    gradient.addColorStop(1, "rgba(99, 102, 241, 0.1)");

    ctx.beginPath();

    const min = Math.min(...list);
    const max = Math.max(...list);
    const range = (max - min) === 0 ? 1 : (max - min);

    const step = width / (this.maxPoints - 1);

    for (let i = 0; i < list.length; i++) {
      const normalized = (list[i] - min) / range;
      const x = i * step;
      // Subtract from height to invert canvas coords
      const y = height - (normalized * (height - 6)) - 3; // padding of 3px

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Fill area under line
    ctx.lineTo((list.length - 1) * step, height);
    ctx.lineTo(0, height);
    ctx.fillStyle = "rgba(99, 102, 241, 0.05)";
    ctx.fill();
  }
}

// Attach globally
window.Environment = new EnvironmentController();
window.addEventListener("DOMContentLoaded", () => {
  window.Environment.init();
});
