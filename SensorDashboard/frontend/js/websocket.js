/**
 * Modular WebSocket client for Telemetry Dashboard.
 * Automatically connects to backend, handles dropped frames,
 * auto-reconnects, and broadcasts payload to central App orchestrator.
 */

class TelemetryWS {
  constructor() {
    self.ws = null;
    self.reconnectTimeout = null;
    self.reconnectAttempts = 0;
    self.isConnecting = false;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isConnecting = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host || 'localhost:8000';
    const wsUrl = `${protocol}//${host}/ws`;

    console.log(`Connecting to WebSocket: ${wsUrl}`);
    
    try {
      this.ws = new WebSocket(wsUrl);
      this._setupEventHandlers();
    } catch (err) {
      console.error("WebSocket construction failed:", err);
      this._handleDisconnect("Connection Construction Error");
    }
  }

  _setupEventHandlers() {
    this.ws.onopen = () => {
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      console.log("WebSocket connected successfully.");
      
      // Update global connection badge UI
      if (window.App) {
        window.App.setConnectionState(true, false); // Connected, not mock initially (updates on packet)
        window.App.showToast("Telemetry channel established.", "success");
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Dispatch data to main App handler
        if (window.App && typeof window.App.onTelemetryPacket === 'function') {
          window.App.onTelemetryPacket(data);
        }
      } catch (err) {
        console.error("Error parsing incoming WebSocket JSON packet:", err);
      }
    };

    this.ws.onclose = (event) => {
      this._handleDisconnect(`Channel Closed (Code: ${event.code})`);
    };

    this.ws.onerror = (err) => {
      console.error("WebSocket connection encountered an error:", err);
      // Let onclose handle the state transition
    };
  }

  _handleDisconnect(reason) {
    this.isConnecting = false;
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws = null;
    }

    if (window.App) {
      window.App.setConnectionState(false, false);
      window.App.showToast(`Telemetry link lost: ${reason}. Retrying...`, "error");
    }

    // Schedule auto-reconnect
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    this.reconnectAttempts++;
    const delay = Math.min(10000, 1000 + this.reconnectAttempts * 1000); // Backoff limit 10s
    this.reconnectTimeout = setTimeout(() => {
      console.log(`Reconnection attempt #${this.reconnectAttempts}...`);
      this.connect();
    }, delay);
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Attach to window namespace
window.TelemetryWS = new TelemetryWS();
