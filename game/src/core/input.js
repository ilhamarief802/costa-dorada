// Keyboard and pointer state. Actions are semantic, so gameplay never reads key codes.
// Mouse look is accumulated per frame and consumed once by the camera rig.
const KEY_ACTIONS = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  Space: 'jump',
  KeyC: 'crouch',
  ControlLeft: 'crouch',
  KeyE: 'interact',
  KeyF: 'steal',
  KeyR: 'reload',
  Digit1: 'weapon1',
  Digit2: 'weapon2',
  Escape: 'pause',
  Enter: 'confirm',
};

export default class Input {
  constructor(element) {
    this.element = element;
    this.down = new Set();
    this.edge = new Set();
    this.lookX = 0;
    this.lookY = 0;
    this.locked = false;
    this.enabled = true;
    this.fireEdge = false;
    this.firing = false;

    this.onKeyDown = (event) => {
      const action = KEY_ACTIONS[event.code];
      if (!action) return;
      if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
      if (!this.down.has(action)) this.edge.add(action);
      this.down.add(action);
    };
    this.onKeyUp = (event) => {
      const action = KEY_ACTIONS[event.code];
      if (!action) return;
      this.down.delete(action);
    };
    this.onMouseMove = (event) => {
      if (!this.locked) return;
      this.lookX += event.movementX;
      this.lookY += event.movementY;
    };
    this.onPointerLockChange = () => {
      this.locked = document.pointerLockElement === this.element;
    };
    this.onMouseDown = (event) => {
      if (event.button !== 0 || !this.locked) return;
      this.fireEdge = true;
      this.firing = true;
      event.preventDefault();
    };
    this.onMouseUp = (event) => {
      if (event.button !== 0) return;
      this.firing = false;
    };
    this.onBlur = () => {
      this.down.clear();
      this.edge.clear();
      this.firing = false;
      this.fireEdge = false;
    };

    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
  }

  requestLook() {
    if (this.locked) return;
    const request = this.element.requestPointerLock?.();
    if (request && typeof request.catch === 'function') request.catch(() => {});
  }

  releaseLook() {
    if (document.pointerLockElement === this.element) document.exitPointerLock();
  }

  isDown(action) {
    return this.enabled && this.down.has(action);
  }

  pressed(action) {
    return this.enabled && this.edge.has(action);
  }

  consume(action) {
    if (!this.enabled || !this.edge.has(action)) return false;
    this.edge.delete(action);
    return true;
  }

  axis() {
    let x = 0;
    let z = 0;
    if (this.isDown('left')) x -= 1;
    if (this.isDown('right')) x += 1;
    if (this.isDown('forward')) z += 1;
    if (this.isDown('back')) z -= 1;
    const length = Math.hypot(x, z);
    return length > 1 ? { x: x / length, z: z / length } : { x, z };
  }

  consumeLook() {
    const x = this.lookX;
    const y = this.lookY;
    this.lookX = 0;
    this.lookY = 0;
    return { x, y };
  }

  /** One trigger pull; the edge clears so held fire is read through isFiring(). */
  consumeFire() {
    if (!this.enabled || !this.fireEdge) return false;
    this.fireEdge = false;
    return true;
  }

  isFiring() {
    return this.enabled && this.firing;
  }

  endFrame() {
    this.edge.clear();
    this.fireEdge = false;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.down.clear();
      this.edge.clear();
      this.fireEdge = false;
      this.firing = false;
    }
  }
}
