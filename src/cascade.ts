// Cascade — the victory cascade (specs/victory.md).
//
// Every card in flight is advanced against the frame's delta, stamped onto the
// painted layer, and retired once it has left the stage by a side edge; then the
// launch clock runs and launches the next foundation's top card each time it
// fills. Nothing here counts frames, so an interval of game time reaches the same
// table however it was divided.

import {
  BOUNCE_DAMP,
  CARD_W,
  CUES,
  type CueName,
  FLOOR_Y,
  FOUNDATION_COUNT,
  FOUNDATION_X,
  GRAVITY,
  LAUNCH_INTERVAL,
  LAUNCH_VX_MAX,
  LAUNCH_VX_MIN,
  LAUNCH_VY,
  STAGE_W,
  TOP_ROW_Y,
} from "./constants";
import type { FlyerState } from "./game";
import type { GameState, PaintLayer, Step, View } from "./types";

/**
 * One launch's horizontal speed: a magnitude drawn uniformly from
 * `[LAUNCH_VX_MIN, LAUNCH_VX_MAX]`, with a sign chosen with equal probability.
 */
export function drawLaunchVx(random: () => number = Math.random): number {
  const magnitude = LAUNCH_VX_MIN + random() * (LAUNCH_VX_MAX - LAUNCH_VX_MIN);
  return random() < 0.5 ? -magnitude : magnitude;
}

/** Whether a flyer has left the stage by a side edge. */
function offStage(flyer: FlyerState): boolean {
  return flyer.x + CARD_W < 0 || flyer.x > STAGE_W;
}

/**
 * Advances one flyer by one frame: gravity, motion, and the floor bounce, which
 * keeps `BOUNCE_DAMP` of the vertical speed and leaves `vx` alone.
 */
export function advanceFlyer(flyer: FlyerState, dt: number): FlyerState {
  let vy = flyer.vy + GRAVITY * dt;
  const x = flyer.x + flyer.vx * dt;
  let y = flyer.y + vy * dt;
  if (y >= FLOOR_Y && vy > 0) {
    vy = -vy * BOUNCE_DAMP;
    y = FLOOR_Y;
  }
  return { ...flyer, x, y, vy };
}

/** Advances every flyer, stamping each one and retiring those off the stage. */
function fly(
  state: View,
  dt: number,
  paint: PaintLayer | undefined,
): GameState {
  const flyers: FlyerState[] = [];
  let stamps = 0;
  for (const flyer of state.flyers) {
    const moved = advanceFlyer(flyer, dt);
    if (state.trailPainting) {
      paint?.stamp(moved);
      stamps++;
    }
    if (!offStage(moved)) flyers.push(moved);
  }
  return { ...state, flyers, trailStamps: state.trailStamps + stamps };
}

/** The foundation the next launch takes from, cycling and skipping empties. */
function nextFoundation(state: View): number {
  const start = state.launchCursor ?? 0;
  for (let step = 0; step < FOUNDATION_COUNT; step++) {
    const index = (start + step) % FOUNDATION_COUNT;
    if (state.foundations[index].length > 0) return index;
  }
  return -1;
}

/** Launches the top card of the foundation whose turn it is. */
function launch(state: GameState, random: () => number): GameState {
  const index = nextFoundation(state);
  if (index < 0) return state;
  const pile = state.foundations[index];
  const card = pile[pile.length - 1];
  const flyer: FlyerState = {
    id: card.id,
    suit: card.suit,
    rank: card.rank,
    x: FOUNDATION_X[index],
    y: TOP_ROW_Y,
    vx: drawLaunchVx(random),
    vy: LAUNCH_VY,
  };
  return {
    ...state,
    foundations: state.foundations.map((p, i) =>
      i === index ? p.slice(0, -1) : p,
    ),
    flyers: [...state.flyers, flyer],
    launched: state.launched + 1,
    launchCursor: (index + 1) % FOUNDATION_COUNT,
  };
}

function foundationsEmpty(state: View): boolean {
  return state.foundations.every((pile) => pile.length === 0);
}

/**
 * One frame of the cascade. Flyers fly on any screen; the launch clock runs on
 * the `won` screen while `launching` is on; and the cascade is done once it has
 * launched every card on the foundations and none is left in flight.
 */
export function stepCascade(
  state: View,
  dt: number,
  random: () => number = Math.random,
): Step {
  let next = fly(state, dt, state.paint);
  const cues: CueName[] = [];
  if (next.screen !== "won") return { state: next, cues };

  if (next.launching) {
    let clock = next.launchClock + dt;
    while (clock >= LAUNCH_INTERVAL && !foundationsEmpty(next)) {
      clock -= LAUNCH_INTERVAL;
      next = launch(next, random);
      cues.push(CUES.launch);
    }
    next = { ...next, launchClock: clock };
  }
  if (
    !next.cascadeDone &&
    next.launched > 0 &&
    next.flyers.length === 0 &&
    foundationsEmpty(next)
  ) {
    next = { ...next, cascadeDone: true };
  }
  return { state: next, cues: cues.length > 0 ? [CUES.launch] : cues };
}
