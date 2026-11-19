# Berlin 3000

A side-scrolling beat 'em up set in the queue outside a Berlin techno club, inspired by
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
| C / Space (or K) | jump; X in the air = air attack; JULE can jump again in mid-air |
| tap left/right twice | run; X while running = dash attack, jump while running = long jump |
| V (or L) | special move (recharges over time, faster with every hit you land) |
| Esc / P | pause |
| M | mute |

Gamepad and on-screen touch controls also work.

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
| `src/game/heroes.ts` | JULE, KALLE and SHOVEL KING: health, speed, frames, combo, air attack, special |
| `src/game/enemy.ts` | enemy types and AI |
| `src/game/Game.ts` | waves, camera, hit resolution, scenes |
| `src/game/stage.ts` | the code-drawn placeholder level (sky, Fernsehturm, power plant, queue) |
| `src/game/sprites.ts` | atlas loading, colour variants, drawing |
| `src/game/audio.ts` | synthesised club kick through the wall and hit sounds |

## Hit reactions

No blood: hits throw off sweat drops, heavy hits knock something out of a pocket (glow stick,
phone, cash, wristband, vinyl, bottle: purely visual, it tumbles and blinks away) and every KO
ends in a burst of rave confetti. Code: `Effects.hitGag` and `Effects.confetti` in `effects.ts`.

## What is still placeholder

- 6 of the 11 enemies have sprites (TECHNO MONK, HARNESS BOY, RAVE QUEEN, MULLET, PUNK GIRL,
  SELFIE TOURIST). Still missing: AFTERHOUR GHOST, DJ WANNABE, PUNK, HIPSTER, STAG BRO.
- KALLE has no walk cycle yet (`hero_kalle_A.png`): his idle frames bob instead.
- Throwable items (beer bottle, vinyl, brick, extinguisher) are imported but not used yet.
