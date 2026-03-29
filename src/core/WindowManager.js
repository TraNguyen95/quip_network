export default class WindowManager {
  constructor(config) {
    this.screenWidth = config.window.screenWidth;
    this.screenHeight = config.window.screenHeight;
    this.margin = config.window.margin;
    this.minWidth = config.window.minWidth || 800;
    this.minHeight = config.window.minHeight || 600;
    this.maxConcurrent = config.execution.maxConcurrent || 1;

    // Auto-calculate grid layout based on concurrent count
    const { cols, rows, width, height } = this._calcLayout(this.maxConcurrent);
    this.cols = cols;
    this.rows = rows;
    this.width = width;
    this.height = height;
  }

  _calcLayout(concurrent) {
    if (concurrent <= 1) {
      return { cols: 1, rows: 1, width: this.screenWidth, height: this.screenHeight };
    }

    let best = null;

    for (let cols = 1; cols <= concurrent; cols++) {
      const rows = Math.ceil(concurrent / cols);
      const width = Math.floor((this.screenWidth - this.margin * (cols - 1)) / cols);
      const height = Math.floor((this.screenHeight - this.margin * (rows - 1)) / rows);

      if (width < this.minWidth || height < this.minHeight) continue;

      // All windows must fit on screen without overlap
      if (!best || rows < best.rows || (rows === best.rows && cols > best.cols)) {
        best = { cols, rows, width, height };
      }
    }

    // Fallback: force fit even if below minWidth/minHeight
    if (!best) {
      const cols = Math.ceil(Math.sqrt(concurrent));
      const rows = Math.ceil(concurrent / cols);
      const width = Math.floor((this.screenWidth - this.margin * (cols - 1)) / cols);
      const height = Math.floor((this.screenHeight - this.margin * (rows - 1)) / rows);
      best = { cols, rows, width, height };
    }

    return best;
  }

  getPosition(index) {
    const col = index % this.cols;
    const row = Math.floor(index / this.cols) % this.rows;

    const x = col * (this.width + this.margin);
    const y = row * (this.height + this.margin);

    return { x, y };
  }

  getWindowSize() {
    return { width: this.width, height: this.height };
  }
}
