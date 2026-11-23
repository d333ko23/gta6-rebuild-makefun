// SOLMARA's rules and state, with no drawing and no browser in it: the player on foot and in
// cars, traffic on the road graph, the SPD's escalating chase, the eight story jobs with their
// planning modifiers, street races, turf standing and the garage. step() advances one fixed
// step and returns what happened as bit flags, so the caller can react without the world
// knowing about screens or sound. Pools are allocated once at boot; nothing allocates per
// frame except short-lived job objects.

import {
  CAPS, CAR, CREW, DISTRICTS, EDGES, GARAGE, JOBS, NODES, PLAYER, POLICE, RANKS, ROADS, TOOLS,
  WANTED, WEAPONS, WORLD,
} from './config.js';
import { intBetween, pick } from './random.js';

export const EVENT_JOB_DONE = 1;
export const EVENT_JOB_FAIL = 2;
export const EVENT_BUSTED = 4;
export const EVENT_WASTED = 8;
export const EVENT_RACE_WIN = 16;
export const EVENT_PICKUP = 32;
export const EVENT_SHOT = 64;
export const EVENT_HIT = 128;
export const EVENT_CRASH = 256;

const TAU = Math.PI * 2;

function clamp(value, min, max) { return value < min ? min : value > max ? max : value; }
function dist2(ax, ay, bx, by) { const dx = ax - bx; const dy = ay - by; return dx * dx + dy * dy; }
function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** True when the point is inside any road band (roads are drivable, buildings are not). */
function onRoad(x, y) {
  for (const road of ROADS) {
    const half = road.w / 2;
    if (road.axis === 'v') {
      if (x > road.at - half && x < road.at + half && y >= road.from && y <= road.to) return true;
    } else if (y > road.at - half && y < road.at + half && x >= road.from && x <= road.to) return true;
  }
  return false;
}

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
  }
  return DISTRICTS[0];
}

const TRAFFIC_COLORS = ['#c9a227', '#7fa8c9', '#c97f7f', '#8fc97a', '#d8d8d8', '#9a7fc9', '#e8e8e8'];
const RIVAL_COLORS = ['#b03a2e', '#7b2d8b'];

export function createWorld(random) {
  // ---- buildings: deterministic per district, kept off roads and markers ----
  const buildings = [];
  const GARAGE_POS = { x: 1560, y: 1560 };
  const KEEP_CLEAR = [
    { x: 1560, y: 1560, r: 220 }, // garage
    { x: 420, y: 420, r: 160 },   // harbor job
    { x: 1800, y: 1800, r: 200 }, // bank
    { x: 3000, y: 1800, r: 200 }, // marina turf
    { x: 3060, y: 420, r: 160 },  // gold car
    { x: 480, y: 1800, r: 160 },  // diner
  ];
  function clearOf(x, y) {
    for (const k of KEEP_CLEAR) if (dist2(x, y, k.x, k.y) < k.r * k.r) return false;
    return true;
  }
  for (const d of DISTRICTS) {
    const cols = 5;
    const rows = 5;
    for (let cx = 0; cx < cols; cx += 1) {
      for (let cy = 0; cy < rows; cy += 1) {
        const w = 120 + random() * 80;
        const h = 90 + random() * 70;
        const x = d.x + 120 + cx * 220 + random() * 30;
        const y = d.y + 110 + cy * 220 + random() * 30;
        if (x + w > d.x + d.w - 110 || y + h > d.y + d.h - 110) continue;
        if (onRoad(x + w / 2, y + h / 2)) continue;
        if (onRoad(x + 10, y + 10) || onRoad(x + w - 10, y + h - 10)) continue;
        if (!clearOf(x + w / 2, y + h / 2)) continue;
        if (random() < 0.18) continue; // some blocks stay open plazas
        buildings.push({ x, y, w, h, color: d.accent, shade: d.ground });
      }
    }
  }

  // ---- entity pools ----
  const cars = [];
  const bullets = [];
  for (let i = 0; i < CAPS.bullets; i += 1) bullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, damage: 0, fromPlayer: false });
  const particles = [];
  for (let i = 0; i < CAPS.particles; i += 1) particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, color: '#fff', size: 3 });

  const player = {
    x: GARAGE_POS.x + 60, y: GARAGE_POS.y + 80, angle: -Math.PI / 2, onFoot: true,
    health: PLAYER.maxHealth, maxHealth: PLAYER.maxHealth, car: null, weaponIdx: 0, fireTimer: 0,
    bustedTimer: 0,
  };

  const state = {
    player, cars, bullets, particles, buildings,
    cops: [],
    heli: { x: 0, y: 0, angle: 0, active: false },
    roadblocks: [],
    pickups: [],
    wanted: 0,
    cash: 500,
    respect: 0,
    standing: {},
    jobsDone: [],
    owned: [],
    weaponsOwned: ['pistol'],
    activeJob: null,
    race: null,
    raceMarkers: [
      { x: 600, y: 90, name: 'Harbor Sprint' },
      { x: 3000, y: 2310, name: 'Marina Mile' },
      { x: 90, y: 2100, name: 'Flats Drag' },
    ],
    garage: GARAGE_POS,
    camera: { x: player.x, y: player.y },
    message: { text: '', until: 0 },
    time: 0,
    stats: { jobs: 0, races: 0, carsStolen: 0, copsDisabled: 0, earned: 0 },
    gameOver: null,
    trafficTimer: 0,
    spawnTimer: 0,
    heliTimer: 0,
  };
  for (const d of DISTRICTS) state.standing[d.id] = 0;

  // ---- helpers ----
  function toast(text, seconds = 3) {
    state.message.text = text;
    state.message.until = state.time + seconds;
  }

  function spawnParticles(x, y, color, n, speed) {
    let made = 0;
    for (const p of particles) {
      if (made >= n) break;
      if (p.active) continue;
      p.active = true;
      p.x = x; p.y = y;
      const a = random() * TAU;
      const s = speed * (0.4 + random() * 0.8);
      p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
      p.life = p.max = 0.4 + random() * 0.5;
      p.color = color;
      p.size = 2 + random() * 4;
      made += 1;
    }
  }

  function freeBullet() {
    for (const b of bullets) if (!b.active) return b;
    return null;
  }

  function collideBuildings(x, y, r) {
    // Push a circle out of building rects; returns true when it hit one.
    let hit = false;
    for (const b of buildings) {
      const cx = clamp(x, b.x, b.x + b.w);
      const cy = clamp(y, b.y, b.y + b.h);
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (r - d) / d;
        x += dx * push; y += dy * push;
        hit = true;
      } else if (d2 <= 0.0001) {
        // Centre inside the rect: push out along the smallest penetration.
        const left = x - b.x; const right = b.x + b.w - x;
        const top = y - b.y; const bottom = b.y + b.h - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = b.x - r;
        else if (m === right) x = b.x + b.w + r;
        else if (m === top) y = b.y - r;
        else y = b.y + b.h + r;
        hit = true;
      }
    }
    return { x, y, hit };
  }

  function makeCar(x, y, angle, kind, color) {
    const car = {
      x, y, angle, speed: 0, health: CAR.maxHealth, maxHealth: CAR.maxHealth,
      color, kind, active: true, node: -1, targetNode: -1, wait: 0,
      driver: kind === 'traffic' ? 'traffic' : null, hp: 30, smoke: 0,
    };
    cars.push(car);
    return car;
  }

  function spawnParkedCars() {
    const spots = [
      [1560, 1480, '#e5534b'], [1620, 1480, '#4fc3f7'], [1200, 600, '#c9a227'],
      [2400, 600, '#7fa8c9'], [600, 1200, '#8fc97a'], [3000, 1200, '#d8d8d8'],
      [1200, 1800, '#c97f7f'], [2400, 1800, '#e8e8e8'], [1800, 2310, '#9a7fc9'],
      [900, 90, '#c9a227'], [2700, 90, '#7fa8c9'], [3510, 1500, '#8fc97a'],
      [90, 1500, '#d8d8d8'], [2100, 90, '#e8e8e8'],
    ];
    for (const [x, y, color] of spots) makeCar(x, y, random() * TAU, 'parked', color);
    // The gold Comet GT, target of job 5.
    const gold = makeCar(3060, 420, Math.PI / 2, 'target', '#f2c94c');
    gold.isTarget = true;
  }

  function spawnTrafficCar() {
    const traffic = cars.filter((c) => c.active && c.kind === 'traffic').length;
    if (traffic >= CAPS.traffic) return;
    const node = intBetween(random, 0, NODES.length - 1);
    const car = makeCar(NODES[node][0], NODES[node][1], 0, 'traffic', pick(random, TRAFFIC_COLORS));
    car.node = node;
    car.targetNode = pick(random, neighbours(node));
    car.speed = 140 + random() * 60;
  }

  function neighbours(node) {
    const out = [];
    for (const [a, b] of EDGES) {
      if (a === node) out.push(b);
      else if (b === node) out.push(a);
    }
    return out.length ? out : [node];
  }

  function nearestCar(x, y, maxDist, kinds) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const car of cars) {
      if (!car.active || !kinds.includes(car.kind)) continue;
      const d = dist2(x, y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function addWanted(amount) {
    if (state.activeJob && state.activeJob.mods.heat) amount *= state.activeJob.mods.heat;
    state.wanted = clamp(state.wanted + amount, 0, WANTED.maxStars);
  }

  // ---- police ----
  function spawnPolice(kind) {
    if (state.cops.length >= CAPS.police) return;
    // Spawn on a road node 500-900 units away from the player.
    let bx = player.x; let by = player.y;
    for (let tries = 0; tries < 12; tries += 1) {
      const node = pick(random, NODES);
      const d = Math.sqrt(dist2(player.x, player.y, node[0], node[1]));
      if (d > 500 && d < 1000) { bx = node[0]; by = node[1]; break; }
    }
    const car = makeCar(bx, by, angleTo(bx, by, player.x, player.y), 'police', '#5b8def');
    car.driver = 'police';
    car.hp = 30;
    car.maxHealth = 60;
    car.health = 60;
    state.cops.push({ car, kind, bustedHold: 0, ramTimer: 0 });
  }

  function spawnRoadblock() {
    if (state.roadblocks.length >= 2) return;
    const px = player.x; const py = player.y;
    const car = player.car;
    const heading = car ? car.angle : player.angle;
    const bx = px + Math.cos(heading) * 520;
    const by = py + Math.sin(heading) * 520;
    if (bx < 60 || bx > WORLD.width - 60 || by < 60 || by > WORLD.height - 60) return;
    const block = makeCar(bx, by, heading + Math.PI / 2, 'roadblock', '#5b8def');
    block.driver = 'police';
    block.hp = 40;
    state.roadblocks.push({ car: block, active: true });
    toast('SPD roadblock ahead!', 3);
  }

  function policeDesired() {
    const stars = Math.floor(state.wanted);
    if (stars <= 0) return 0;
    return Math.min(2 + stars, CAPS.police);
  }

  function updatePolice(dt) {
    const desired = policeDesired();
    state.spawnTimer -= dt;
    if (state.cops.length < desired && state.spawnTimer <= 0) {
      const kind = state.wanted >= WANTED.pitAt && state.cops.length >= 3 ? 'pit' : 'patrol';
      spawnPolice(kind);
      state.spawnTimer = 1.2;
    }
    // Roadblocks at 3+ stars.
    if (state.wanted >= WANTED.roadblockAt && state.roadblocks.length === 0 && random() < dt * 0.25) spawnRoadblock();
    // Helicopter at 5 stars (stays while the heat rounds to five stars).
    const heliWanted = state.wanted >= WANTED.heliAt - 0.5;
    if (heliWanted && !state.heli.active) {
      state.heli.active = true;
      state.heli.x = player.x - 300;
      state.heli.y = player.y - 300;
      toast(`${POLICE.airUnitCall} is overhead — lose the tail!`, 4);
    } else if (!heliWanted && state.heli.active) {
      state.heli.active = false;
    }
    if (state.heli.active) {
      const hx = player.x + Math.cos(state.time * 0.7) * 120;
      const hy = player.y + Math.sin(state.time * 0.7) * 120 - 60;
      state.heli.x += (hx - state.heli.x) * Math.min(1, dt * 1.4);
      state.heli.y += (hy - state.heli.y) * Math.min(1, dt * 1.4);
      state.heli.angle = angleTo(state.heli.x, state.heli.y, player.x, player.y);
    }

    const px = player.x; const py = player.y;
    const playerSpeed = player.car ? Math.abs(player.car.speed) : 0;
    let busted = false;
    for (let i = state.cops.length - 1; i >= 0; i -= 1) {
      const cop = state.cops[i];
      const car = cop.car;
      if (!car.active || car.hp <= 0) {
        if (car.active) { car.active = false; spawnParticles(car.x, car.y, '#888', 14, 160); }
        state.cops.splice(i, 1);
        continue;
      }
      const d = Math.sqrt(dist2(car.x, car.y, px, py));
      // Chase: steer toward the player, faster for PIT units.
      const topSpeed = cop.kind === 'pit' ? 620 : 540;
      const targetAngle = angleTo(car.x, car.y, px, py);
      const diff = angleDiff(car.angle, targetAngle);
      car.angle += clamp(diff, -2.4 * dt, 2.4 * dt);
      const want = d > 60 ? 1 : 0.4;
      car.speed += (topSpeed * want - car.speed) * Math.min(1, dt * 1.2);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      car.x = clamp(car.x, 40, WORLD.width - 40);
      car.y = clamp(car.y, 40, WORLD.height - 40);
      const pushed = collideBuildings(car.x, car.y, 22);
      car.x = pushed.x; car.y = pushed.y;
      // Ram the player's car.
      if (player.car && dist2(car.x, car.y, player.car.x, player.car.y) < 46 * 46) {
        cop.ramTimer -= dt;
        if (cop.ramTimer <= 0) {
          cop.ramTimer = 0.9;
          const target = player.car;
          damageCar(target, cop.kind === 'pit' ? 14 : 8);
          if (target.active) target.speed *= 0.55;
          spawnParticles(target.x, target.y, '#f2c94c', 8, 140);
        }
      }
      // Busted check: cop close to a slow or on-foot player.
      if (d < 70 && (player.onFoot || playerSpeed < 40)) {
        cop.bustedHold += dt;
        if (cop.bustedHold >= WANTED.bustedHoldSeconds) busted = true;
      } else {
        cop.bustedHold = Math.max(0, cop.bustedHold - dt * 2);
      }
      // Despawn far cops when the heat is gone.
      if (state.wanted <= 0 && d > 1400) {
        car.active = false;
        state.cops.splice(i, 1);
      }
    }
    // Roadblock cars are static obstacles; clear them when heat drops.
    for (let i = state.roadblocks.length - 1; i >= 0; i -= 1) {
      const rb = state.roadblocks[i];
      if (!rb.car.active || rb.car.hp <= 0 || state.wanted < WANTED.roadblockAt - 1) {
        rb.car.active = false;
        state.roadblocks.splice(i, 1);
      }
    }
    return busted;
  }

  function damageCar(car, amount) {
    if (!car.active) return;
    const mod = state.activeJob && state.activeJob.mods.armor ? state.activeJob.mods.armor : 1;
    car.health -= amount * (car === player.car ? mod : 1);
    if (car.health <= 0) {
      car.health = 0;
      car.active = false;
      spawnParticles(car.x, car.y, '#e5534b', 20, 220);
      if (car === player.car) {
        player.car = null;
        player.onFoot = true;
        player.x = clamp(car.x + 40, 40, WORLD.width - 40);
        player.y = clamp(car.y + 40, 40, WORLD.height - 40);
        toast('Your car is wrecked!', 3);
      }
    }
  }

  function damagePlayer(amount) {
    const mod = state.activeJob && state.activeJob.mods.armor ? state.activeJob.mods.armor : 1;
    player.health -= amount * mod;
    if (player.health <= 0) {
      player.health = 0;
      state.gameOver = 'wasted';
    }
  }

  // ---- jobs ----
  function planMods(crewIds, toolIds) {
    const mods = { speed: 1, steer: 1, time: 1, heat: 1, armor: 1, decay: 1, spot: 1, carArmor: 0, nitro: false, lockpick: false, silencer: false, plates: false, vest: false };
    for (const id of crewIds) {
      const c = CREW.find((k) => k.id === id);
      if (!c) continue;
      if (c.speed) mods.speed *= c.speed;
      if (c.steer) mods.steer *= c.steer;
      if (c.time) mods.time *= c.time;
      if (c.heat) mods.heat *= c.heat;
      if (c.armor) mods.armor *= c.armor;
      if (c.decay) mods.decay *= c.decay;
      if (c.spot) mods.spot *= c.spot;
      if (c.carArmor) mods.carArmor += c.carArmor;
    }
    for (const id of toolIds) {
      if (id === 'nitro') mods.nitro = true;
      if (id === 'lockpick') mods.lockpick = true;
      if (id === 'silencer') mods.silencer = true;
      if (id === 'plates') mods.plates = true;
      if (id === 'vest') mods.vest = true;
    }
    if (mods.plates) mods.decay *= 1.5;
    return mods;
  }

  function startJob(job, crewIds, toolIds) {
    const mods = planMods(crewIds, toolIds);
    const active = {
      job, crew: crewIds, tools: toolIds, mods,
      stepIndex: 0, timer: 0, waitLeft: 0, collected: 0, total: 0,
      carrying: false, race: null, failed: false,
    };
    if (mods.vest) player.maxHealth = PLAYER.maxHealth + 50;
    player.health = player.maxHealth;
    if (player.car) player.car.health = player.car.maxHealth;
    state.activeJob = active;
    state.pickups = [];
    addWanted(job.heat);
    setupStep(active);
    toast(`Job started: ${job.name}`, 3);
    return active;
  }

  function setupStep(active) {
    const step = active.job.steps[active.stepIndex];
    if (!step) return;
    active.timer = 0;
    active.waitLeft = step.seconds || 0;
    active.collected = 0;
    active.total = step.n || 0;
    state.pickups = [];
    if (step.type === 'collect') {
      for (let i = 0; i < step.n; i += 1) {
        const a = random() * TAU;
        const r = 60 + random() * 160;
        state.pickups.push({ x: clamp(step.x + Math.cos(a) * r, 60, WORLD.width - 60), y: clamp(step.y + Math.sin(a) * r, 60, WORLD.height - 60), active: true });
      }
    }
    if (step.type === 'race') {
      startRace(step.gates, active.job.payout, true);
      active.race = state.race;
    }
    if (step.type === 'escape' && step.time) active.timer = step.time * (active.mods.time || 1);
    if (step.type === 'survive') {
      active.timer = step.seconds;
      for (let i = 0; i < 3; i += 1) {
        const a = random() * TAU;
        const car = makeCar(clamp(player.x + Math.cos(a) * 500, 60, WORLD.width - 60), clamp(player.y + Math.sin(a) * 500, 60, WORLD.height - 60), 0, 'rival', RIVAL_COLORS[i % RIVAL_COLORS.length]);
        car.driver = 'rival';
        car.hp = 40;
      }
    }
    if (active.job.time && step.type !== 'escape') active.timer = active.job.time * (active.mods.time || 1);
  }

  function startRace(gates, prize, isJob) {
    const rivals = [];
    for (let i = 0; i < 2; i += 1) {
      const car = makeCar(gates[0][0] + 60 + i * 70, gates[0][1] + 40, -Math.PI / 2, 'rival', RIVAL_COLORS[i]);
      car.driver = 'rival';
      car.hp = 999;
      rivals.push({ car, gateIndex: 0, finished: false, speed: 400 + i * 30 });
    }
    state.race = {
      gates, gateIndex: 0, rivals, prize, isJob: !!isJob,
      time: 0, finished: false, won: false,
    };
    toast('Race! Hit every gate before the rivals.', 3);
  }

  function failJob(reason) {
    if (!state.activeJob) return;
    state.activeJob = null;
    state.pickups = [];
    state.race = null;
    player.maxHealth = PLAYER.maxHealth;
    toast(`Job failed: ${reason}`, 4);
  }

  function completeJob() {
    const active = state.activeJob;
    if (!active) return 0;
    const job = active.job;
    state.cash += job.payout;
    state.respect += job.respect;
    state.stats.jobs += 1;
    state.stats.earned += job.payout;
    state.standing[job.district] = clamp((state.standing[job.district] || 0) + 15, 0, 100);
    if (!state.jobsDone.includes(job.id)) state.jobsDone.push(job.id);
    state.activeJob = null;
    state.pickups = [];
    state.race = null;
    player.maxHealth = PLAYER.maxHealth;
    toast(`${job.name} complete! +$${job.payout}  +${job.respect} respect`, 4);
    return EVENT_JOB_DONE;
  }

  function currentObjective() {
    if (state.race && !state.race.finished) {
      const g = state.race.gates[state.race.gateIndex];
      return { x: g[0], y: g[1], label: `Race gate ${state.race.gateIndex + 1}/${state.race.gates.length}` };
    }
    if (!state.activeJob) return null;
    const step = state.activeJob.job.steps[state.activeJob.stepIndex];
    if (!step) return null;
    if (step.type === 'collect') return { x: step.x, y: step.y, label: `${step.label} (${state.activeJob.collected}/${step.n})` };
    if (step.type === 'race') return { x: step.gates[Math.min(state.race ? state.race.gateIndex : 0, step.gates.length - 1)][0], y: step.gates[Math.min(state.race ? state.race.gateIndex : 0, step.gates.length - 1)][1], label: step.label };
    return { x: step.x, y: step.y, label: step.label };
  }

  function advanceStep() {
    const active = state.activeJob;
    active.stepIndex += 1;
    if (active.stepIndex >= active.job.steps.length) return completeJob();
    setupStep(active);
    return 0;
  }

  // ---- shooting ----
  function fireWeapon(angle) {
    const weapon = WEAPONS[player.weaponIdx];
    if (!weapon || player.fireTimer > 0) return 0;
    if (!state.weaponsOwned.includes(weapon.id)) return 0;
    player.fireTimer = weapon.rate;
    const shots = weapon.pellets || 1;
    for (let i = 0; i < shots; i += 1) {
      const b = freeBullet();
      if (!b) break;
      const spread = (random() - 0.5) * (weapon.pellets ? 0.35 : 0.06);
      const a = angle + spread;
      const ox = player.onFoot ? player.x : player.car.x;
      const oy = player.onFoot ? player.y : player.car.y;
      b.active = true;
      b.x = ox + Math.cos(a) * 26;
      b.y = oy + Math.sin(a) * 26;
      b.vx = Math.cos(a) * weapon.speed;
      b.vy = Math.sin(a) * weapon.speed;
      b.life = 0.7;
      b.damage = weapon.damage;
      b.fromPlayer = true;
    }
    spawnParticles(player.x, player.y, '#f2c94c', 3, 90);
    addWanted(WANTED.shoot * (state.activeJob && state.activeJob.mods.silencer ? 0.5 : 1));
    return EVENT_SHOT;
  }

  // ---- cars: enter / exit ----
  function enterCar() {
    if (!player.onFoot) {
      // Get out.
      const car = player.car;
      player.car = null;
      player.onFoot = true;
      player.x = clamp(car.x + Math.cos(car.angle + Math.PI / 2) * 44, 40, WORLD.width - 40);
      player.y = clamp(car.y + Math.sin(car.angle + Math.PI / 2) * 44, 40, WORLD.height - 40);
      player.angle = car.angle;
      return 'exit';
    }
    const car = nearestCar(player.x, player.y, PLAYER.carEnterRange, ['parked', 'traffic', 'target', 'player']);
    if (!car) return null;
    const wasKind = car.kind;
    if (wasKind === 'traffic' || wasKind === 'parked' || wasKind === 'target') {
      car.kind = 'player';
      car.driver = 'player';
      if (!car.stolen) {
        car.stolen = true;
        state.stats.carsStolen += 1;
        addWanted(WANTED.stealCar);
        toast('Car jacked! The SPD noticed.', 3);
      }
    }
    player.car = car;
    player.onFoot = false;
    player.x = car.x;
    player.y = car.y;
    return 'enter';
  }

  // ---- garage ----
  function garageMods() {
    const owned = state.owned;
    return {
      speed: 1 + (owned.includes('engine1') ? 0.12 : 0) + (owned.includes('engine2') ? 0.12 : 0) + (owned.includes('engine3') ? 0.12 : 0),
      armor: (owned.includes('armor1') ? 60 : 0) + (owned.includes('armor2') ? 60 : 0),
      steer: owned.includes('tires') ? 1.25 : 1,
      nitro: owned.includes('nitro'),
    };
  }

  function buyUpgrade(id) {
    const item = GARAGE.find((g) => g.id === id);
    if (!item) return { ok: false, why: 'no such upgrade' };
    if (!item.repeatable && state.owned.includes(id)) return { ok: false, why: 'already owned' };
    if (item.needs && !state.owned.includes(item.needs)) return { ok: false, why: `needs ${item.needs}` };
    if (state.cash < item.cost) return { ok: false, why: 'not enough cash' };
    state.cash -= item.cost;
    if (!item.repeatable) state.owned.push(id);
    if (id === 'repair' && player.car) player.car.health = player.car.maxHealth;
    return { ok: true };
  }

  function buyWeapon(id) {
    const weapon = WEAPONS.find((w) => w.id === id);
    if (!weapon) return { ok: false, why: 'no such weapon' };
    if (state.weaponsOwned.includes(id)) return { ok: false, why: 'already owned' };
    let rankIdx = 0;
    for (let i = 0; i < RANKS.length; i += 1) if (state.respect >= RANKS[i].at) rankIdx = i;
    if (rankIdx < weapon.needRank) return { ok: false, why: 'needs a higher respect rank' };
    if (state.cash < weapon.cost) return { ok: false, why: 'not enough cash' };
    state.cash -= weapon.cost;
    state.weaponsOwned.push(id);
    return { ok: true };
  }

  // ---- main step ----
  function updateTraffic(dt) {
    state.trafficTimer -= dt;
    if (state.trafficTimer <= 0) {
      spawnTrafficCar();
      state.trafficTimer = 1.5;
    }
    for (const car of cars) {
      if (!car.active || car.kind !== 'traffic') continue;
      const target = NODES[car.targetNode];
      if (!target) continue;
      const d = Math.sqrt(dist2(car.x, car.y, target[0], target[1]));
      if (d < 24) {
        const next = neighbours(car.targetNode).filter((n) => n !== car.node);
        car.node = car.targetNode;
        car.targetNode = next.length ? pick(random, next) : car.node;
        continue;
      }
      const want = angleTo(car.x, car.y, target[0], target[1]);
      car.angle += angleDiff(car.angle, want) * Math.min(1, dt * 4);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      // Gentle collision with the player's car.
      if (player.car && dist2(car.x, car.y, player.car.x, player.car.y) < 48 * 48) {
        car.speed = 40;
        car.wait = 1.2;
      }
      if (car.wait > 0) { car.wait -= dt; car.speed = Math.min(car.speed, 40); }
      else car.speed += (170 - car.speed) * Math.min(1, dt);
    }
  }

  function updateRivals(dt) {
    // Rival cars in a race chase the next gate; rivals in a survive step chase the player.
    for (const car of cars) {
      if (!car.active || car.kind !== 'rival') continue;
      if (state.race && !state.race.finished) {
        const rival = state.race.rivals.find((r) => r.car === car);
        if (rival && !rival.finished) {
          const g = state.race.gates[rival.gateIndex];
          const d = Math.sqrt(dist2(car.x, car.y, g[0], g[1]));
          if (d < 70) {
            rival.gateIndex += 1;
            if (rival.gateIndex >= state.race.gates.length) rival.finished = true;
          }
          const want = angleTo(car.x, car.y, g[0], g[1]);
          car.angle += clamp(angleDiff(car.angle, want), -2.6 * dt, 2.6 * dt);
          car.speed += (rival.speed - car.speed) * Math.min(1, dt);
          car.x += Math.cos(car.angle) * car.speed * dt;
          car.y += Math.sin(car.angle) * car.speed * dt;
        }
        continue;
      }
      // Survive step: ram the player.
      const d = Math.sqrt(dist2(car.x, car.y, player.x, player.y));
      const want = angleTo(car.x, car.y, player.x, player.y);
      car.angle += clamp(angleDiff(car.angle, want), -2.2 * dt, 2.2 * dt);
      car.speed += ((d > 80 ? 480 : 300) - car.speed) * Math.min(1, dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      const pushed = collideBuildings(car.x, car.y, 22);
      car.x = pushed.x; car.y = pushed.y;
      if (player.car && dist2(car.x, car.y, player.car.x, player.car.y) < 46 * 46) {
        const target = player.car;
        damageCar(target, 10 * dt * 4);
        if (target.active) target.speed *= 0.97;
      }
      if (player.onFoot && d < 30) damagePlayer(20 * dt);
    }
  }

  function updateRace(dt) {
    const race = state.race;
    if (!race || race.finished) return 0;
    race.time += dt;
    if (!player.car) return 0;
    const g = race.gates[race.gateIndex];
    if (dist2(player.car.x, player.car.y, g[0], g[1]) < 70 * 70) {
      race.gateIndex += 1;
      spawnParticles(g[0], g[1], '#7fd08a', 12, 160);
      if (race.gateIndex >= race.gates.length) {
        race.finished = true;
        const rivalDone = race.rivals.some((r) => r.finished);
        race.won = !rivalDone;
        if (race.won) {
          if (!race.isJob) {
            state.cash += race.prize;
            state.respect += 40;
            state.stats.races += 1;
            state.stats.earned += race.prize;
          }
          toast(`Race won! +$${race.prize}`, 4);
          return EVENT_RACE_WIN;
        }
        toast('Race lost — the rivals were faster.', 4);
        return 0;
      }
    }
    return 0;
  }

  function updateBullets(dt) {
    for (const b of bullets) {
      if (!b.active) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < 0 || b.x > WORLD.width || b.y < 0 || b.y > WORLD.height) { b.active = false; continue; }
      // Hit a building?
      let hitWall = false;
      for (const bd of buildings) {
        if (b.x > bd.x && b.x < bd.x + bd.w && b.y > bd.y && b.y < bd.y + bd.h) { hitWall = true; break; }
      }
      if (hitWall) { b.active = false; spawnParticles(b.x, b.y, '#9aa3b2', 3, 80); continue; }
      // Hit a cop / rival / roadblock car?
      for (const car of cars) {
        if (!car.active || (car.kind !== 'police' && car.kind !== 'rival' && car.kind !== 'roadblock')) continue;
        if (dist2(b.x, b.y, car.x, car.y) < 26 * 26) {
          b.active = false;
          car.hp -= b.damage;
          spawnParticles(b.x, b.y, '#e5534b', 5, 120);
          if (car.hp <= 0) {
            car.active = false;
            spawnParticles(car.x, car.y, '#e5534b', 18, 200);
            if (car.kind === 'police') {
              state.stats.copsDisabled += 1;
              addWanted(WANTED.killCop);
              toast('SPD unit disabled!', 3);
            }
          }
          break;
        }
      }
    }
  }

  function updateParticles(dt) {
    for (const p of particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }
  }

  function updateJob(dt) {
    const active = state.activeJob;
    if (!active) return 0;
    const step = active.job.steps[active.stepIndex];
    if (!step) return 0;
    let events = 0;
    if (active.timer > 0) {
      active.timer -= dt;
      if (active.timer <= 0) {
        failJob('time ran out');
        return EVENT_JOB_FAIL;
      }
    }
    if (step.type === 'goto' || step.type === 'deliver' || step.type === 'escape') {
      const needCar = step.type === 'deliver' && active.job.id === 'turbo-takeover';
      const at = dist2(player.x, player.y, step.x, step.y) < 80 * 80;
      if (at && (!needCar || (player.car && player.car.isTarget))) {
        if (step.type === 'escape') addWanted(0); // escaping is the point
        events |= advanceStep();
      }
    } else if (step.type === 'collect') {
      for (const pk of state.pickups) {
        if (!pk.active) continue;
        if (dist2(player.x, player.y, pk.x, pk.y) < 44 * 44) {
          pk.active = false;
          active.collected += 1;
          active.carrying = true;
          spawnParticles(pk.x, pk.y, '#f2c94c', 10, 140);
          if (!active.mods.lockpick) addWanted(0.3);
          events |= EVENT_PICKUP;
          if (active.collected >= active.total) events |= advanceStep();
          break;
        }
      }
    } else if (step.type === 'wait') {
      if (dist2(player.x, player.y, step.x, step.y) < 100 * 100) {
        active.waitLeft -= dt;
        if (active.waitLeft <= 0) {
          addWanted(active.job.heat);
          events |= advanceStep();
        }
      }
    } else if (step.type === 'race') {
      if (state.race && state.race.finished) {
        if (state.race.won) events |= advanceStep();
        else {
          failJob('lost the race');
          events |= EVENT_JOB_FAIL;
        }
      }
    } else if (step.type === 'steal') {
      if (player.car && player.car.isTarget) events |= advanceStep();
    } else if (step.type === 'survive') {
      if (active.timer <= 0) {
        // Clear leftover rivals, then move on.
        for (const car of cars) if (car.active && car.kind === 'rival') car.active = false;
        events |= advanceStep();
      }
    }
    return events;
  }

  function drivePlayerCar(dt, input, mods) {
    const car = player.car;
    if (!car) return;
    const g = garageMods();
    const topSpeed = CAR.maxSpeed * g.speed * mods.speed;
    const steerMul = CAR.steer * g.steer * mods.steer;
    const throttle = input.throttle();
    const steer = input.steer();
    const nitro = (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) && (mods.nitro || g.nitro);
    const accel = nitro ? CAR.accel * 1.9 : CAR.accel;
    if (throttle > 0) car.speed += accel * dt;
    else if (throttle < 0) car.speed -= (car.speed > 0 ? CAR.brake : CAR.reverseAccel) * dt * (car.speed > 0 ? 1 : 1);
    else car.speed -= car.speed * CAR.drag * dt;
    if (car.speed > topSpeed * (nitro ? 1.35 : 1)) car.speed = topSpeed * (nitro ? 1.35 : 1);
    if (car.speed < -CAR.maxReverse) car.speed = -CAR.maxReverse;
    if (Math.abs(car.speed) < 4 && throttle === 0) car.speed = 0;
    const steerAmount = steer * steerMul * clamp(Math.abs(car.speed) / 160, 0, 1) * (car.speed < 0 ? -1 : 1);
    car.angle += steerAmount * dt;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.x = clamp(car.x, 40, WORLD.width - 40);
    car.y = clamp(car.y, 40, WORLD.height - 40);
    const pushed = collideBuildings(car.x, car.y, 22);
    if (pushed.hit) {
      if (Math.abs(car.speed) > 260) {
        damageCar(car, 6);
        spawnParticles(car.x, car.y, '#f2c94c', 6, 120);
      }
      car.speed *= 0.6;
    }
    car.x = pushed.x; car.y = pushed.y;
    // Bump traffic cars.
    for (const other of cars) {
      if (!other.active || other === car || other.kind !== 'traffic') continue;
      if (dist2(car.x, car.y, other.x, other.y) < 48 * 48) {
        other.speed = 30;
        other.wait = 1.5;
        car.speed *= 0.85;
        spawnParticles(other.x, other.y, '#9aa3b2', 4, 100);
      }
    }
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    if (nitro && Math.abs(car.speed) > 100) spawnParticles(car.x - Math.cos(car.angle) * 26, car.y - Math.sin(car.angle) * 26, '#4fc3f7', 2, 60);
  }

  function walkPlayer(dt, input) {
    const mx = input.walkX();
    const my = input.walkY();
    const len = Math.hypot(mx, my) || 1;
    const speed = PLAYER.onFootSpeed;
    let nx = player.x + (mx / len) * speed * dt;
    let ny = player.y + (my / len) * speed * dt;
    if (mx !== 0 || my !== 0) player.angle = Math.atan2(my, mx);
    nx = clamp(nx, 30, WORLD.width - 30);
    ny = clamp(ny, 30, WORLD.height - 30);
    const pushed = collideBuildings(nx, ny, PLAYER.radius);
    player.x = pushed.x;
    player.y = pushed.y;
  }

  function step(dt, input, aimAngle) {
    let events = 0;
    state.time += dt;
    if (state.gameOver) return events;
    if (player.fireTimer > 0) player.fireTimer -= dt;

    const mods = state.activeJob ? state.activeJob.mods : { speed: 1, steer: 1, decay: 1, nitro: false, silencer: false };

    // Player movement.
    if (player.onFoot) walkPlayer(dt, input);
    else drivePlayerCar(dt, input, mods);

    // Wanted decay: faster when unseen, slower under the helicopter.
    if (state.wanted > 0) {
      let seen = false;
      for (const cop of state.cops) {
        if (dist2(cop.car.x, cop.car.y, player.x, player.y) < 420 * 420) { seen = true; break; }
      }
      if (state.heli.active) seen = true;
      const rate = (seen ? WANTED.decayPerSecond : WANTED.decayUnseenPerSecond) * (mods.decay || 1);
      state.wanted = Math.max(0, state.wanted - rate * dt);
      if (state.wanted < 0.05) state.wanted = 0;
    }

    updateTraffic(dt);
    updateRivals(dt);
    events |= updateRace(dt);
    if (updatePolice(dt)) {
      state.gameOver = 'busted';
      events |= EVENT_BUSTED;
    }
    updateBullets(dt);
    updateParticles(dt);
    events |= updateJob(dt);
    if (state.gameOver === 'wasted') events |= EVENT_WASTED;

    // Camera follows the player.
    state.camera.x += (player.x - state.camera.x) * Math.min(1, dt * 6);
    state.camera.y += (player.y - state.camera.y) * Math.min(1, dt * 6);
    return events;
  }

  function resetRun() {
    // Fresh run: keep the saved career (cash, respect, jobs, garage), reset the body.
    player.x = GARAGE_POS.x + 60;
    player.y = GARAGE_POS.y + 80;
    player.angle = -Math.PI / 2;
    player.onFoot = true;
    player.health = player.maxHealth;
    player.car = null;
    state.wanted = 0;
    state.activeJob = null;
    state.race = null;
    state.pickups = [];
    state.cops = [];
    state.roadblocks = [];
    state.heli.active = false;
    state.gameOver = null;
    state.time = 0;
    for (const car of cars) {
      if (car.kind === 'police' || car.kind === 'rival' || car.kind === 'roadblock') car.active = false;
    }
    for (const b of bullets) b.active = false;
    for (const p of particles) p.active = false;
    // Parked cars return to their spots; the starter car waits by the garage.
    let starter = cars.find((c) => c.kind === 'player' && c.active);
    if (!starter) {
      starter = makeCar(GARAGE_POS.x, GARAGE_POS.y + 40, -Math.PI / 2, 'player', '#e5534b');
      starter.driver = null;
    }
    starter.x = GARAGE_POS.x;
    starter.y = GARAGE_POS.y + 40;
    starter.angle = -Math.PI / 2;
    starter.speed = 0;
    starter.health = starter.maxHealth;
    starter.active = true;
  }

  function newGame() {
    state.cash = 500;
    state.respect = 0;
    state.jobsDone = [];
    state.owned = [];
    state.weaponsOwned = ['pistol'];
    state.stats = { jobs: 0, races: 0, carsStolen: 0, copsDisabled: 0, earned: 0 };
    for (const d of DISTRICTS) state.standing[d.id] = 0;
    player.maxHealth = PLAYER.maxHealth;
    player.weaponIdx = 0;
    // Remove stolen/extra cars; re-park the fleet.
    for (let i = cars.length - 1; i >= 0; i -= 1) {
      if (cars[i].kind !== 'parked' && cars[i].kind !== 'target') cars.splice(i, 1);
    }
    for (const car of cars) {
      car.active = true;
      car.health = car.maxHealth;
      car.speed = 0;
      if (car.kind === 'parked' || car.kind === 'target') car.kind = car.kind; // stays
    }
    spawnParkedCarsExtra();
    resetRun();
  }

  function spawnParkedCarsExtra() {
    // After a wipe, re-add the parked fleet that newGame removed.
    const existing = cars.filter((c) => c.kind === 'parked' || c.kind === 'target').length;
    if (existing >= 14) return;
    spawnParkedCars();
  }

  /** A free-roam street race from a race marker: five gates looping around the marker. */
  function startFreeRace(marker) {
    if (state.race && !state.race.finished) return false;
    if (state.activeJob) return false;
    const cx = marker.x; const cy = marker.y;
    const gates = [
      [clamp(cx + 420, 80, WORLD.width - 80), cy],
      [clamp(cx + 420, 80, WORLD.width - 80), clamp(cy + 420, 80, WORLD.height - 80)],
      [clamp(cx - 420, 80, WORLD.width - 80), clamp(cy + 420, 80, WORLD.height - 80)],
      [clamp(cx - 420, 80, WORLD.width - 80), cy],
      [cx, cy],
    ];
    startRace(gates, 800, false);
    return true;
  }

  function serialize() {
    return {
      cash: state.cash, respect: state.respect, standing: state.standing,
      jobsDone: state.jobsDone, owned: state.owned, weaponsOwned: state.weaponsOwned,
      stats: state.stats,
    };
  }

  function loadSave(data) {
    if (!data || typeof data !== 'object') return false;
    if (typeof data.cash === 'number') state.cash = data.cash;
    if (typeof data.respect === 'number') state.respect = data.respect;
    if (data.standing) for (const d of DISTRICTS) if (typeof data.standing[d.id] === 'number') state.standing[d.id] = data.standing[d.id];
    if (Array.isArray(data.jobsDone)) state.jobsDone = data.jobsDone;
    if (Array.isArray(data.owned)) state.owned = data.owned;
    if (Array.isArray(data.weaponsOwned) && data.weaponsOwned.length) state.weaponsOwned = data.weaponsOwned;
    if (data.stats) state.stats = { ...state.stats, ...data.stats };
    return true;
  }

  spawnParkedCars();
  // The player's own starter car, parked by the garage.
  const starter = makeCar(GARAGE_POS.x, GARAGE_POS.y + 40, -Math.PI / 2, 'player', '#e5534b');
  starter.driver = null;
  for (let i = 0; i < 6; i += 1) spawnTrafficCar();

  return {
    state, step, resetRun, newGame, startJob, startFreeRace, enterCar, fireWeapon, buyUpgrade, buyWeapon,
    garageMods, currentObjective, serialize, loadSave, toast, damagePlayer,
    rank() {
      let name = RANKS[0].name;
      for (const r of RANKS) if (state.respect >= r.at) name = r.name;
      return name;
    },
    rankIndex() {
      let idx = 0;
      for (let i = 0; i < RANKS.length; i += 1) if (state.respect >= RANKS[i].at) idx = i;
      return idx;
    },
  };
}
