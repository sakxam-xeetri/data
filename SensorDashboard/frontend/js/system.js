/**
 * System and Communication Telemetry Tab.
 * Manages the live scrolling Serial Monitor terminal,
 * compiles active transmission analytics (packet rate, latency, packet drop percentage, bytes/sec),
 * and implements a color-coded, syntax-highlighted real-time JSON viewer.
 */

class SystemMonitorController {
  constructor() {
    this.isPaused = false;
    this.terminalLines = [];
    this.maxTerminalLines = 50;
    
    // Performance and bandwidth
    this.totalBytesReceived = 0;
    this.bandwidthRateKB = 0.0;
    this.lastBandwidthTime = Date.now();
    this.accumulatedBytes = 0;
    
    // Elements Cache
    this.terminalEl = null;
    this.jsonViewerEl = null;
  }

  init() {
    console.log("Initializing System and Diagnostics monitor...");
    this.terminalEl = document.getElementById("sys-terminal-output");
    this.jsonViewerEl = document.getElementById("sys-json-viewer");

    this._setupTerminalControls();
  }

  _setupTerminalControls() {
    const btnPause = document.getElementById("sys-btn-pause-terminal");
    const btnClear = document.getElementById("sys-btn-clear-terminal");

    if (btnPause) {
      btnPause.addEventListener("click", () => {
        this.isPaused = !this.isPaused;
        btnPause.innerHTML = this.isPaused
          ? `<span class="mr-1.5">&#x25B6;</span> RESUME MONITOR`
          : `<span class="mr-1.5">&#x23F8;</span> PAUSE MONITOR`;
        btnPause.className = this.isPaused
          ? "px-3 py-1.5 bg-emerald-600 text-white rounded-md text-xs font-semibold hover:bg-emerald-500 shadow-md"
          : "px-3 py-1.5 bg-slate-800/60 border border-slate-700 text-slate-300 rounded-md text-xs font-semibold hover:bg-slate-700/50 shadow-md";
        
        if (window.App) {
          window.App.showToast(this.isPaused ? "Serial monitor paused." : "Serial monitor active.", "info");
        }
      });
    }

    if (btnClear) {
      btnClear.addEventListener("click", () => {
        this.terminalLines = [];
        if (this.terminalEl) this.terminalEl.innerHTML = "";
        if (window.App) window.App.showToast("Terminal buffer cleared.", "info");
      });
    }
  }

  update(packet) {
    // 1. Calculate bytes size to track transmission bandwidth
    const serializedStr = JSON.stringify(packet);
    const packetBytes = this._stringByteSize(serializedStr);
    
    this.totalBytesReceived += packetBytes;
    this.accumulatedBytes += packetBytes;
    
    const now = Date.now();
    const elapsedSecs = (now - this.lastBandwidthTime) / 1000.0;
    
    if (elapsedSecs >= 1.0) {
      this.bandwidthRateKB = (this.accumulatedBytes / elapsedSecs) / 1024.0;
      this.accumulatedBytes = 0;
      this.lastBandwidthTime = now;
    }

    // 2. Refresh Diagnostic cards
    this._updateDiagnosticPanel(packet);

    // 3. Update JSON syntax viewer (always updates unless paused)
    if (this.jsonViewerEl && !this.isPaused) {
      // Highlight code using regex syntax tokenizer
      this.jsonViewerEl.innerHTML = this._syntaxHighlight(packet);
    }

    // 4. Update Scrolling Terminal Output
    if (this.terminalEl && !this.isPaused) {
      this._appendTerminalLine(serializedStr);
    }
  }

  _updateDiagnosticPanel(packet) {
    const rateEl = document.getElementById("sys-packet-rate");
    const latencyEl = document.getElementById("sys-latency");
    const countEl = document.getElementById("sys-packet-count");
    const droppedEl = document.getElementById("sys-dropped");
    const dropRateEl = document.getElementById("sys-drop-rate");
    const bandwidthEl = document.getElementById("sys-bandwidth");
    const portEl = document.getElementById("sys-port");

    // Pull analytics from central App tracker
    if (window.App) {
      if (rateEl) rateEl.textContent = `${window.App.currentFPS} Hz`;
      if (latencyEl) latencyEl.textContent = `${window.App.latency.toFixed(1)} ms`;
      if (countEl) countEl.textContent = window.App.packetCount;
      if (droppedEl) droppedEl.textContent = window.App.droppedPackets;
      
      if (dropRateEl) {
        const total = window.App.packetCount + window.App.droppedPackets;
        const rate = total > 0 ? (window.App.droppedPackets / total) * 100.0 : 0.0;
        dropRateEl.textContent = `${rate.toFixed(2)} %`;
        
        // Color drop rate red if severe
        if (rate > 5.0) {
          dropRateEl.className = "text-rose-500 font-bold glow-red";
        } else {
          dropRateEl.className = "text-emerald-400 font-bold";
        }
      }
    }

    if (bandwidthEl) {
      bandwidthEl.textContent = `${this.bandwidthRateKB.toFixed(2)} kB/s`;
    }

    if (portEl && packet.system_status) {
      portEl.textContent = `${packet.system_status.port} (${packet.system_status.baudrate} bps)`;
      portEl.className = packet.system_status.is_mock 
        ? "text-amber-400 font-semibold"
        : "text-emerald-400 font-semibold";
    }
  }

  _appendTerminalLine(line) {
    const timestamp = new Date().toLocaleTimeString();
    const formattedLine = `<span class="text-indigo-400 font-bold">[${timestamp}]</span> <span class="text-slate-200">${line}</span>`;
    
    this.terminalLines.push(formattedLine);
    
    // Shift log buffer bounds
    if (this.terminalLines.length > this.maxTerminalLines) {
      this.terminalLines.shift();
    }

    this.terminalEl.innerHTML = this.terminalLines.join("<br>");
    
    // Auto-scroll to bottom of diagnostic console
    this.terminalEl.scrollTop = this.terminalEl.scrollHeight;
  }

  _stringByteSize(str) {
    // Encodes UTF-8 characters to verify exact raw bandwidth size
    return new Blob([str]).size;
  }

  _syntaxHighlight(jsonObj) {
    // Colorizes JSON hierarchy for standard formatting
    let json = JSON.stringify(jsonObj, null, 2);
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
      let cls = 'text-amber-400'; // Numeric default
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'text-indigo-400 font-semibold'; // Key fields
        } else {
          cls = 'text-emerald-400'; // String fields
        }
      } else if (/true|false/.test(match)) {
        cls = 'text-purple-400'; // Boolean fields
      } else if (/null/.test(match)) {
        cls = 'text-slate-500'; // Null states
      }
      return '<span class="' + cls + '">' + match + '</span>';
    });
  }
}

// Attach globally
window.SystemMonitor = new SystemMonitorController();
window.addEventListener("DOMContentLoaded", () => {
  window.SystemMonitor.init();
});
