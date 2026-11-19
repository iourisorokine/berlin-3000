import level from '../assets/bg/level.json'

// Screen + world geometry, and every number that shapes how the game feels.
// Edit, save, and the dev server reloads the game.

/** Internal resolution: everything is drawn at this size, then scaled up with crisp pixels. */
export const VIEW_W = 384
export const VIEW_H = 216
export const FPS = 60

/** Length of level 1 in art pixels (set by the background images, about 6 screens). */
export const LEVEL_LEN: number = level.levelLen

/** Where the buildings meet the kerb. */
export const WALL_BASE_Y: number = level.wallBase
/** The queue barriers stand on this line; the queue waits behind it. */
export const BARRIER_Y = 146
/** The walkable band: feet can be anywhere between these two lines. */
export const GROUND_TOP = 152
export const GROUND_BOT = 208

// ---------- physics ----------
/** Pulled down this much per frame while airborne (art px / frame²). */
export const GRAVITY = 0.32
/** Jump take-off speed. */
export const JUMP_SPEED = 5.2
/** Ground friction: share of sliding speed kept each frame. */
export const FRICTION = 0.82

// ---------- players (health, speed and moves of each hero: heroes.ts) ----------
/** Frames during which a second/third attack press continues the combo. */
export const COMBO_WINDOW = 22
/** Frames an attack press is remembered while busy. */
export const INPUT_BUFFER = 8
/** Frames between two specials (6 s). */
export const SPECIAL_COOLDOWN = 360
/** Frames of invulnerability after getting up. */
export const GETUP_INVULN = 50

// ---------- combat ----------
/** Max depth difference for a hit to connect (art px). */
export const HIT_DEPTH = 9
/** Max height difference for a hit to connect. */
export const HIT_HEIGHT = 26
/** Frozen frames on a normal hit / a knockdown (hit-stop). */
export const HITSTOP = 4
export const HITSTOP_HEAVY = 8
/** Frames an enemy lies on the ground before getting up. */
export const DOWN_TIME = 46

// ---------- enemies ----------
/** How many enemies may attack the player at the same time; the rest wait around. */
export const MAX_ATTACKERS = 2
/** Chance a knocked-out enemy drops food or valuables (what each pickup does: Game.ts PICKUPS). */
export const DROP_CHANCE = 0.3
