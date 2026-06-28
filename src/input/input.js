// ============================================================================
// System 13 — Input. Keyboard (arrows/WASD + space + escape) and touch
// (left / right / center-fire thirds with auto-fire). Exposes a steer value
// and a firing flag the game loop reads each frame.
// ============================================================================

export class Input {
  constructor(domElement, handlers = {}) {
    this.keys = {};
    this.touchDir = null;
    this.handlers = handlers;
    this.el = domElement;

    window.addEventListener('keydown', (e) => {
      this.keys[e.key] = true;
      if (e.key === ' ') e.preventDefault();
      if (e.key === 'Escape') handlers.onPause?.();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.key] = false; });

    const zone = (clientX) => {
      const rect = this.el.getBoundingClientRect();
      const rx = (clientX - rect.left) / rect.width;
      if (rx < 0.33) return 'left';
      if (rx > 0.66) return 'right';
      return 'center';
    };

    const onTouch = (e) => {
      e.preventDefault();
      if (!e.touches.length) { this.touchDir = null; return; }
      this.touchDir = zone(e.touches[0].clientX);
    };
    this.el.addEventListener('touchstart', onTouch, { passive: false });
    this.el.addEventListener('touchmove', onTouch, { passive: false });
    this.el.addEventListener('touchend', (e) => { e.preventDefault(); this.touchDir = null; }, { passive: false });
  }

  getSteer() {
    let s = 0;
    if (this.keys['ArrowLeft'] || this.keys['a'] || this.keys['A'] || this.touchDir === 'left') s -= 1;
    if (this.keys['ArrowRight'] || this.keys['d'] || this.keys['D'] || this.touchDir === 'right') s += 1;
    return s;
  }

  // vertical: +1 = up, -1 = down (keyboard; touch climb handled via swipe later)
  getVertical() {
    let v = 0;
    if (this.keys['ArrowUp'] || this.keys['w'] || this.keys['W']) v += 1;
    if (this.keys['ArrowDown'] || this.keys['s'] || this.keys['S']) v -= 1;
    return v;
  }

  // barrel roll: -1 = roll left (Q), +1 = roll right (E)
  getRoll() {
    let r = 0;
    if (this.keys['q'] || this.keys['Q']) r -= 1;
    if (this.keys['e'] || this.keys['E']) r += 1;
    return r;
  }

  // throttle: +1 = accelerate (Shift), -1 = brake (Z), 0 = coast
  getThrottle() {
    let t = 0;
    if (this.keys['Shift']) t += 1;
    if (this.keys['z'] || this.keys['Z']) t -= 1;
    return t;
  }

  isFiring() {
    return !!(this.keys[' '] || this.touchDir === 'center');
  }
}
