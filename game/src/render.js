// Drawing only: the island, its cars and people, the HUD, the minimap and every menu
// screen. The camera shows a 1280x720 window of the 3600x2400 island, scaled to the
// browser window. Flat shapes and canvas text; the only allocations per frame are the
// small cached label strings.

import { CAR, DISTRICTS, FONT, GAME_SUBTITLE, GAME_TITLE, GARAGE, JOBS, PALETTE, POLICE, RADIO, RANKS, ROADS, VIEW, WEAPONS, WORLD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_JOBS = 'jobs';
export const SCREEN_PLAN = 'plan';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_GARAGE = 'garage';
export const SCREEN_OVER = 'over';
export const SCREEN_HELP = 'help';

const TAU = Math.PI * 2;
const MINIMAP = { x: 1030, y: 16, w: 234, h: 156 };

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const cashLabel = cachedLabel('Cash $');
  const respectLabel = cachedLabel('Respect ');
  const healthLabel = cachedLabel('HP ');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.fillText(value, x, y);
  }

  function rect(x, y, w, h, color) {
    context.fillStyle = color;
    context.fillRect(x, y, w, h);
  }

  function circle(x, y, r, color) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, r, 0, TAU);
    context.fill();
  }

  // ---- world ----
  function drawWorld(state) {
    const cam = state.camera;
    const ox = VIEW.width / 2 - cam.x;
    const oy = VIEW.height / 2 - cam.y;
    context.save();
    context.translate(ox, oy);

    // The sea around the island.
    rect(cam.x - VIEW.width / 2 - 40, cam.y - VIEW.height / 2 - 40, VIEW.width + 80, VIEW.height + 80, '#16324a');
    // Sand rim.
    rect(-30, -30, WORLD.width + 60, WORLD.height + 60, '#c9b078');
    // Districts.
    for (const d of DISTRICTS) rect(d.x, d.y, d.w, d.h, d.ground);
    // Roads.
    for (const road of ROADS) {
      if (road.axis === 'v') rect(road.at - road.w / 2, road.from, road.w, road.to - road.from, '#20242c');
      else rect(road.from, road.at - road.w / 2, road.to - road.from, road.w, '#20242c');
    }
    // Road centre dashes.
    context.strokeStyle = 'rgba(238,241,245,0.35)';
    context.lineWidth = 3;
    context.setLineDash([26, 30]);
    context.beginPath();
    for (const road of ROADS) {
      if (road.axis === 'v') { context.moveTo(road.at, road.from); context.lineTo(road.at, road.to); }
      else { context.moveTo(road.from, road.at); context.lineTo(road.to, road.at); }
    }
    context.stroke();
    context.setLineDash([]);
    // District names on the ground.
    context.textAlign = 'center';
    for (const d of DISTRICTS) {
      text(d.name.toUpperCase(), d.x + d.w / 2, d.y + d.h / 2, 34, 'rgba(238,241,245,0.16)', 'center');
    }
    // Buildings.
    for (const b of state.buildings) {
      rect(b.x, b.y, b.w, b.h, b.shade);
      rect(b.x + 5, b.y + 5, b.w - 10, b.h - 10, b.color);
      rect(b.x + 5, b.y + 5, b.w - 10, 8, 'rgba(255,255,255,0.12)');
    }
    // Garage.
    const g = state.garage;
    rect(g.x - 46, g.y - 30, 92, 60, '#3a2f1e');
    text('GARAGE', g.x, g.y - 40, 20, PALETTE.gold, 'center');
    rect(g.x - 40, g.y - 24, 80, 48, '#6b5636');
    // Race markers.
    for (const r of state.raceMarkers) {
      circle(r.x, r.y, 26, 'rgba(242,201,76,0.25)');
      text('🏁', r.x, r.y + 8, 26, '#fff', 'center');
    }
    // Job pickups.
    for (const pk of state.pickups) {
      if (!pk.active) continue;
      const pulse = 18 + Math.sin(state.time * 5) * 4;
      circle(pk.x, pk.y, pulse, 'rgba(242,201,76,0.35)');
      rect(pk.x - 10, pk.y - 10, 20, 20, PALETTE.gold);
      rect(pk.x - 6, pk.y - 6, 12, 12, '#8a6d1f');
    }
    // Race gates.
    if (state.race && !state.race.finished) {
      const race = state.race;
      race.gates.forEach((gate, i) => {
        const reached = i < race.gateIndex;
        circle(gate[0], gate[1], i === race.gateIndex ? 34 : 24, reached ? 'rgba(127,208,138,0.4)' : i === race.gateIndex ? 'rgba(242,201,76,0.4)' : 'rgba(154,163,178,0.25)');
        text(String(i + 1), gate[0], gate[1] + 7, 22, '#fff', 'center');
      });
    }
    // Objective marker.
    if (state.objective) {
      const o = state.objective;
      const pulse = 30 + Math.sin(state.time * 4) * 6;
      context.strokeStyle = PALETTE.gold;
      context.lineWidth = 4;
      context.beginPath();
      context.arc(o.x, o.y, pulse, 0, TAU);
      context.stroke();
      context.beginPath();
      context.moveTo(o.x, o.y - pulse - 14);
      context.lineTo(o.x, o.y - pulse + 6);
      context.stroke();
      circle(o.x, o.y, 6, PALETTE.gold);
    }
    // Cars.
    for (const car of state.cars) {
      if (!car.active) continue;
      drawCar(car);
    }
    // Bullets.
    for (const b of state.bullets) {
      if (!b.active) continue;
      circle(b.x, b.y, 3, '#ffe08a');
    }
    // Particles.
    for (const p of state.particles) {
      if (!p.active) continue;
      context.globalAlpha = Math.max(0, p.life / p.max);
      circle(p.x, p.y, p.size, p.color);
    }
    context.globalAlpha = 1;
    // Player on foot.
    const player = state.player;
    if (player.onFoot) {
      circle(player.x, player.y, 16, 'rgba(0,0,0,0.3)');
      circle(player.x, player.y, 13, '#e5534b');
      context.strokeStyle = '#fff';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(player.x, player.y, 13, player.angle - 0.6, player.angle + 0.6);
      context.stroke();
      circle(player.x + Math.cos(player.angle) * 8, player.y + Math.sin(player.angle) * 8, 4, '#fff');
    }
    // Helicopter shadow + body.
    if (state.heli.active) {
      const h = state.heli;
      circle(h.x + 30, h.y + 40, 26, 'rgba(0,0,0,0.25)');
      context.save();
      context.translate(h.x, h.y);
      context.rotate(h.angle);
      rect(-26, -9, 52, 18, '#c9a227');
      rect(26, -3, 22, 6, '#8a6d1f');
      context.restore();
      context.save();
      context.translate(h.x, h.y);
      context.rotate(state.time * 22);
      rect(-34, -2, 68, 4, 'rgba(238,241,245,0.7)');
      context.restore();
      // Searchlight cone.
      context.fillStyle = 'rgba(242,201,76,0.10)';
      context.beginPath();
      context.moveTo(h.x, h.y);
      context.arc(player.x, player.y, 90, 0, TAU);
      context.closePath();
      context.fill();
    }
    context.restore();
  }

  function drawCar(car) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    const len = CAR.length;
    const wid = CAR.width;
    // Shadow.
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.fillRect(-len / 2 + 3, -wid / 2 + 4, len, wid);
    context.fillStyle = car.color;
    context.fillRect(-len / 2, -wid / 2, len, wid);
    // Cabin.
    context.fillStyle = 'rgba(13,17,23,0.55)';
    context.fillRect(-len / 2 + 12, -wid / 2 + 4, len - 26, wid - 8);
    // Windshield + headlights.
    context.fillStyle = 'rgba(238,241,245,0.75)';
    context.fillRect(len / 2 - 6, -wid / 2 + 3, 4, wid - 6);
    context.fillStyle = '#ffe08a';
    context.fillRect(len / 2 - 2, -wid / 2 + 2, 3, 5);
    context.fillRect(len / 2 - 2, wid / 2 - 7, 3, 5);
    if (car.kind === 'police' || car.kind === 'roadblock') {
      // Light bar.
      context.fillStyle = '#5b8def';
      context.fillRect(-6, -wid / 2 + 2, 12, 7);
      context.fillStyle = '#e5534b';
      context.fillRect(-6, wid / 2 - 9, 12, 7);
      text('SPD', 0, 4, 11, '#fff', 'center');
    }
    if (car.isTarget) {
      context.fillStyle = PALETTE.gold;
      context.fillRect(-len / 2 - 2, -wid / 2 - 2, 4, wid + 4);
    }
    if (car.health < car.maxHealth * 0.5) {
      // Smoke.
      context.fillStyle = 'rgba(154,163,178,0.6)';
      context.beginPath();
      context.arc(-len / 2 + 6, 0, 6 + Math.sin(car.x) * 2, 0, TAU);
      context.fill();
    }
    context.restore();
  }

  // ---- HUD ----
  function drawHud(state, ui) {
    const player = state.player;
    context.textBaseline = 'top';
    // Cash + respect.
    rect(16, 14, 250, 64, PALETTE.minimapBg);
    text(cashLabel(state.cash), 28, 22, 26, PALETTE.gold, 'left');
    text(respectLabel(`${ui.rank} · ${state.respect} respect`), 28, 52, 18, PALETTE.hud, 'left');
    // Wanted stars.
    const stars = Math.round(state.wanted);
    for (let i = 0; i < 5; i += 1) {
      const filled = i < stars;
      text(filled ? '★' : '☆', 300 + i * 34, 18, 32, filled ? PALETTE.gold : PALETTE.muted, 'left');
    }
    if (stars > 0) text(POLICE.short, 300, 56, 16, PALETTE.police, 'left');
    // Health + weapon.
    rect(16, 660, 250, 44, PALETTE.minimapBg);
    text(healthLabel(Math.max(0, Math.round(player.health))), 28, 670, 22, player.health > 30 ? PALETTE.hud : PALETTE.red, 'left');
    const weapon = WEAPONS[player.weaponIdx];
    text(`[${player.weaponIdx + 1}] ${weapon.name}`, 150, 672, 18, PALETTE.muted, 'left');
    if (player.car) {
      const carHealth = Math.max(0, Math.round(player.car.health));
      text(`Car ${carHealth}`, 28, 640, 18, carHealth > 30 ? PALETTE.hud : PALETTE.red, 'left');
    }
    // Radio.
    text(`♪ ${ui.radio}  [R]`, 16, 620, 16, PALETTE.muted, 'left');
    // Objective.
    if (state.objective) {
      const o = state.objective;
      rect(330, 660, 620, 44, PALETTE.minimapBg);
      text(`◆ ${o.label}`, 344, 672, 20, PALETTE.gold, 'left');
      if (ui.jobTimer) text(ui.jobTimer, 920, 672, 20, PALETTE.red, 'left');
    }
    // Toast message.
    if (state.message.text && state.time < state.message.until) {
      const w = context.measureText(state.message.text).width + 40;
      rect((VIEW.width - w) / 2, 100, w, 40, PALETTE.minimapBg);
      context.font = `20px ${FONT}`;
      text(state.message.text, VIEW.width / 2, 110, 20, PALETTE.hud, 'center');
    }
    // Controls hint.
    text('WASD drive/walk · E enter car · F shoot · P pause · R radio · M mute · G garage', 16, 700 - 8, 14, 'rgba(154,163,178,0.8)', 'left');
    drawMinimap(state);
  }

  function drawMinimap(state) {
    const sx = MINIMAP.w / WORLD.width;
    const sy = MINIMAP.h / WORLD.height;
    rect(MINIMAP.x - 6, MINIMAP.y - 6, MINIMAP.w + 12, MINIMAP.h + 12, PALETTE.minimapBg);
    for (const d of DISTRICTS) rect(MINIMAP.x + d.x * sx, MINIMAP.y + d.y * sy, d.w * sx, d.h * sy, d.ground);
    context.strokeStyle = 'rgba(238,241,245,0.4)';
    context.lineWidth = 1;
    for (const road of ROADS) {
      context.beginPath();
      if (road.axis === 'v') { context.moveTo(MINIMAP.x + road.at * sx, MINIMAP.y + road.from * sy); context.lineTo(MINIMAP.x + road.at * sx, MINIMAP.y + road.to * sy); }
      else { context.moveTo(MINIMAP.x + road.from * sx, MINIMAP.y + road.at * sy); context.lineTo(MINIMAP.x + road.to * sx, MINIMAP.y + road.at * sy); }
      context.stroke();
    }
    // Garage.
    circle(MINIMAP.x + state.garage.x * sx, MINIMAP.y + state.garage.y * sy, 4, PALETTE.gold);
    // Objective.
    if (state.objective) {
      circle(MINIMAP.x + state.objective.x * sx, MINIMAP.y + state.objective.y * sy, 5, PALETTE.gold);
    }
    // Cops.
    for (const cop of state.cops) circle(MINIMAP.x + cop.car.x * sx, MINIMAP.y + cop.car.y * sy, 3, PALETTE.police);
    if (state.heli.active) circle(MINIMAP.x + state.heli.x * sx, MINIMAP.y + state.heli.y * sy, 4, '#c9a227');
    // Player.
    const px = MINIMAP.x + state.player.x * sx;
    const py = MINIMAP.y + state.player.y * sy;
    context.save();
    context.translate(px, py);
    context.rotate(state.player.angle);
    context.fillStyle = '#fff';
    context.beginPath();
    context.moveTo(8, 0);
    context.lineTo(-6, -5);
    context.lineTo(-6, 5);
    context.closePath();
    context.fill();
    context.restore();
    text(districtAtText(state.player.x, state.player.y), MINIMAP.x, MINIMAP.y + MINIMAP.h + 10, 15, PALETTE.muted, 'left');
  }

  function districtAtText(x, y) {
    for (const d of DISTRICTS) {
      if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d.name;
    }
    return '';
  }

  // ---- panels ----
  function drawPanel(title, lines, prompt, width) {
    const w = width || 640;
    const lineH = 30;
    const height = 150 + lines.length * lineH + 60;
    const x = (VIEW.width - w) / 2;
    const y = (VIEW.height - height) / 2;
    rect(x, y, w, height, PALETTE.panel);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, w, height);
    context.textBaseline = 'alphabetic';
    text(title, VIEW.width / 2, y + 64, 40, PALETTE.hud, 'center');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], VIEW.width / 2, y + 120 + i * lineH, 20, PALETTE.muted, 'center');
    }
    if (prompt) text(prompt, VIEW.width / 2, y + height - 26, 20, PALETTE.gold, 'center');
    return { x, y, w, h: height };
  }

  function drawTitle(state, ui) {
    drawWorld(state);
    // Dim the world behind the title.
    context.fillStyle = 'rgba(13,17,23,0.55)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    context.textBaseline = 'alphabetic';
    text(GAME_TITLE, VIEW.width / 2, 220, 96, PALETTE.gold, 'center');
    text(GAME_SUBTITLE, VIEW.width / 2, 268, 30, PALETTE.hud, 'center');
    text('An open-world crime game on one island city', VIEW.width / 2, 310, 20, PALETTE.muted, 'center');
    const lines = [
      '8 story jobs · plan your crew and tools · 6 districts to own',
      `${POLICE.name} escalates: patrols, roadblocks, PIT units, ${POLICE.airUnitCall}`,
      'Drive, walk, race, upgrade your garage, outrun the law.',
    ];
    lines.forEach((line, i) => text(line, VIEW.width / 2, 360 + i * 30, 20, PALETTE.hud, 'center'));
    if (ui.hasSave) text('Press ENTER to continue your career — or N for a new game', VIEW.width / 2, 500, 22, PALETTE.gold, 'center');
    else text('Press ENTER or click to start', VIEW.width / 2, 500, 22, PALETTE.gold, 'center');
    text('WASD move · E enter car · F shoot · P pause · R radio', VIEW.width / 2, 540, 18, PALETTE.muted, 'center');
    text('H for help', VIEW.width / 2, 566, 18, PALETTE.muted, 'center');
  }

  function drawJobs(state, ui) {
    drawWorld(state);
    context.fillStyle = 'rgba(13,17,23,0.72)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    context.textBaseline = 'alphabetic';
    text('STORY JOBS', VIEW.width / 2, 84, 44, PALETTE.gold, 'center');
    text('Pick a job — then plan your crew and tools', VIEW.width / 2, 118, 20, PALETTE.muted, 'center');
    const rowH = 58;
    const startY = 150;
    JOBS.forEach((job, i) => {
      const y = startY + i * rowH;
      const done = state.jobsDone.includes(job.id);
      const selected = i === ui.selectedJob;
      if (selected) rect(140, y - 6, 1000, rowH - 8, 'rgba(242,201,76,0.14)');
      context.strokeStyle = selected ? PALETTE.gold : PALETTE.panelEdge;
      context.lineWidth = selected ? 2 : 1;
      context.strokeRect(140, y - 6, 1000, rowH - 8);
      text(`${job.num}. ${job.name}`, 160, y + 20, 24, done ? PALETTE.green : PALETTE.hud, 'left');
      text(job.blurb, 160, y + 44, 16, PALETTE.muted, 'left');
      text(done ? 'DONE ✓' : `$${job.payout} · +${job.respect} respect`, 1120, y + 20, 18, done ? PALETTE.green : PALETTE.gold, 'right');
      const district = DISTRICTS.find((d) => d.id === job.district);
      text(district ? district.name : '', 1120, y + 44, 15, PALETTE.muted, 'right');
    });
    text('↑ ↓ choose · ENTER plan the job · ESC back to the streets', VIEW.width / 2, 660, 20, PALETTE.gold, 'center');
  }

  function drawPlan(state, ui) {
    drawWorld(state);
    context.fillStyle = 'rgba(13,17,23,0.78)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    const job = JOBS[ui.selectedJob];
    const plan = ui.plan;
    context.textBaseline = 'alphabetic';
    text(`PLAN: ${job.name.toUpperCase()}`, VIEW.width / 2, 70, 36, PALETTE.gold, 'center');
    text(job.blurb, VIEW.width / 2, 104, 19, PALETTE.muted, 'center');
    text(`Budget $${job.budget} · Spent $${plan.spent} · Left $${job.budget - plan.spent}`, VIEW.width / 2, 134, 20, plan.spent > job.budget ? PALETTE.red : PALETTE.hud, 'center');
    // Crew list.
    text('CREW — pick up to 3 (keys 1-5, or ↑ ↓ + SPACE)', 90, 180, 20, PALETTE.hud, 'left');
    const crew = plan.crewList;
    crew.forEach((c, i) => {
      const y = 200 + i * 52;
      const picked = plan.crew.includes(c.id);
      const sel = ui.planCursor === i;
      if (sel) rect(80, y - 8, 520, 46, 'rgba(242,201,76,0.14)');
      text(`${i + 1}. ${c.name} — ${c.role}`, 96, y + 16, 20, picked ? PALETTE.green : PALETTE.hud, 'left');
      text(`$${c.cost} · ${c.ability}`, 96, y + 38, 15, PALETTE.muted, 'left');
      if (picked) text('✓', 580, y + 16, 22, PALETTE.green, 'left');
    });
    // Tools list.
    text('TOOLS (keys 6-0, or ↑ ↓ + SPACE)', 680, 180, 20, PALETTE.hud, 'left');
    const tools = plan.toolList;
    tools.forEach((t, i) => {
      const y = 200 + i * 52;
      const picked = plan.tools.includes(t.id);
      const sel = ui.planCursor === crew.length + i;
      if (sel) rect(670, y - 8, 520, 46, 'rgba(242,201,76,0.14)');
      text(`${i + 6}. ${t.name}`, 686, y + 16, 20, picked ? PALETTE.green : PALETTE.hud, 'left');
      text(`$${t.cost} · ${t.ability}`, 686, y + 38, 15, PALETTE.muted, 'left');
      if (picked) text('✓', 1170, y + 16, 22, PALETTE.green, 'left');
    });
    text('ENTER start the job · ESC back to jobs', VIEW.width / 2, 640, 20, PALETTE.gold, 'center');
    if (plan.spent > job.budget) text('Over budget! Drop a crew member or a tool.', VIEW.width / 2, 676, 20, PALETTE.red, 'center');
  }

  function drawGarage(state, ui) {
    drawWorld(state);
    context.fillStyle = 'rgba(13,17,23,0.78)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    context.textBaseline = 'alphabetic';
    text('GARAGE', VIEW.width / 2, 76, 40, PALETTE.gold, 'center');
    text(`Cash $${state.cash} · Your car: ${state.player.car ? Math.round(state.player.car.health) + ' HP' : 'on foot'}`, VIEW.width / 2, 110, 20, PALETTE.hud, 'center');
    const rowH = 46;
    const startY = 150;
    GARAGE.forEach((item, i) => {
      const y = startY + i * rowH;
      const owned = state.owned.includes(item.id);
      const sel = i === ui.garageCursor;
      if (sel) rect(180, y - 6, 920, rowH - 6, 'rgba(242,201,76,0.14)');
      text(`${item.name}`, 200, y + 18, 22, owned ? PALETTE.green : PALETTE.hud, 'left');
      text(item.desc, 520, y + 18, 18, PALETTE.muted, 'left');
      text(owned ? 'OWNED' : `$${item.cost}`, 1080, y + 18, 20, owned ? PALETTE.green : PALETTE.gold, 'right');
    });
    const wy = startY + GARAGE.length * rowH + 20;
    text('WEAPONS', 200, wy, 22, PALETTE.hud, 'left');
    WEAPONS.forEach((w, i) => {
      const y = wy + 26 + i * 40;
      const owned = state.weaponsOwned.includes(w.id);
      const sel = ui.garageCursor === GARAGE.length + i;
      if (sel) rect(180, y - 6, 920, 36, 'rgba(242,201,76,0.14)');
      text(`[${w.slot}] ${w.name}`, 200, y + 16, 20, owned ? PALETTE.green : PALETTE.hud, 'left');
      const need = RANKS[w.needRank] ? RANKS[w.needRank].name : '';
      text(owned ? 'OWNED' : w.cost === 0 ? 'FREE' : `$${w.cost} · needs ${need} rank`, 1080, y + 16, 18, owned ? PALETTE.green : PALETTE.gold, 'right');
    });
    text('↑ ↓ choose · ENTER buy · ESC back to the streets', VIEW.width / 2, 668, 20, PALETTE.gold, 'center');
    if (ui.garageMessage) text(ui.garageMessage, VIEW.width / 2, 700 - 8, 18, PALETTE.red, 'center');
  }

  function drawPaused(state, ui) {
    drawWorld(state);
    drawHud(state, ui);
    drawPanel('Paused', [
      'The island waits for you.',
      `Cash $${state.cash} · Respect ${state.respect} · Rank ${ui.rank}`,
      `Jobs done: ${state.jobsDone.length} of ${JOBS.length} · Races won: ${state.stats.races}`,
      'Turf standing: ' + DISTRICTS.map((d) => `${d.name} ${state.standing[d.id] || 0}`).join(' · '),
    ], 'Press P to resume · J for jobs · G for garage · H for help');
  }

  function drawOver(state, ui) {
    drawWorld(state);
    const busted = ui.overKind === 'busted';
    drawPanel(
      busted ? 'BUSTED!' : 'WASTED!',
      busted
        ? ['The SPD caught up with you.', 'Your crew posted bail — it cost you $300.', `Cash $${state.cash} · Jobs done ${state.jobsDone.length} of ${JOBS.length}`]
        : ['Solmara is a hard city.', 'You wake up at the garage, lighter by $300.', `Cash $${state.cash} · Jobs done ${state.jobsDone.length} of ${JOBS.length}`],
      'Press ENTER to get back on the streets',
    );
  }

  function drawHelp(state, ui) {
    drawWorld(state);
    drawPanel('How to play Solmara', [
      'WASD / arrows — drive or walk. E — get in or out of a car.',
      'F or click — shoot (aim with the mouse). 1/2/3 — switch weapon.',
      'J — story jobs. Each job has a planning phase: pick crew + tools',
      '    against the job budget. Crew abilities change how the job plays.',
      'G — garage (near the gold marker): engines, armour, tyres, weapons.',
      'R — radio station. M — mute. SHIFT — nitro (when you own it).',
      'Wanted stars bring the SPD: patrols, roadblocks, PIT units,',
      '    then HAWK ONE, the police helicopter. Lay low and the heat fades.',
      'Race flags start street races. Gold markers are your objectives.',
      'Progress saves automatically to this browser.',
    ], 'Press H or ESC to close');
  }

  /** Paint one frame: the world, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, ui) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    rect(0, 0, canvas.width, canvas.height, PALETTE.backdrop);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    context.textBaseline = 'alphabetic';
    if (screen === SCREEN_TITLE) { drawTitle(state, ui); return; }
    if (screen === SCREEN_JOBS) { drawJobs(state, ui); return; }
    if (screen === SCREEN_PLAN) { drawPlan(state, ui); return; }
    if (screen === SCREEN_GARAGE) { drawGarage(state, ui); return; }
    if (screen === SCREEN_HELP) { drawHelp(state, ui); return; }
    if (screen === SCREEN_OVER) { drawOver(state, ui); return; }
    drawWorld(state);
    drawHud(state, ui);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', [
        'The island waits for you.',
        `Cash $${state.cash} · Respect ${state.respect} · Rank ${ui.rank}`,
        `Jobs done: ${state.jobsDone.length} of ${JOBS.length} · Races won: ${state.stats.races}`,
      ], 'Press P to resume · J for jobs · G for garage · H for help');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
