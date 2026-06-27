/**
 * Charts Tab Module.
 * Manages the multi-mode custom telemetry Chart.js canvas.
 * Supports:
 * - Real-time streaming buffer (up to 1000 points)
 * - Line, Scatter, Histogram, and Area chart types
 * - Viewport slice zooming and panning
 * - Play/Pause state locks
 * - High-res PNG export of canvas
 * - Full data buffer CSV downloads
 */

class ChartsController {
  constructor() {
    this.chart = null;
    this.sensorKey = "temperature";
    this.chartType = "line"; // line, scatter, histogram, area
    this.isPaused = false;
    
    // Core data buffers
    this.timestamps = [];
    this.dataBuffer = [];
    
    // Configs (controlled via global Settings)
    this.maxBufferSize = 500;
    this.zoomWindowSize = 100; // number of points to show in current viewport
    
    // Elements
    this.ctx = null;
  }

  init() {
    console.log("Initializing Custom Telemetry Chart Manager...");
    this.ctx = document.getElementById("custom-chart-canvas");
    if (!this.ctx) return;

    this._setupDropdownListeners();
    this._setupButtonListeners();
    this._initChart();
  }

  _setupDropdownListeners() {
    const selectSensor = document.getElementById("chart-sensor-select");
    const selectType = document.getElementById("chart-type-select");
    const sliderZoom = document.getElementById("chart-viewport-slider");

    if (selectSensor) {
      selectSensor.addEventListener("change", (e) => {
        this.sensorKey = e.target.value;
        this.clearBuffer();
        this.rebuildChart();
      });
    }

    if (selectType) {
      selectType.addEventListener("change", (e) => {
        this.chartType = e.target.value;
        this.rebuildChart();
      });
    }

    if (sliderZoom) {
      sliderZoom.addEventListener("input", (e) => {
        this.zoomWindowSize = parseInt(e.target.value);
        document.getElementById("chart-viewport-val").textContent = this.zoomWindowSize;
        this.updateViewport();
      });
    }
  }

  _setupButtonListeners() {
    const btnPause = document.getElementById("chart-btn-pause");
    const btnReset = document.getElementById("chart-btn-reset");
    const btnPng = document.getElementById("chart-btn-png");
    const btnCsv = document.getElementById("chart-btn-csv");

    if (btnPause) {
      btnPause.addEventListener("click", () => {
        this.isPaused = !this.isPaused;
        btnPause.innerHTML = this.isPaused 
          ? `<span class="mr-1.5">&#x25B6;</span> RESUME` 
          : `<span class="mr-1.5">&#x23F8;</span> PAUSE`;
        btnPause.className = this.isPaused
          ? "px-3 py-1.5 bg-emerald-600 text-white rounded-md text-xs font-semibold hover:bg-emerald-500 shadow-md"
          : "px-3 py-1.5 bg-slate-800/60 border border-slate-700 text-slate-300 rounded-md text-xs font-semibold hover:bg-slate-700/50 shadow-md";
        
        if (window.App) {
          window.App.showToast(this.isPaused ? "Chart stream paused." : "Chart stream resumed.", "info");
        }
      });
    }

    if (btnReset) {
      btnReset.addEventListener("click", () => {
        this.clearBuffer();
        if (window.App) {
          window.App.showToast("Data buffer cleared.", "info");
        }
      });
    }

    if (btnPng) {
      btnPng.addEventListener("click", () => {
        this.exportPNG();
      });
    }

    if (btnCsv) {
      btnCsv.addEventListener("click", () => {
        this.exportCSV();
      });
    }
  }

  _initChart() {
    if (this.chart) {
      this.chart.destroy();
    }

    const config = this._getChartConfig();
    this.chart = new Chart(this.ctx, config);
  }

  rebuildChart() {
    this._initChart();
  }

  clearBuffer() {
    this.timestamps = [];
    this.dataBuffer = [];
    if (this.chart) {
      this.chart.data.labels = [];
      this.chart.data.datasets[0].data = [];
      this.chart.update("none");
    }
  }

  update(packet) {
    if (this.isPaused) return;

    // Retrieve global configuration values (e.g. from settings page)
    const settingsBuffer = document.getElementById("settings-buffer-size");
    if (settingsBuffer) {
      this.maxBufferSize = parseInt(settingsBuffer.value) || 500;
    }

    // Extract selected sensor parameter value
    const val = this._extractValue(packet, this.sensorKey);
    const date = new Date(packet.server_time * 1000);
    const timeStr = date.toTimeString().split(' ')[0] + "." + String(date.getMilliseconds()).padStart(3, '0');

    this.timestamps.push(timeStr);
    this.dataBuffer.push(val);

    // Enforce buffer boundaries
    if (this.dataBuffer.length > this.maxBufferSize) {
      this.timestamps.shift();
      this.dataBuffer.shift();
    }

    // Update chart
    this.updateViewport();
  }

  updateViewport() {
    if (!this.chart) return;

    // Viewport slicing (acts as a panning window!)
    const len = this.dataBuffer.length;
    const windowSize = Math.min(len, this.zoomWindowSize);
    
    // Slice buffers to render only the requested viewport range
    const slicedData = this.dataBuffer.slice(len - windowSize);
    const slicedLabels = this.timestamps.slice(len - windowSize);

    if (this.chartType === "histogram") {
      const binsData = this._calculateHistogramBins(this.dataBuffer, 15);
      this.chart.data.labels = binsData.labels;
      this.chart.data.datasets[0].data = binsData.counts;
    } else if (this.chartType === "scatter") {
      // For scatter, format array of coordinate pairs {x, y}
      const scatterPoints = slicedData.map((yVal, idx) => ({ x: idx, y: yVal }));
      this.chart.data.labels = slicedLabels;
      this.chart.data.datasets[0].data = scatterPoints;
    } else {
      // standard line & area charts
      this.chart.data.labels = slicedLabels;
      this.chart.data.datasets[0].data = slicedData;
    }

    this.chart.update("none"); // "none" disables layout recalculation animation for raw speed!
  }

  _extractValue(packet, pathKey) {
    // Nested path routing helper
    switch (pathKey) {
      case "accel_x": return packet.accelerometer?.x || 0.0;
      case "accel_y": return packet.accelerometer?.y || 0.0;
      case "accel_z": return packet.accelerometer?.z || 0.0;
      case "gyro_x": return packet.gyroscope?.x || 0.0;
      case "gyro_y": return packet.gyroscope?.y || 0.0;
      case "gyro_z": return packet.gyroscope?.z || 0.0;
      case "mag_x": return packet.magnetometer?.x || 0.0;
      case "mag_y": return packet.magnetometer?.y || 0.0;
      case "mag_z": return packet.magnetometer?.z || 0.0;
      case "temperature": return packet.temperature || 0.0;
      case "humidity": return packet.humidity || 0.0;
      case "pressure": return packet.pressure || 0.0;
      case "altitude": return packet.derived?.altitude || 0.0;
      case "light": return packet.light || 0;
      case "proximity": return packet.proximity || 0;
      case "sound_peak": return packet.sound || 0;
      case "sound_rms": return packet.sound_rms || 0.0;
      case "color_r": return packet.color?.r || 0;
      case "color_g": return packet.color?.g || 0;
      case "color_b": return packet.color?.b || 0;
      default: return 0.0;
    }
  }

  _getChartConfig() {
    const isDark = (document.documentElement.getAttribute("data-theme") !== "light");
    const gridColor = isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)";
    const textColor = isDark ? "#94a3b8" : "#475569";
    
    let chartJsType = "line";
    let datasetProps = {
      label: this.sensorKey.toUpperCase(),
      borderColor: "#6366f1",
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.1,
      fill: false
    };

    if (this.chartType === "area") {
      datasetProps.fill = true;
      datasetProps.backgroundColor = "rgba(99, 102, 241, 0.12)";
    } else if (this.chartType === "scatter") {
      chartJsType = "scatter";
      datasetProps.pointRadius = 3;
      datasetProps.pointBackgroundColor = "#a855f7";
      datasetProps.borderColor = "#a855f7";
    } else if (this.chartType === "histogram") {
      chartJsType = "bar";
      datasetProps.backgroundColor = "rgba(6, 182, 212, 0.65)";
      datasetProps.borderColor = "#06b6d4";
      datasetProps.borderWidth = 1;
    }

    return {
      type: chartJsType,
      data: {
        labels: [],
        datasets: [datasetProps]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              maxTicksLimit: 8,
              font: { family: "Outfit", size: 10 }
            }
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { family: "Outfit", size: 10 }
            }
          }
        }
      }
    };
  }

  _calculateHistogramBins(data, numBins) {
    if (data.length === 0) {
      return { labels: [], counts: [] };
    }

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min;
    const binWidth = range === 0 ? 1.0 : range / numBins;
    
    const counts = new Array(numBins).fill(0);
    const labels = [];

    // Calculate bin boundaries
    for (let i = 0; i < numBins; i++) {
      const lower = min + i * binWidth;
      const upper = lower + binWidth;
      labels.push(`${lower.toFixed(1)}-${upper.toFixed(1)}`);
    }

    // Distribute data points into bins
    for (let j = 0; j < data.length; j++) {
      const val = data[j];
      let binIdx = Math.floor((val - min) / binWidth);
      if (binIdx >= numBins) binIdx = numBins - 1; // place exact max in last bin
      if (binIdx < 0) binIdx = 0;
      counts[binIdx]++;
    }

    return { labels, counts };
  }

  exportPNG() {
    if (!this.chart) return;
    const link = document.createElement("a");
    link.download = `telemetry_chart_${this.sensorKey}.png`;
    
    // High-quality canvas capture
    link.href = this.chart.canvas.toDataURL("image/png");
    link.click();
    
    if (window.App) {
      window.App.showToast("Chart exported as PNG.", "success");
    }
  }

  exportCSV() {
    if (this.dataBuffer.length === 0) {
      if (window.App) window.App.showToast("Buffer is empty. Cannot export CSV.", "warning");
      return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Index,Timestamp,Value\n";

    this.dataBuffer.forEach((val, idx) => {
      csvContent += `${idx},"${this.timestamps[idx]}",${val}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `telemetry_data_${this.sensorKey}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (window.App) {
      window.App.showToast("Telemetry buffer exported as CSV.", "success");
    }
  }
}

// Attach globally
window.ChartsTab = new ChartsController();
window.addEventListener("DOMContentLoaded", () => {
  window.ChartsTab.init();
});
