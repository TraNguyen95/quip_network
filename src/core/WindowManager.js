export default class WindowManager {
  constructor(config) {
    this.screenWidth = config.window.screenWidth;
    this.screenHeight = config.window.screenHeight;
    this.margin = config.window.margin;
    this.maxConcurrent = config.execution.maxConcurrent || 1;

    // Window size from config (the logical resolution browser sees)
    this.windowWidth = config.window.width || 1920;
    this.windowHeight = config.window.height || 1080;

    // Auto-calculate grid layout based on concurrent count
    const { cols, rows, cellWidth, cellHeight } = this._calcLayout(this.maxConcurrent);
    this.cols = cols;
    this.rows = rows;
    this.cellWidth = cellWidth;
    this.cellHeight = cellHeight;

    // Calculate zoom so window fits into grid cell
    const zoomW = cellWidth / this.windowWidth;
    const zoomH = cellHeight / this.windowHeight;
    this.zoom = Math.min(zoomW, zoomH);
    // Round to 2 decimal places
    this.zoom = Math.round(this.zoom * 100) / 100;
  }

  _calcLayout(concurrent) {
    if (concurrent <= 1) {
      return { cols: 1, rows: 1, cellWidth: this.screenWidth, cellHeight: this.screenHeight };
    }

    // Pick layout where zoom (= min(cellW/winW, cellH/winH)) is maximized
    const winRatio = this.windowWidth / this.windowHeight;
    let best = null;
    let bestZoom = 0;

    for (let cols = 1; cols <= concurrent; cols++) {
      const rows = Math.ceil(concurrent / cols);
      const cellWidth = Math.floor((this.screenWidth - this.margin * (cols - 1)) / cols);
      const cellHeight = Math.floor((this.screenHeight - this.margin * (rows - 1)) / rows);
      const zoom = Math.min(cellWidth / this.windowWidth, cellHeight / this.windowHeight);

      if (zoom > bestZoom) {
        bestZoom = zoom;
        best = { cols, rows, cellWidth, cellHeight };
      }
    }

    return best;
  }

  getPosition(index) {
    const col = index % this.cols;
    const row = Math.floor(index / this.cols) % this.rows;

    const x = col * (this.cellWidth + this.margin);
    const y = row * (this.cellHeight + this.margin);

    return { x, y };
  }

  getWindowSize() {
    return { width: this.windowWidth, height: this.windowHeight };
  }

  getZoom() {
    return this.zoom;
  }
}
