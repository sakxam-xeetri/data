/**
 * Settings Tab Module.
 * Communicates with backend REST API to list, change, and monitor active serial nodes.
 * Synchronizes layout styling sheets (Light/Dark themes),
 * and propagates custom viewport/history buffer values.
 */

class SettingsTabController {
  constructor() {
    this.portsList = [];
    this.selectedPort = "AUTO";
    this.selectedBaud = 115200;
  }

  init() {
    console.log("Initializing Settings Module...");
    
    // Bind Event Listeners
    this._bindThemeToggle();
    this._bindConnectButton();
    this._bindBufferSlider();
    
    // Query available serial devices immediately
    this.refreshPorts();
    
    // Periodically update ports list (every 6 seconds) to detect plug-in changes!
    setInterval(() => {
      if (window.App && window.App.activeTab === "settings") {
        this.refreshPorts();
      }
    }, 6000);
  }

  _bindThemeToggle() {
    const toggle = document.getElementById("theme-toggle");
    if (toggle) {
      // Sync toggle position with active class
      toggle.checked = (window.App && window.App.theme === "light");
      
      toggle.addEventListener("change", (e) => {
        const theme = e.target.checked ? "light" : "dark";
        if (window.App) {
          window.App.setTheme(theme);
        }
      });
    }
  }

  _bindConnectButton() {
    const btnConnect = document.getElementById("settings-btn-connect");
    const selectPort = document.getElementById("settings-port-select");
    const selectBaud = document.getElementById("settings-baud-select");

    if (btnConnect) {
      btnConnect.addEventListener("click", () => {
        if (!selectPort || !selectBaud) return;
        
        const port = selectPort.value;
        const baud = parseInt(selectBaud.value) || 115200;
        
        this.connectToPort(port, baud);
      });
    }
  }

  _bindBufferSlider() {
    const sliderBuffer = document.getElementById("settings-buffer-size");
    const sliderVal = document.getElementById("settings-buffer-val");
    
    if (sliderBuffer && sliderVal) {
      sliderBuffer.addEventListener("input", (e) => {
        sliderVal.textContent = e.target.value;
        // Broadcast configuration update to charts tab if needed
        if (window.ChartsTab) {
          window.ChartsTab.maxBufferSize = parseInt(e.target.value);
        }
      });
    }
  }

  async refreshPorts() {
    const selectPort = document.getElementById("settings-port-select");
    if (!selectPort) return;

    try {
      const response = await fetch("/api/ports");
      if (!response.ok) throw new Error("HTTP connection error");

      const data = await response.json();
      this.portsList = data.ports || [];
      
      // Preserve current selection if it still exists in list
      const currentSelection = selectPort.value;
      
      // Clear options
      selectPort.innerHTML = "";
      
      // Re-populate list
      this.portsList.forEach(p => {
        const option = document.createElement("option");
        option.value = p.device;
        option.textContent = `${p.device} - ${p.description}`;
        
        if (p.device === currentSelection) {
          option.selected = true;
        }
        
        selectPort.appendChild(option);
      });
      
      // Set to AUTO default if list was empty and has values
      if (!currentSelection && this.portsList.length > 0) {
        selectPort.value = this.portsList[0].device;
      }
    } catch (err) {
      console.error("Failed to query host COM ports list:", err);
    }
  }

  async connectToPort(port, baudrate) {
    const btnConnect = document.getElementById("settings-btn-connect");
    if (btnConnect) {
      btnConnect.disabled = true;
      btnConnect.textContent = "CONNECTING...";
      btnConnect.className = "px-4 py-2 bg-indigo-600/50 text-white rounded-md text-sm font-semibold cursor-not-allowed shadow-md w-full";
    }

    try {
      const response = await fetch("/api/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ port, baudrate })
      });

      if (!response.ok) throw new Error("POST request rejected by target controller.");
      
      const data = await response.json();
      
      if (window.App) {
        window.App.showToast(`Active port changed to: ${port}`, "success");
      }
      
      // Sync visual trackers
      this.selectedPort = port;
      this.selectedBaud = baudrate;

    } catch (err) {
      console.error("Error committing serial port selection:", err);
      if (window.App) {
        window.App.showToast("Failed to switch COM port. Check backend link.", "error");
      }
    } finally {
      if (btnConnect) {
        btnConnect.disabled = false;
        btnConnect.textContent = "APPLY & RECONNECT";
        btnConnect.className = "px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-semibold hover:bg-indigo-500 shadow-lg shadow-indigo-600/30 w-full transition-all duration-300";
      }
    }
  }

  update(packet) {
    // Read status from packet and sync configuration values (if setting tab is opened)
    const systemMeta = packet.system_status || {};
    const selectPort = document.getElementById("settings-port-select");
    const selectBaud = document.getElementById("settings-baud-select");
    
    // Update live indicators in panel
    const currentPortEl = document.getElementById("settings-current-port");
    if (currentPortEl && systemMeta.port) {
      currentPortEl.textContent = `${systemMeta.port} @ ${systemMeta.baudrate} baud`;
      currentPortEl.className = systemMeta.is_mock
        ? "text-amber-400 font-bold glow-cyan"
        : "text-emerald-400 font-bold glow-green";
    }

    // Set selection values once if not initialized
    if (selectPort && selectPort.children.length > 0 && !selectPort.getAttribute("data-sync-done")) {
      selectPort.value = systemMeta.port || "AUTO";
      selectPort.setAttribute("data-sync-done", "true");
    }

    if (selectBaud && !selectBaud.getAttribute("data-sync-done")) {
      selectBaud.value = systemMeta.baudrate || 115200;
      selectBaud.setAttribute("data-sync-done", "true");
    }
  }
}

// Attach globally
window.SettingsTab = new SettingsTabController();
window.addEventListener("DOMContentLoaded", () => {
  window.SettingsTab.init();
});
