# Berlin 3000

A side-scrolling beat 'em up through a Berlin weekend (the queue outside a techno club, the last U-Bahn, Sunday brunch in Prenzlauer Berg), inspired by
Marseille 3000. React + TypeScript + Canvas, built with Vite (same setup as Office Fighter).

## Run it

```bash
npm install
npm run dev            # http://localhost:5173
npm run build:single   # the whole game as one HTML file in dist-single/
```

## Deploy

Every push to `main` builds the game and publishes it to GitHub Pages
(`.github/workflows/deploy.yml`). One-time setup: repo **Settings → Pages → Source: GitHub Actions**.
The game is then live at https://iourisorokine.github.io/berlin-3000/

## Controls

| key | action |
| --- | --- |
| arrows / WASD | move (left/right and in depth) |
| X (or J) | hit; keep hitting for the combo (hits in a row raise the score multiplier) |
| C / Space (or K) | jump; X in the air = air attack; CRAZY NESS can jump again in mid-air |
| tap left/right twice | run; X while running = dash attack, jump while running = long jump |
| V (or L) | special move (recharges over time, faster with every hit you land) |
| Esc / P | pause menu: resume, restart the level, change fighter, main menu |
| M | mute |

Gamepad and on-screen touch controls also work.

## Detail and size

The game is drawn on a 384x216 art grid, on a canvas twice that size (`RES` in `src/game/constants.ts`). Fighters are imported with `"res": 2` in `tools/sprites.config.json`, so they carry twice the detail of the backgrounds and effects. `SIZE` scales every move's reach and the enemy spacing to match the fighters' height (`targetHeight` in the config).

## Adding ChatGPT sprites

1. Put the raw PNGs from ChatGPT in `raw-assets/` with the names from the asset prompt pack.
2. Describe each sheet in `tools/sprites.config.json`: grid size and what each cell is.
3. `pip install pillow numpy scipy`, then `npm run sprites`.
   It removes the magenta, keeps the main figure, scales it to the target height,
   snaps it to a real pixel grid with one palette per character, and writes
   `src/assets/sprites/<name>.png` + `.json` (frames and feet anchors).
4. Use the frame names in `src/game/heroes.ts` (heroes) or `src/game/enemy.ts` (enemies).

## Adding background images

Put `bg_skyline.png`, `stage_01_seg_a..d.png` and `stage_01_ground.png` in `raw-assets/`, then
`python3 tools/import_backgrounds.py`. It removes the magenta (only where it touches the image
border, so purple club light in windows stays), scales the buildings so doors are about
character height, lines them up on the kerb, widens the skyline seamlessly, and extracts the
club-light pixels into `glow.png` (pulsed on the kick drum). Output: `src/assets/bg/`.

## Where things are

| file | what |
| --- | --- |
| `src/game/constants.ts` | screen size, physics, combat feel (hit-stop, reach), enemy limits |
| `src/game/heroes.ts` | CRAZY NESS (id jule), SHOVELIST, GOTHILDE (ids `ravequeen`, and `queen` for the old enemy-sheet version), LOLLI, BAD BAD SCHWEIN, YO HIGHNESS (and the retired KALLE): health, speed, frames, combo, air attack, special, trait |
| `src/game/enemy.ts` | enemy types and AI (level 1 crowd, plus KONTROLLETTI, PROST PAULE, COUCH CREW, BUSKER DUO) |
| `src/game/levels.ts` | the levels: name, stage, randomised waves, props, loot, win/lose lines; unlock progress |
| `src/game/Game.ts` | wave flow, camera, hit resolution, enemy tricks, scenes (title, level select, fighter select, play) |
| `src/game/stage.ts` | the `Stage` interface and level 1, QUEUE TO BERGHAIN (skyline, club, queue, barriers) |
| `src/game/ubahn.ts` | level 2, LETZTE BAHN: the moving train, tunnel/station behind the windows, station stops |
| `src/game/prenzl.ts` | level 3, LATTE ART ATTACK: the Prenzlauer Berg street and the design cafe (a side room) |
| `src/game/map.ts` | the level-select map of Berlin: pins where the levels happen; uses the illustrated map (`python3 tools/import_map.py`) once `raw-assets/bg_map.png` exists |
| `src/game/props.ts` | breakable props of every level and what falls out of them |
| `src/game/sprites.ts` | atlas loading and drawing |
| `src/game/audio.ts` | synthesised club kick through the wall, the train, and every sound effect |

## Levels and waves

Each level in `src/game/levels.ts` lists its waves as rules, not fixed lists: where the camera stops,
how many enemies (a range), which kinds can come (a pool) and from where (screen edges, the queue,
the club door, a train door). Every run rolls them again, shifts some fights a little and rolls
optional surprise fights in or out. Levels open one by one once the previous one is beaten
(`UNLOCK_ALL` is on for now, so every level is open).

A level can have a side room (the cafe in Prenzlauer Berg): an optional fight behind a door in the
street, with its own floor, furniture and a reward. Prenzlauer Berg's art is built by
`python3 tools/import_prenzl.py`.

The U-Bahn's art is built by `python3 tools/import_ubahn.py`: the carriage segments with their
windows cut out, the door section closed and open, the tunnel and the station behind the windows.

## Hit reactions

No blood: hits throw off sweat drops, heavy hits knock something out of a pocket (glow stick,
phone, cash, wristband, vinyl, bottle: purely visual, it tumbles and blinks away) and every KO
ends in a burst of rave confetti. Code: `Effects.hitGag` and `Effects.confetti` in `effects.ts`.

## What is still placeholder

- 6 of the 11 enemies have sprites (TECHNO MONK, HARNESS BOY, RAVE QUEEN, MULLET, PUNK GIRL,
  SELFIE TOURIST). Still missing: AFTERHOUR GHOST, DJ WANNABE, PUNK, HIPSTER, STAG BRO.
- A new hero appears on the select screen once its art is imported (`hero_<id>_design.png`, `hero_<id>_A.png` … `_D.png` in `raw-assets`, then `python3 tools/import_sprites.py <id>`).
- RAVE QUEEN is built from her enemy sheets.
- Throwable items (beer bottle, vinyl, brick, extinguisher) are imported but not used yet.
