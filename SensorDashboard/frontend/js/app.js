/**
 * Telemetry Dashboard Core Orchestrator.
 * Manages active states, navigation tabs, toast cues, packet analytics,
 * FPS calculators, and coordinates updates to sub-modules.
 */

class AppController {
  constructor() {
    this.activeTab = "dashboard";
    this.isConnected = false;
    this.isMock = false;
    this.theme = "dark";
    
    // Telemetry Statistics
    this.packetCount = 0;
    this.droppedPackets = 0;
    this.lastPacketTime = null;
    this.packetRates = [];
    this.currentFPS = 0;
    this.latency = 0;
    
    // FPS counter calculation variables
    this.fpsCount = 0;
    this.fpsTimer = null;
    
    // UI elements cache
    this.elements = {};
  }

  init() {
    console.log("Initializing Dashboard Core Application...");
    
    // Cache global elements
    this.elements.sidebar = document.getElementById("sidebar");
    this.elements.sidebarToggle = document.getElementById("sidebar-toggle");
    this.elements.connectionStatus = document.getElementById("connection-status");
    this.elements.connectionLabel = document.getElementById("connection-label");
    this.elements.fpsBadge = document.getElementById("fps-badge");
    this.elements.latencyBadge = document.getElementById("latency-badge");
    this.elements.toastContainer = document.getElementById("toast-container");
    this.elements.appLoader = document.getElementById("app-loader");

    // Initialize sidebar navigation
    this._setupNavigation();
    
    // Initialize Theme (Dark/Light)
    this._setupTheme();
    
    // Setup Sidebar Collapse
    this._setupSidebarCollapse();

    // Start FPS rate calculation timer (every 1 second)
    this.fpsTimer = setInterval(() => {
      this.currentFPS = this.fpsCount;
      if (this.elements.fpsBadge) {
        this.elements.fpsBadge.textContent = `${this.currentFPS} Hz`;
      }
      this.fpsCount = 0;
    }, 1000);

    // Connect to WebSocket
    if (window.TelemetryWS) {
      window.TelemetryWS.connect();
    }
  }

  _setupNavigation() {
    const navItems = document.querySelectorAll("[data-tab-target]");
    navItems.forEach(item => {
      item.addEventListener("click", () => {
        const targetTab = item.getAttribute("data-tab-target");
        this.switchTab(targetTab);
        
        // Mobile sidebar close on click
        if (window.innerWidth < 1024 && this.elements.sidebar) {
          this.elements.sidebar.classList.add("-translate-x-full");
        }
      });
    });
  }

  _setupTheme() {
    const savedTheme = localStorage.getItem("dashboard-theme") || "dark";
    this.setTheme(savedTheme);
  }

  _setupSidebarCollapse() {
    if (this.elements.sidebarToggle && this.elements.sidebar) {
      this.elements.sidebarToggle.addEventListener("click", () => {
        this.elements.sidebar.classList.toggle("-translate-x-full");
      });
    }
    
    // Handle responsive window resize
    window.addEventListener("resize", () => {
      if (window.innerWidth >= 1024 && this.elements.sidebar) {
        this.elements.sidebar.classList.remove("-translate-x-full");
      }
    });
  }

  setTheme(theme) {
    this.theme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("dashboard-theme", theme);
    
    // Sync settings tab toggle switch if rendered
    const themeSwitch = document.getElementById("theme-toggle");
    if (themeSwitch) {
      themeSwitch.checked = (theme === "light");
    }
    
    logger(`Theme changed to: ${theme}`);
  }

  switchTab(tabId) {
    if (this.activeTab === tabId) return;

    // Remove active styles from sidebar nav elements
    document.querySelectorAll("[data-tab-target]").forEach(el => {
      el.classList.remove("bg-indigo-600/30", "text-white", "border-l-4", "border-indigo-500");
      el.classList.add("text-slate-400", "hover:bg-slate-800/40");
      
      if (el.getAttribute("data-tab-target") === tabId) {
        el.classList.add("bg-indigo-600/30", "text-white", "border-l-4", "border-indigo-500");
        el.classList.remove("text-slate-400", "hover:bg-slate-800/40");
      }
    });

    // Toggle tab panels
    document.querySelectorAll(".tab-content").forEach(panel => {
      if (panel.id === `${tabId}-tab`) {
        panel.classList.remove("hidden");
      } else {
        panel.classList.add("hidden");
      }
    });

    this.activeTab = tabId;
    this.showToast(`Navigated to ${tabId.toUpperCase()}`, "info");

    // Trigger tab-specific resize hook (highly critical for Chart.js and canvas updates!)
    window.dispatchEvent(new Event('resize'));
  }

  setConnectionState(isConnected, isMock) {
    this.isConnected = isConnected;
    this.isMock = isMock;

    if (!this.elements.connectionStatus) return;

    // Reset styles
    this.elements.connectionStatus.className = "w-3.5 h-3.5 rounded-full mr-2 ";
    
    if (isConnected) {
      if (isMock) {
        this.elements.connectionStatus.classList.add("bg-amber-500", "pulse-green");
        this.elements.connectionLabel.textContent = "SIMULATED TELEMETRY";
        this.elements.connectionLabel.className = "text-amber-400 text-xs font-semibold tracking-wider glow-cyan";
      } else {
        this.elements.connectionStatus.classList.add("bg-emerald-500", "pulse-green");
        this.elements.connectionLabel.textContent = "LIVE TELEMETRY ACTIVE";
        this.elements.connectionLabel.className = "text-emerald-400 text-xs font-semibold tracking-wider glow-green";
      }
    } else {
      this.elements.connectionStatus.classList.add("bg-rose-500", "pulse-red");
      this.elements.connectionLabel.textContent = "LINK OFFLINE";
      this.elements.connectionLabel.className = "text-rose-500 text-xs font-semibold tracking-wider";
      if (this.elements.fpsBadge) this.elements.fpsBadge.textContent = "0 Hz";
      if (this.elements.latencyBadge) this.elements.latencyBadge.textContent = "-- ms";
    }
  }

  onTelemetryPacket(packet) {
    this.fpsCount++;
    this.packetCount = packet.packet_count || (this.packetCount + 1);
    this.droppedPackets = packet.dropped_packets || 0;
    
    // Hide initial loader on first packet reception
    if (this.elements.appLoader && !this.elements.appLoader.classList.contains("hidden")) {
      this.elements.appLoader.classList.add("hidden");
      this.showToast("Initial handshake complete. System online.", "success");
    }

    // Capture connection state changes dynamically from packet
    const isMockPacket = packet.system_status ? packet.system_status.is_mock : false;
    if (isMockPacket !== this.isMock || !this.isConnected) {
      this.setConnectionState(true, isMockPacket);
    }

    // Compute parse/reception latency
    // Dates are sync'd locally, packet.server_time is time.time()
    const nowSecs = Date.now() / 1000.0;
    if (packet.server_time) {
      const transmissionDelay = (nowSecs - packet.server_time) * 1000.0;
      this.latency = Math.max(0.1, transmissionDelay + (packet.parser_latency_ms || 0.0));
      if (this.elements.latencyBadge) {
        this.elements.latencyBadge.textContent = `${this.latency.toFixed(1)} ms`;
      }
    }

    // Safely dispatch packet updates to all modular script tabs
    this._dispatchUpdate("Dashboard", packet);
    this._dispatchUpdate("IMU", packet);
    this._dispatchUpdate("Environment", packet);
    this._dispatchUpdate("LightColor", packet);
    this._dispatchUpdate("Proximity", packet);
    this._dispatchUpdate("Microphone", packet);
    this._dispatchUpdate("ChartsTab", packet);
    this._dispatchUpdate("SystemMonitor", packet);
    this._dispatchUpdate("SettingsTab", packet);
  }

  _dispatchUpdate(moduleName, packet) {
    try {
      if (window[moduleName] && typeof window[moduleName].update === 'function') {
        window[moduleName].update(packet);
      }
    } catch (err) {
      console.error(`Error executing update on module [${moduleName}]:`, err);
    }
  }

  showToast(message, type = "info") {
    if (!this.elements.toastContainer) return;

    const toast = document.createElement("div");
    toast.className = "glass-panel flex items-center p-3 mb-3 rounded-lg border-l-4 shadow-lg transition-all duration-300 transform translate-y-2 opacity-0 text-sm max-w-sm";
    
    // Apply styling based on severity level
    switch (type) {
      case "success":
        toast.classList.add("border-emerald-500", "text-emerald-300");
        toast.innerHTML = `<span class="mr-2">&#x2714;</span> <span>${message}</span>`;
        break;
      case "error":
        toast.classList.add("border-rose-500", "text-rose-400");
        toast.innerHTML = `<span class="mr-2">&#x26A0;</span> <span>${message}</span>`;
        break;
      case "warning":
        toast.classList.add("border-amber-500", "text-amber-300");
        toast.innerHTML = `<span class="mr-2">&#x26A0;</span> <span>${message}</span>`;
        break;
      case "info":
      default:
        toast.classList.add("border-indigo-500", "text-indigo-300");
        toast.innerHTML = `<span class="mr-2">&#x2139;</span> <span>${message}</span>`;
        break;
    }

    this.elements.toastContainer.appendChild(toast);
    
    // Trigger animation frame in browser
    requestAnimationFrame(() => {
      toast.classList.remove("translate-y-2", "opacity-0");
    });

    // Auto dismiss after 3 seconds
    setTimeout(() => {
      toast.classList.add("translate-y-[-10px]", "opacity-0");
      setTimeout(() => {
        if (toast.parentNode === this.elements.toastContainer) {
          this.elements.toastContainer.removeChild(toast);
        }
      }, 300);
    }, 3000);
  }
}

// Log utility
function logger(msg) {
  console.log(`[Core] ${msg}`);
}

// Instantiate globally on page load
window.addEventListener("DOMContentLoaded", () => {
  window.App = new AppController();
  window.App.init();
});
