/**
 * Proximity & Gesture Recognition Dashboard Module.
 * Renders the Proximity RadialGauge,
 * monitors active gesture events,
 * and handles flash animations for gesture card vectors.
 */

class ProximityController {
  constructor() {
    this.proximityGauge = null;
    this.activeGestureTimeout = null;
    this.lastGesture = "NONE";
  }

  init() {
    console.log("Initializing Proximity Gauge and Gestures Controller...");
    this._initGauges();
  }

  _initGauges() {
    if (typeof RadialGauge === 'undefined') return;

    // Proximity Gauge (0 to 255 range)
    this.proximityGauge = new RadialGauge({
      renderTo: 'proximity-gauge-canvas',
      width: 170,
      height: 170,
      title: "PROXIMITY",
      units: "Scale",
      minValue: 0,
      maxValue: 255,
      majorTicks: ["0", "50", "100", "150", "200", "255"],
      minorTicks: 5,
      strokeTicks: true,
      highlights: [
        { from: 0, to: 100, color: 'rgba(15, 23, 42, 0.4)' },
        { from: 100, to: 200, color: 'rgba(99, 102, 241, 0.15)' },
        { from: 200, to: 255, color: 'rgba(168, 85, 247, 0.3)' }
      ],
      colorPlate: "rgba(15, 23, 42, 0.4)",
      colorNeedle: "#a855f7", // Purple needle
      colorNeedleEnd: "#6366f1",
      colorTitle: "#e2e8f0",
      colorUnits: "#94a3b8",
      colorNumbers: "#cbd5e1",
      borderShadowWidth: 0,
      borders: false,
      needleType: "arrow",
      needleWidth: 3,
      needleCircleSize: 7,
      colorNeedleCircleOuter: "#a855f7",
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
    const proximity = packet.proximity || 0;
    const gesture = (packet.gesture || "NONE").toUpperCase();

    // 1. Update Proximity Gauge
    if (this.proximityGauge) {
      this.proximityGauge.value = proximity;
    }

    // 2. Process and trigger gesture events
    if (gesture !== "NONE" && gesture !== this.lastGesture) {
      this._triggerGestureVisual(gesture);
    }
    
    // Store last gesture to avoid redundant triggers (Arduino holds state transiently)
    this.lastGesture = gesture;
  }

  _triggerGestureVisual(gesture) {
    // Clear any active gesture displays
    this._resetGestureVisuals();

    const cardId = `gesture-card-${gesture.toLowerCase()}`;
    const card = document.getElementById(cardId);
    
    if (card) {
      // Add glowing active classes depending on direction
      card.classList.remove("border-slate-800/50", "text-slate-400");
      
      // Cyber neon color codes
      if (gesture === "UP") {
        card.classList.add("border-cyan-500", "text-cyan-400", "scale-105", "shadow-[0_0_20px_rgba(6,182,212,0.3)]");
      } else if (gesture === "DOWN") {
        card.classList.add("border-rose-500", "text-rose-400", "scale-105", "shadow-[0_0_20px_rgba(239,68,68,0.3)]");
      } else if (gesture === "LEFT" || gesture === "RIGHT") {
        card.classList.add("border-indigo-500", "text-indigo-400", "scale-105", "shadow-[0_0_20px_rgba(99,102,241,0.3)]");
      } else if (gesture === "NEAR") {
        card.classList.add("border-emerald-500", "text-emerald-400", "scale-105", "shadow-[0_0_20px_rgba(16,185,129,0.3)]");
      } else if (gesture === "FAR") {
        card.classList.add("border-amber-500", "text-amber-400", "scale-105", "shadow-[0_0_20px_rgba(245,158,11,0.3)]");
      }

      // Add a clean browser notification sound or toast if requested
      if (window.App) {
        window.App.showToast(`Gesture Detected: ${gesture}`, "info");
      }

      // Automatically reset highlight after 1000ms
      if (this.activeGestureTimeout) {
        clearTimeout(this.activeGestureTimeout);
      }
      
      this.activeGestureTimeout = setTimeout(() => {
        this._resetGestureVisuals();
      }, 1000);
    }
  }

  _resetGestureVisuals() {
    const list = ["up", "down", "left", "right", "near", "far"];
    list.forEach(g => {
      const card = document.getElementById(`gesture-card-${g}`);
      if (card) {
        card.className = "glass-card border-slate-800/50 text-slate-400 p-4 rounded-xl flex flex-col items-center justify-center transition-all duration-300 transform scale-100 hover:scale-102";
      }
    });
  }
}

// Attach globally
window.Proximity = new ProximityController();
window.addEventListener("DOMContentLoaded", () => {
  window.Proximity.init();
});
