/**
 * Light & Color Dashboard Module.
 * Renders the Ambient Light RadialGauge,
 * drives the interactive RGB color card,
 * and animates the live RGB level bars.
 */

class LightColorController {
  constructor() {
    this.lightGauge = null;
  }

  init() {
    console.log("Initializing Light and Color Visualizers...");
    this._initGauges();
  }

  _initGauges() {
    if (typeof RadialGauge === 'undefined') return;

    // Ambient Light Gauge (0 to 1000 Lux range)
    this.lightGauge = new RadialGauge({
      renderTo: 'light-gauge-canvas',
      width: 170,
      height: 170,
      title: "LIGHT",
      units: "Lux",
      minValue: 0,
      maxValue: 1000,
      majorTicks: ["0", "200", "400", "600", "800", "1000"],
      minorTicks: 10,
      strokeTicks: true,
      highlights: [
        { from: 0, to: 300, color: 'rgba(15, 23, 42, 0.4)' },
        { from: 300, to: 700, color: 'rgba(245, 158, 11, 0.15)' },
        { from: 700, to: 1000, color: 'rgba(245, 158, 11, 0.3)' }
      ],
      colorPlate: "rgba(15, 23, 42, 0.4)",
      colorNeedle: "#f59e0b", // Yellow needle
      colorNeedleEnd: "#d97706",
      colorTitle: "#e2e8f0",
      colorUnits: "#94a3b8",
      colorNumbers: "#cbd5e1",
      borderShadowWidth: 0,
      borders: false,
      needleType: "arrow",
      needleWidth: 3,
      needleCircleSize: 7,
      colorNeedleCircleOuter: "#f59e0b",
      colorNeedleCircleInner: "#0f172a",
      needleCircleOuter: true,
      needleCircleInner: true,
      animationDuration: 150,
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
      valueDec: 0
    }).draw();
  }

  update(packet) {
    const lux = packet.light || 0;
    const color = packet.color || { r: 0, g: 0, b: 0 };
    
    // 1. Update Lux Gauge
    if (this.lightGauge) {
      this.lightGauge.value = lux;
    }

    // 2. Update Animated Color Card
    const colorCard = document.getElementById("color-card-bg");
    const colorText = document.getElementById("color-text-val");
    const colorHex = document.getElementById("color-hex-val");

    if (colorCard) {
      // Add subtle glow to card shadow in sync with color channels!
      colorCard.style.backgroundColor = `rgb(${color.r}, ${color.g}, ${color.b})`;
      colorCard.style.boxShadow = `0 10px 30px -5px rgba(${color.r}, ${color.g}, ${color.b}, 0.4)`;
    }

    if (colorText) {
      colorText.textContent = `RED: ${color.r} | GREEN: ${color.g} | BLUE: ${color.b}`;
    }

    if (colorHex) {
      const hexStr = this._rgbToHex(color.r, color.g, color.b);
      colorHex.textContent = hexStr;
    }

    // 3. Update RGB Level Bar Heights
    this._updateRGBBar("red", color.r);
    this._updateRGBBar("green", color.g);
    this._updateRGBBar("blue", color.b);
  }

  _updateRGBBar(channel, value) {
    const bar = document.getElementById(`rgb-bar-${channel}`);
    const label = document.getElementById(`rgb-val-${channel}`);
    
    if (bar) {
      // Normalize 0-255 to percentage height
      const percentage = (value / 255) * 100;
      bar.style.height = `${Math.max(4, percentage)}%`; // Minimum height 4% for design visibility
    }
    
    if (label) {
      label.textContent = value;
    }
  }

  _componentToHex(c) {
    const hex = c.toString(16).toUpperCase();
    return hex.length == 1 ? "0" + hex : hex;
  }

  _rgbToHex(r, g, b) {
    return "#" + this._componentToHex(r) + this._componentToHex(g) + this._componentToHex(b);
  }
}

// Attach globally
window.LightColor = new LightColorController();
window.addEventListener("DOMContentLoaded", () => {
  window.LightColor.init();
});
