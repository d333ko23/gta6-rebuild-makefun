// SOLMARA — Streets of the Sun. Every tuning number, district, job, crew member, tool,
// police tier and radio station in one place. The world is one island, 3600x2400 units;
// the renderer scales a 1280x720 camera view of it to the window, so no rule below
// depends on the screen size.

export const CITY = 'Solmara';
export const GAME_TITLE = 'SOLMARA';
export const GAME_SUBTITLE = 'Streets of the Sun';

export const STEP = 1 / 60;
export const WORLD = { width: 3600, height: 2400 };
export const VIEW = { width: 1280, height: 720 };

/** The police force of Solmara, and its air unit. */
export const POLICE = {
  name: 'Solmara Police Department',
  short: 'SPD',
  airUnit: 'HAWK ONE',
  airUnitCall: 'SPD Hawk One',
};

/** Six districts in a 3x2 grid. Roads run on their borders (x=1200, x=2400, y=1200). */
export const DISTRICTS = [
  { id: 'harbor',   name: 'Harbor Point',  x: 0,    y: 0,    w: 1200, h: 1200, ground: '#263c46', road: '#3a4a52', accent: '#e8a33d', blurb: 'crates, cranes and quiet docks' },
  { id: 'oldtown',  name: 'Old Town',      x: 1200, y: 0,    w: 1200, h: 1200, ground: '#3d3428', road: '#4a4034', accent: '#d97b4f', blurb: 'narrow lanes, old money' },
  { id: 'hills',    name: 'The Hills',     x: 2400, y: 0,    w: 1200, h: 1200, ground: '#2f4030', road: '#43513f', accent: '#8fc97a', blurb: 'villas above the bay' },
  { id: 'flats',    name: 'Cactus Flats',  x: 0,    y: 1200, w: 1200, h: 1200, ground: '#4a3f2a', road: '#55482f', accent: '#e0c25a', blurb: 'dust, diners and drag strips' },
  { id: 'downtown', name: 'Downtown',      x: 1200, y: 1200, w: 1200, h: 1200, ground: '#2c2f3d', road: '#3d4152', accent: '#6fa8e8', blurb: 'glass towers, fast money' },
  { id: 'marina',   name: 'Marina Crest',  x: 2400, y: 1200, w: 1200, h: 1200, ground: '#27404a', road: '#37525e', accent: '#4fd1c5', blurb: 'yachts, beaches and neon' },
];

/** Roads: axis-aligned bands the traffic graph and the renderer share. */
export const ROADS = [
  { axis: 'v', at: 1200, from: 0, to: 2400, w: 96 },
  { axis: 'v', at: 2400, from: 0, to: 2400, w: 96 },
  { axis: 'h', at: 1200, from: 0, to: 3600, w: 96 },
  { axis: 'h', at: 90, from: 0, to: 3600, w: 110 },
  { axis: 'h', at: 2310, from: 0, to: 3600, w: 110 },
  { axis: 'v', at: 90, from: 0, to: 2400, w: 110 },
  { axis: 'v', at: 3510, from: 0, to: 2400, w: 110 },
];

/** Traffic graph nodes (intersections) and edges, as node indexes. */
export const NODES = [
  [90, 90], [1200, 90], [2400, 90], [3510, 90],
  [90, 1200], [1200, 1200], [2400, 1200], [3510, 1200],
  [90, 2310], [1200, 2310], [2400, 2310], [3510, 2310],
];
export const EDGES = [
  [0, 1], [1, 2], [2, 3],
  [4, 5], [5, 6], [6, 7],
  [8, 9], [9, 10], [10, 11],
  [0, 4], [4, 8], [1, 5], [5, 9], [2, 6], [6, 10], [3, 7], [7, 11],
];

export const PLAYER = {
  onFootSpeed: 210,
  radius: 14,
  maxHealth: 100,
  carEnterRange: 70,
};

/** Car physics. Values are for a stock car; garage upgrades multiply them. */
export const CAR = {
  length: 52,
  width: 26,
  accel: 420,
  brake: 700,
  reverseAccel: 260,
  maxSpeed: 560,
  maxReverse: 180,
  steer: 2.6,
  drag: 0.55,
  grip: 0.92,
  maxHealth: 100,
};

export const WANTED = {
  maxStars: 5,
  decayPerSecond: 0.045,
  decayUnseenPerSecond: 0.12,
  stealCar: 1,
  shoot: 0.5,
  killCop: 1,
  jobAlarm: 1,
  /** Stars at which each police tier joins the chase. */
  roadblockAt: 3,
  pitAt: 4,
  heliAt: 5,
  bustedHoldSeconds: 2.2,
};

export const CREW = [
  { id: 'rosa',  name: 'Rosa "Vela" Cruz',  role: 'Wheelwoman', cost: 800, ability: 'Top speed +15%, sharper steering', speed: 1.15, steer: 1.18 },
  { id: 'dex',   name: 'Dex Marlow',        role: 'Hacker',     cost: 600, ability: 'Timers +25% time, alarms draw less heat', time: 1.25, heat: 0.75 },
  { id: 'bruno', name: 'Bruno Hale',        role: 'Muscle',     cost: 700, ability: 'You take 30% less damage, ram harder', armor: 0.7, ram: 1.6 },
  { id: 'lena',  name: 'Lena Voss',         role: 'Lookout',    cost: 500, ability: 'Wanted fades twice as fast, cops spot you later', decay: 2, spot: 0.8 },
  { id: 'milo',  name: 'Milo Ferreira',     role: 'Mechanic',   cost: 400, ability: 'Car starts the job at full health, +50 armour', carArmor: 50, repair: true },
];

export const TOOLS = [
  { id: 'lockpick', name: 'Lockpick Set',   cost: 200, ability: 'No alarm when you grab the goods' },
  { id: 'silencer', name: 'Silenced Pistol', cost: 350, ability: 'Shooting draws half the usual heat' },
  { id: 'vest',     name: 'Kevlar Vest',    cost: 300, ability: '+50 health for the whole job' },
  { id: 'nitro',    name: 'Nitro Kit',      cost: 450, ability: 'Hold SHIFT for a nitro boost during the job' },
  { id: 'plates',   name: 'Fake Plates',    cost: 250, ability: 'Wanted fades 50% faster during the job' },
];

/**
 * The eight story jobs. Each has a budget for crew + tools, a payout, a district, and a
 * sequence of steps: goto (reach the marker), collect (grab N packages), deliver (carry the
 * goods to the drop), steal (jack the marked car and bring it in), race (hit the gates in
 * order), survive (stay alive until the timer ends). `heat` is the wanted jump when the job
 * goes loud; `time` is a limit in seconds, 0 for none.
 */
export const JOBS = [
  {
    id: 'harbor-heist', num: 1, name: 'Harbor Heist', district: 'harbor', budget: 1500, payout: 2600,
    blurb: 'Lift three crates off the docks before the night shift clocks in.',
    steps: [
      { type: 'goto', x: 420, y: 420, label: 'Reach the docks' },
      { type: 'collect', x: 300, y: 300, n: 3, label: 'Grab 3 crates' },
      { type: 'deliver', x: 1560, y: 1560, label: 'Drop the crates at the garage' },
    ],
    heat: 1, time: 0, respect: 60,
  },
  {
    id: 'getaway', num: 2, name: 'The Getaway', district: 'flats', budget: 1800, payout: 3200,
    blurb: 'Pick up the crew at the diner, then lose the tail and reach the safehouse.',
    steps: [
      { type: 'goto', x: 480, y: 1800, label: 'Pick up the crew at the diner' },
      { type: 'escape', x: 3000, y: 360, label: 'Reach the Hills safehouse — 90 s', time: 90 },
    ],
    heat: 2, time: 0, respect: 80,
  },
  {
    id: 'bank-run', num: 3, name: 'Bank Run', district: 'downtown', budget: 2200, payout: 4800,
    blurb: 'Walk into the Downtown bank, hold the lobby for 20 seconds, walk out rich.',
    steps: [
      { type: 'goto', x: 1800, y: 1800, label: 'Reach the Downtown bank' },
      { type: 'wait', x: 1800, y: 1800, seconds: 20, label: 'Hold the lobby (20 s)' },
      { type: 'escape', x: 600, y: 600, label: 'Escape to the Harbor hideout' },
    ],
    heat: 2, time: 0, respect: 120,
  },
  {
    id: 'marina-mile', num: 4, name: 'Marina Mile', district: 'marina', budget: 2000, payout: 4200,
    blurb: 'A street race down the Marina front. Beat two rivals through five gates.',
    steps: [
      { type: 'race', gates: [[2700, 1500], [3300, 1500], [3300, 2100], [2700, 2100], [3000, 1800]], label: 'Win the Marina Mile' },
    ],
    heat: 1, time: 0, respect: 100, race: true,
  },
  {
    id: 'turbo-takeover', num: 5, name: 'Turbo Takeover', district: 'hills', budget: 2600, payout: 5600,
    blurb: 'A gold sports car sits in a Hills driveway. Take it. Bring it to the garage.',
    steps: [
      { type: 'steal', x: 3060, y: 420, label: 'Steal the gold Comet GT' },
      { type: 'deliver', x: 1560, y: 1560, label: 'Deliver it to the garage' },
    ],
    heat: 1, time: 0, respect: 140,
  },
  {
    id: 'rooftop-drop', num: 6, name: 'Rooftop Drop', district: 'oldtown', budget: 3000, payout: 6800,
    blurb: 'Five packages stashed across Old Town and Downtown. Collect them all, fast.',
    steps: [
      { type: 'collect', x: 1500, y: 300, n: 2, label: 'Grab 2 packages in Old Town' },
      { type: 'collect', x: 2100, y: 2100, n: 3, label: 'Grab 3 packages in Downtown' },
      { type: 'deliver', x: 1560, y: 1560, label: 'Drop everything at the garage' },
    ],
    heat: 1, time: 240, respect: 160,
  },
  {
    id: 'big-score', num: 7, name: 'The Big Score', district: 'downtown', budget: 3600, payout: 11000,
    blurb: 'The vault under the Downtown bank. In, out, gone — with the whole city watching.',
    steps: [
      { type: 'goto', x: 1800, y: 1800, label: 'Reach the bank vault' },
      { type: 'wait', x: 1800, y: 1800, seconds: 30, label: 'Crack the vault (30 s)' },
      { type: 'collect', x: 1500, y: 2100, n: 2, label: 'Grab the cash bags' },
      { type: 'escape', x: 300, y: 2100, label: 'Escape to the Flats — 120 s', time: 120 },
    ],
    heat: 3, time: 0, respect: 260,
  },
  {
    id: 'king-solmara', num: 8, name: 'King of Solmara', district: 'marina', budget: 4000, payout: 18000,
    blurb: 'The rival crew holds Marina Crest. Take their turf, survive the storm, own the island.',
    steps: [
      { type: 'goto', x: 3000, y: 1800, label: 'Reach Marina Crest' },
      { type: 'survive', seconds: 60, label: 'Hold the marina against the rivals (60 s)' },
      { type: 'escape', x: 1560, y: 1560, label: 'Drive home a legend' },
    ],
    heat: 4, time: 0, respect: 500,
  },
];

/** Respect ranks, by respect points. */
export const RANKS = [
  { at: 0, name: 'Rookie' },
  { at: 100, name: 'Hustler' },
  { at: 300, name: 'Wheelman' },
  { at: 700, name: 'Kingpin' },
  { at: 1500, name: 'Legend of Solmara' },
];

/** Garage upgrades, bought with earned cash at the garage marker. */
export const GARAGE = [
  { id: 'engine1', name: 'Engine Mk I', cost: 1500, desc: 'Top speed +12%' },
  { id: 'engine2', name: 'Engine Mk II', cost: 3000, desc: 'Top speed +12% more', needs: 'engine1' },
  { id: 'engine3', name: 'Engine Mk III', cost: 6000, desc: 'Top speed +12% more', needs: 'engine2' },
  { id: 'armor1', name: 'Armour Plating I', cost: 1200, desc: 'Car health +60' },
  { id: 'armor2', name: 'Armour Plating II', cost: 2500, desc: 'Car health +60 more', needs: 'armor1' },
  { id: 'tires', name: 'Racing Tyres', cost: 1000, desc: 'Sharper steering, better grip' },
  { id: 'nitro', name: 'Nitro Tank', cost: 2000, desc: 'Hold SHIFT for nitro, any time' },
  { id: 'repair', name: 'Full Repair', cost: 200, desc: 'Restore your car to full health', repeatable: true },
];

export const WEAPONS = [
  { id: 'pistol', name: 'Pistol', slot: 1, damage: 12, rate: 0.28, speed: 900, cost: 0, needRank: 0 },
  { id: 'smg', name: 'SMG', slot: 2, damage: 8, rate: 0.09, speed: 1000, cost: 800, needRank: 2 },
  { id: 'shotgun', name: 'Shotgun', slot: 3, damage: 9, pellets: 5, rate: 0.7, speed: 820, cost: 1500, needRank: 3 },
];

/** Radio stations: WebAudio step-sequencer patterns (semitone offsets from a root). */
export const RADIO = [
  { name: 'SOL FM 101', desc: 'sunset synth', root: 220, bpm: 96, notes: [0, 0, 7, 10, 12, 10, 7, 3], wave: 'triangle' },
  { name: 'BASSLINE 98', desc: 'night drive bass', root: 110, bpm: 122, notes: [0, 0, 0, 3, 0, 0, 5, 7], wave: 'sawtooth' },
  { name: 'TALK 540 AM', desc: 'island talk radio', root: 330, bpm: 70, notes: [0, 12, 0, 12, 7, 12, 0, 5], wave: 'square' },
];

export const SAVE_KEY = 'solmara.save.v1';

export const PALETTE = {
  backdrop: '#0d1117',
  hud: '#eef1f5',
  muted: '#9aa3b2',
  panel: '#171c26',
  panelEdge: '#2c3442',
  gold: '#f2c94c',
  red: '#e5534b',
  blue: '#4fc3f7',
  green: '#7fd08a',
  police: '#5b8def',
  heli: '#c9a227',
  minimapBg: 'rgba(13,17,23,0.82)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Entity caps, for weak laptops: nothing spawns past these. */
export const CAPS = {
  traffic: 10,
  police: 8,
  bullets: 48,
  particles: 120,
  rivals: 3,
};
