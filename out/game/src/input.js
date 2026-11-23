// Keyboard and pointer input for Solmara. Held keys are read every frame (steering, driving,
// walking); one-shot presses (confirm, pause, enter car, radio, weapon switch, planning
// choices) are queued as bit flags and taken once by the loop, so a press between two frames
// is never lost and never counted twice. The mouse position is tracked in canvas pixels for
// aiming and for clicking menu rows.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_RADIO = 8;
export const ACTION_UP = 16;
export const ACTION_DOWN = 32;
export const ACTION_LEFT = 64;
export const ACTION_RIGHT = 128;
export const ACTION_FIRE = 256;
export const ACTION_NITRO = 512;

const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const RADIO = new Set(['KeyR']);
const FIRE = new Set(['KeyF']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  const mouse = { x: 0, y: 0, down: false, clicked: false };

  window.addEventListener('keydown', (event) => {
    held.add(event.code);
    if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (ENTER.has(event.code)) {
      if (!event.repeat) actions |= ACTION_ENTER;
    } else if (RADIO.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RADIO;
    } else if (FIRE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_FIRE;
    } else if (event.code === 'ArrowUp' || event.code === 'KeyW') {
      if (!event.repeat) actions |= ACTION_UP;
    } else if (event.code === 'ArrowDown' || event.code === 'KeyS') {
      if (!event.repeat) actions |= ACTION_DOWN;
    } else if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
      if (!event.repeat) actions |= ACTION_LEFT;
    } else if (event.code === 'ArrowRight' || event.code === 'KeyD') {
      if (!event.repeat) actions |= ACTION_RIGHT;
    } else {
      return;
    }
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });
  target.addEventListener('pointermove', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  });
  target.addEventListener('pointerdown', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.down = true;
    mouse.clicked = true;
    actions |= ACTION_CONFIRM;
  });
  target.addEventListener('pointerup', () => {
    mouse.down = false;
  });

  function axis(negA, negB, posA, posB) {
    const neg = held.has(negA) || held.has(negB);
    const pos = held.has(posA) || held.has(posB);
    return (pos ? 1 : 0) - (neg ? 1 : 0);
  }

  return {
    mouse,
    /** -1/0/1 for steering: A/Left vs D/Right. */
    steer() { return axis('ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'); },
    /** -1/0/1 for throttle: W/Up vs S/Down. */
    throttle() { return axis('ArrowDown', 'KeyS', 'ArrowUp', 'KeyW'); },
    /** -1/0/1 for walking on foot: up/down. */
    walkY() { return axis('ArrowUp', 'KeyW', 'ArrowDown', 'KeyS'); },
    /** -1/0/1 for walking on foot: left/right. */
    walkX() { return axis('ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'); },
    isDown(code) { return held.has(code); },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** True once when the pointer was clicked since the last call. */
    takeClick() {
      const clicked = mouse.clicked;
      mouse.clicked = false;
      return clicked;
    },
  };
}
