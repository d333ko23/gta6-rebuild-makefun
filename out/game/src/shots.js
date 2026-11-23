// The screenshot scenes behind ?shot=start|drive|chase|plan. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a simple autopilot
// (drive along the road graph toward the next intersection, throttle on), so the frame is
// what a short game really looks like and the same seed always gives the same frame.

import { STEP } from './config.js';
import { SCREEN_JOBS, SCREEN_PLAN, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const TAU = Math.PI * 2;

function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** A neutral input stub: nothing pressed, mouse idle. */
function idleInput() {
  return {
    mouse: { x: 640, y: 360, down: false, clicked: false },
    steer() { return 0; },
    throttle() { return 0; },
    walkX() { return 0; },
    walkY() { return 0; },
    isDown() { return false; },
    takeActions() { return 0; },
    takeClick() { return false; },
  };
}

/** An autopilot input: drives the player's car along the roads, waypoint to waypoint. */
function driveInput(world, waypoints) {
  const input = idleInput();
  // Waypoints are road centres, so consecutive legs share one road.
  let target = 0;
  let stuck = 0;
  let reversing = 0;
  function diffToTarget() {
    const car = world.state.player.car;
    if (!car) return 0;
    const wp = waypoints[target];
    return angleDiff(car.angle, Math.atan2(wp[1] - car.y, wp[0] - car.x));
  }
  function distToTarget() {
    const car = world.state.player.car;
    if (!car) return 0;
    const wp = waypoints[target];
    return Math.hypot(car.x - wp[0], car.y - wp[1]);
  }
  input.throttle = () => {
    if (reversing > 0) return -1;
    const car = world.state.player.car;
    if (!car) return 0;
    // Coast into sharp turns and near waypoints, so the car turns instead of sliding wide.
    if (Math.abs(diffToTarget()) > 0.7 || distToTarget() < 150) return 0;
    return 1;
  };
  input.steer = () => {
    const car = world.state.player.car;
    if (!car) return 0;
    if (reversing > 0) {
      reversing -= 1 / 60;
      return 0;
    }
    const d = distToTarget();
    if (d < 90) {
      target = (target + 1) % waypoints.length;
      return 0;
    }
    if (Math.abs(car.speed) < 40) stuck += 1 / 60;
    else stuck = 0;
    if (stuck > 1.5) {
      stuck = 0;
      reversing = 0.8;
      return 0;
    }
    const diff = diffToTarget();
    return diff > 0.25 ? 1 : diff < -0.25 ? -1 : 0;
  };
  return input;
}

function baseUi() {
  return {
    rank: 'Rookie',
    radio: 'SOL FM 101',
    hasSave: false,
    selectedJob: 0,
    plan: null,
    planCursor: 0,
    garageCursor: 0,
    garageMessage: '',
    overKind: 'busted',
    jobTimer: '',
  };
}

function putPlayerInCar(world, startX, startY, startAngle) {
  const state = world.state;
  const car = state.cars.find((c) => c.kind === 'player' && c.active);
  if (!car) return false;
  state.player.x = car.x + 30;
  state.player.y = car.y + 30;
  world.enterCar();
  if (!state.player.car) return false;
  // Start the drive where the shot wants it: on a road, facing along it.
  car.x = startX ?? 1800;
  car.y = startY ?? 1200;
  car.angle = startAngle ?? 0;
  car.speed = 0;
  state.player.x = car.x;
  state.player.y = car.y;
  state.camera.x = car.x;
  state.camera.y = car.y;
  return true;
}

/**
 * Set `world` to the named scene (start, drive, chase or plan; any other name is start) and
 * return the screen to draw and the ui the renderer needs.
 */
export function stageShot(name, world) {
  world.resetRun();
  const ui = baseUi();
  if (name === 'drive' || name === 'chase') {
    if (name === 'drive') {
      // One clean straight run east along the island's main avenue.
      putPlayerInCar(world, 600, 1200, 0);
      const input = driveInput(world, [[3510, 1200]]);
      for (let i = 0; i < 5 / STEP; i += 1) {
        world.step(STEP, input, 0);
        world.state.objective = world.currentObjective();
      }
      return { screen: SCREEN_PLAY, ui };
    }
    putPlayerInCar(world, 1800, 1200, 0);
    const input = driveInput(world, [
      [2400, 1200], [2400, 90], [1200, 90], [1200, 1200],
      [1200, 2310], [2400, 2310], [2400, 1200], [3510, 1200], [3510, 90],
    ]);
    if (name === 'chase') {
      world.state.wanted = 5;
      world.state.cash = 12400;
      world.state.respect = 320;
      ui.rank = 'Wheelman';
    }
    const seconds = 9;
    for (let i = 0; i < seconds / STEP; i += 1) {
      world.step(STEP, input, 0);
      world.state.objective = world.currentObjective();
    }
    if (name === 'chase') {
      // Re-raise the heat so HAWK ONE is overhead in the final frame.
      world.state.wanted = 5;
      for (let i = 0; i < 30; i += 1) world.step(STEP, input, 0);
    }
    return { screen: SCREEN_PLAY, ui };
  }
  if (name === 'plan') {
    ui.selectedJob = 0;
    ui.planCursor = 1;
    ui.plan = {
      crewList: [
        { id: 'rosa', name: 'Rosa "Vela" Cruz', role: 'Wheelwoman', cost: 800, ability: 'Top speed +15%, sharper steering' },
        { id: 'dex', name: 'Dex Marlow', role: 'Hacker', cost: 600, ability: 'Timers +25% time, alarms draw less heat' },
        { id: 'bruno', name: 'Bruno Hale', role: 'Muscle', cost: 700, ability: 'You take 30% less damage, ram harder' },
        { id: 'lena', name: 'Lena Voss', role: 'Lookout', cost: 500, ability: 'Wanted fades twice as fast, cops spot you later' },
        { id: 'milo', name: 'Milo Ferreira', role: 'Mechanic', cost: 400, ability: 'Car starts the job at full health, +50 armour' },
      ],
      toolList: [
        { id: 'lockpick', name: 'Lockpick Set', cost: 200, ability: 'No alarm when you grab the goods' },
        { id: 'silencer', name: 'Silenced Pistol', cost: 350, ability: 'Shooting draws half the usual heat' },
        { id: 'vest', name: 'Kevlar Vest', cost: 300, ability: '+50 health for the whole job' },
        { id: 'nitro', name: 'Nitro Kit', cost: 450, ability: 'Hold SHIFT for a nitro boost during the job' },
        { id: 'plates', name: 'Fake Plates', cost: 250, ability: 'Wanted fades 50% faster during the job' },
      ],
      crew: ['rosa'],
      tools: ['lockpick'],
      get spent() {
        let sum = 0;
        for (const id of this.crew) sum += this.crewList.find((c) => c.id === id).cost;
        for (const id of this.tools) sum += this.toolList.find((t) => t.id === id).cost;
        return sum;
      },
    };
    return { screen: SCREEN_PLAN, ui };
  }
  if (name === 'jobs') {
    ui.selectedJob = 2;
    return { screen: SCREEN_JOBS, ui };
  }
  // start: let the island breathe behind the title for five seconds.
  const input = idleInput();
  for (let i = 0; i < 5 / STEP; i += 1) world.step(STEP, input, 0);
  return { screen: SCREEN_TITLE, ui };
}
