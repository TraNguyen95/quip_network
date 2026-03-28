export default class WindowManager {
  constructor(config) {
    this.width = config.window.width;
    this.height = config.window.height;
    this.screenWidth = config.window.screenWidth;
    this.screenHeight = config.window.screenHeight;
    this.margin = config.window.margin;

    this.profilesPerRow = Math.floor(
      (this.screenWidth + this.margin) / (this.width + this.margin)
    );
  }

  getPosition(index) {
    const col = index % this.profilesPerRow;
    const row = Math.floor(index / this.profilesPerRow);

    const x = col * (this.width + this.margin);
    const y = row * (this.height + this.margin);

    // If window goes beyond screen height, reset to top
    if (y + this.height > this.screenHeight) {
      return { x: 0, y: 0 };
    }

    return { x, y };
  }

  getWindowSize() {
    return { width: this.width, height: this.height };
  }
}
