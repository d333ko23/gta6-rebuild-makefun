// SOLMARA — Streets of the Sun: a 2D canvas open-world crime game for the make.fun
// gta6-01 bounty. One island city, six districts, drive and walk, eight story jobs each
// with a planning phase (crew + tools against a budget), the Solmara Police Department
// escalating from patrols to roadblocks to PIT units to the HAWK ONE helicopter, wanted
// stars, turf standing, respect ranks, a garage, street races, a radio and a minimap.
// The game is this directory's game/ folder, plain static files a desktop browser loads
// offline (game/index.html and its ES modules, no library and no network request), and
// the program hands it in. It copies game/ and screenshots/ from beside this file to
// /output and writes /output/dossier.json, the summary the judge reads, with the
// vendored make.fun library.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// --- SOLMARA pre-flight: the entry must be complete before the dossier is built. ---
// The game page, its entry module, the eight jobs' data and the four screenshots all
// have to be present, and every screenshot has to be inside the scorer's byte cap.
const REQUIRED_GAME_FILES = ['index.html', 'src/main.js', 'src/world.js', 'src/render.js', 'src/config.js', 'src/shots.js', 'src/input.js', 'src/audio.js', 'src/random.js'];
for (const file of REQUIRED_GAME_FILES) {
  if (!existsSync(join(here, 'game', file))) throw new Error(`SOLMARA: missing game file game/${file}`);
}
const shotFiles = readdirSync(join(here, 'screenshots')).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort();
if (shotFiles.length !== 4) throw new Error(`SOLMARA: expected 4 screenshots, found ${shotFiles.length}`);
for (const file of shotFiles) {
  const bytes = statSync(join(here, 'screenshots', file)).size;
  if (bytes > 262144) throw new Error(`SOLMARA: screenshots/${file} is ${bytes} bytes, over the 256 KiB cap`);
}
console.log(`SOLMARA: ${REQUIRED_GAME_FILES.length} game files, ${shotFiles.length} screenshots (${shotFiles.join(', ')})`);

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
