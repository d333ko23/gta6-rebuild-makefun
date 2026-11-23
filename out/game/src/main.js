// Boot and the one loop for SOLMARA: input is read every frame, the world advances in fixed
// 1/60 s steps, and the renderer paints what is there. The game moves between eight screens:
// title, jobs, plan, play, paused, garage, over and help. Career progress (cash, respect,
// turf standing, finished jobs, garage, weapons) saves to localStorage and loads on boot.
//
// ?seed=N fixes the island layout. ?shot=start|drive|chase|plan (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady.
import { CITY, GAME_TITLE, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_JOB_DONE, EVENT_JOB_FAIL, EVENT_PICKUP, EVENT_RACE_WIN, EVENT_SHOT, EVENT_WASTED } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_FIRE, ACTION_PAUSE, ACTION_RADIO, createInput } from './input.js';
import { createRenderer, SCREEN_GARAGE, SCREEN_HELP, SCREEN_JOBS, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAN, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';
import { CREW, JOBS, TOOLS, GARAGE, WEAPONS } from './config.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.serialize()));
  } catch {
    // Storage can be off (private windows): the career then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const saved = readSave();
  if (saved) world.loadSave(saved);

  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let saveTimer = 0;
  let pressedKey = '';

  const ui = {
    rank: world.rank(),
    radio: audio.stationName(),
    hasSave: !!saved,
    selectedJob: 0,
    plan: null,
    planCursor: 0,
    garageCursor: 0,
    garageMessage: '',
    overKind: 'busted',
    jobTimer: '',
  };

  window.addEventListener('keydown', (event) => {
    if (!event.repeat) pressedKey = event.code;
  });

  function announce(message) {
    status.textContent = message;
  }

  function refreshRank() {
    ui.rank = world.rank();
  }

  function startPlay() {
    world.resetRun();
    refreshRank();
    screen = SCREEN_PLAY;
    announce(`${GAME_TITLE}. ${CITY} is yours. Press J for story jobs.`);
  }

  function startNewGame() {
    world.newGame();
    writeSave();
    startPlay();
  }

  function openJobs() {
    ui.selectedJob = 0;
    screen = SCREEN_JOBS;
    announce('Story jobs. Choose one to plan.');
  }

  function openPlan() {
    const job = JOBS[ui.selectedJob];
    ui.plan = {
      crewList: CREW,
      toolList: TOOLS,
      crew: [],
      tools: [],
      get spent() {
        let sum = 0;
        for (const id of this.crew) sum += CREW.find((c) => c.id === id).cost;
        for (const id of this.tools) sum += TOOLS.find((t) => t.id === id).cost;
        return sum;
      },
    };
    ui.planCursor = 0;
    screen = SCREEN_PLAN;
    announce(`Planning ${job.name}. Pick crew and tools against a $${job.budget} budget.`);
  }

  function togglePlanRow(index) {
    const plan = ui.plan;
    if (!plan) return;
    if (index < plan.crewList.length) {
      const id = plan.crewList[index].id;
      if (plan.crew.includes(id)) plan.crew = plan.crew.filter((c) => c !== id);
      else if (plan.crew.length < 3) plan.crew.push(id);
    } else {
      const tool = plan.toolList[index - plan.crewList.length];
      if (!tool) return;
      if (plan.tools.includes(tool.id)) plan.tools = plan.tools.filter((t) => t !== tool.id);
      else plan.tools.push(tool.id);
    }
  }

  function launchJob() {
    const job = JOBS[ui.selectedJob];
    const plan = ui.plan;
    if (plan.spent > job.budget) {
      ui.plan = plan;
      return;
    }
    world.startJob(job, plan.crew, plan.tools);
    audio.unlock();
    screen = SCREEN_PLAY;
    announce(`Job started: ${job.name}.`);
  }

  function openGarage() {
    ui.garageCursor = 0;
    ui.garageMessage = '';
    screen = SCREEN_GARAGE;
    announce('Garage. Buy upgrades and weapons.');
  }

  function buyGarageRow() {
    const index = ui.garageCursor;
    if (index < GARAGE.length) {
      const result = world.buyUpgrade(GARAGE[index].id);
      ui.garageMessage = result.ok ? 'Installed!' : result.why;
      if (result.ok) { writeSave(); audio.pickup(); }
    } else {
      const weapon = WEAPONS[index - GARAGE.length];
      if (!weapon) return;
      const result = world.buyWeapon(weapon.id);
      ui.garageMessage = result.ok ? `${weapon.name} bought! Press ${weapon.slot} to use it.` : result.why;
      if (result.ok) { writeSave(); audio.pickup(); }
    }
  }

  function handleOver() {
    // Busted or wasted: lose $300, drop the job, back on the streets.
    const state = world.state;
    state.cash = Math.max(0, state.cash - 300);
    if (state.activeJob) state.activeJob = null;
    writeSave();
    world.resetRun();
    refreshRank();
    screen = SCREEN_PLAY;
  }

  function aimAngle() {
    const state = world.state;
    const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    const ox = (window.innerWidth - 1280 * scale) / 2;
    const oy = (window.innerHeight - 720 * scale) / 2;
    const wx = state.camera.x + ((input.mouse.x - ox) / scale - 640);
    const wy = state.camera.y + ((input.mouse.y - oy) / scale - 360);
    return Math.atan2(wy - state.player.y, wx - state.player.x);
  }

  function handleActions() {
    const actions = input.takeActions();
    const key = pressedKey;
    pressedKey = '';

    if (key === 'KeyM') {
      const muted = audio.toggleMute();
      ui.radio = muted ? 'muted' : audio.stationName();
      return;
    }

    if (screen === SCREEN_TITLE) {
      if (key === 'KeyH') { screen = SCREEN_HELP; return; }
      if (key === 'KeyN') { startNewGame(); return; }
      if (actions & ACTION_CONFIRM) {
        audio.unlock();
        startPlay();
      }
      return;
    }

    if (screen === SCREEN_HELP) {
      if (key === 'KeyH' || (actions & ACTION_PAUSE) || (actions & ACTION_CONFIRM)) screen = SCREEN_TITLE;
      return;
    }

    if (screen === SCREEN_JOBS) {
      if (actions & ACTION_PAUSE) { screen = SCREEN_PLAY; return; }
      if (key === 'ArrowUp' || key === 'KeyW') ui.selectedJob = (ui.selectedJob + JOBS.length - 1) % JOBS.length;
      else if (key === 'ArrowDown' || key === 'KeyS') ui.selectedJob = (ui.selectedJob + 1) % JOBS.length;
      else if (actions & ACTION_CONFIRM) openPlan();
      return;
    }

    if (screen === SCREEN_PLAN) {
      const plan = ui.plan;
      const rows = plan.crewList.length + plan.toolList.length;
      if (actions & ACTION_PAUSE) { screen = SCREEN_JOBS; return; }
      if (key === 'ArrowUp' || key === 'KeyW') ui.planCursor = (ui.planCursor + rows - 1) % rows;
      else if (key === 'ArrowDown' || key === 'KeyS') ui.planCursor = (ui.planCursor + 1) % rows;
      else if (key === 'Space') togglePlanRow(ui.planCursor);
      else if (key === 'Enter') launchJob();
      else if (/^Digit[1-5]$/.test(key)) togglePlanRow(Number(key.slice(5)) - 1);
      else if (/^Digit[6-9]$/.test(key)) togglePlanRow(plan.crewList.length + Number(key.slice(5)) - 6);
      else if (key === 'Digit0') togglePlanRow(plan.crewList.length + 4);
      return;
    }

    if (screen === SCREEN_GARAGE) {
      const rows = GARAGE.length + WEAPONS.length;
      if (actions & ACTION_PAUSE) { screen = SCREEN_PLAY; return; }
      if (key === 'ArrowUp' || key === 'KeyW') ui.garageCursor = (ui.garageCursor + rows - 1) % rows;
      else if (key === 'ArrowDown' || key === 'KeyS') ui.garageCursor = (ui.garageCursor + 1) % rows;
      else if (actions & ACTION_CONFIRM) buyGarageRow();
      return;
    }

    if (screen === SCREEN_OVER) {
      if (actions & ACTION_CONFIRM) handleOver();
      return;
    }

    if (screen === SCREEN_PAUSED) {
      if (actions & ACTION_PAUSE) { screen = SCREEN_PLAY; announce('Playing.'); return; }
      if (key === 'KeyJ') { openJobs(); return; }
      if (key === 'KeyG') { openGarage(); return; }
      if (key === 'KeyH') { screen = SCREEN_HELP; return; }
      if (actions & ACTION_CONFIRM) screen = SCREEN_PLAY;
      return;
    }

    // SCREEN_PLAY
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      writeSave();
      announce('Paused.');
      return;
    }
    if (key === 'KeyJ') { openJobs(); return; }
    if (key === 'KeyH') { screen = SCREEN_HELP; return; }
    if (key === 'KeyG') {
      const d = Math.hypot(world.state.player.x - world.state.garage.x, world.state.player.y - world.state.garage.y);
      if (d < 160) openGarage();
      else world.toast('Drive to the garage to buy upgrades.', 2);
      return;
    }
    if (key === 'Digit1' || key === 'Digit2' || key === 'Digit3') {
      const idx = Number(key.slice(5)) - 1;
      if (world.state.weaponsOwned.includes(WEAPONS[idx].id)) world.state.player.weaponIdx = idx;
      return;
    }
    if (actions & ACTION_RADIO) {
      ui.radio = audio.nextStation();
      return;
    }
    if (actions & ACTION_ENTER) {
      const state = world.state;
      // Race flag first, then cars.
      if (state.player.onFoot) {
        let nearRace = null;
        for (const marker of state.raceMarkers) {
          if (Math.hypot(state.player.x - marker.x, state.player.y - marker.y) < 90) { nearRace = marker; break; }
        }
        if (nearRace && world.startFreeRace(nearRace)) return;
      }
      world.enterCar();
      return;
    }
    if (actions & ACTION_FIRE) {
      world.fireWeapon(aimAngle());
      return;
    }
    if (input.mouse.down) {
      world.fireWeapon(aimAngle());
    }
  }

  function step() {
    if (screen !== SCREEN_PLAY) return;
    const events = world.step(STEP, input, aimAngle());
    if (events & EVENT_JOB_DONE) { audio.success(); refreshRank(); writeSave(); }
    if (events & EVENT_JOB_FAIL) { audio.fail(); writeSave(); }
    if (events & EVENT_RACE_WIN) { audio.success(); refreshRank(); writeSave(); }
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_SHOT) audio.shot();
    if (events & EVENT_BUSTED) {
      ui.overKind = 'busted';
      audio.fail();
      screen = SCREEN_OVER;
      announce('Busted! The SPD caught you.');
    }
    if (events & EVENT_WASTED) {
      ui.overKind = 'wasted';
      audio.fail();
      screen = SCREEN_OVER;
      announce('Wasted!');
    }
    saveTimer += STEP;
    if (saveTimer > 10) {
      saveTimer = 0;
      writeSave();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    // The renderer reads the live objective and any running job timer.
    const state = world.state;
    state.objective = world.currentObjective();
    if (state.activeJob && state.activeJob.timer > 0) {
      ui.jobTimer = `${Math.ceil(state.activeJob.timer)}s`;
    } else if (state.activeJob && state.activeJob.waitLeft > 0) {
      ui.jobTimer = `${Math.ceil(state.activeJob.waitLeft)}s`;
    } else {
      ui.jobTimer = '';
    }
    renderer.draw(state, screen, ui);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      writeSave();
      announce('Paused.');
    }
  });

  announce(`${GAME_TITLE}. Press Enter or click to start.`);
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
