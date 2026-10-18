// Cascade — the internal vocabulary shared by every module of the game.
//
// `CascadeState` is declared in `src/game.ts`, exactly as `specs/state.md` fixes
// it. The build carries two values beside it, which every transition copies along
// with the rest of the state: the painted layer's drawing resources, and the
// cascade's place in its launch rotation. Both are optional in the type, so a
// state built by hand without them still reads; the code falls back where either
// is absent.

import type { DeepReadonly } from "ts-essentials";
import type { CueName } from "./constants";
import type { CascadeState, PileKind, Suit } from "./game";

/** One card stamped onto the painted layer, at its top-left. */
export interface Stamp {
  readonly suit: Suit;
  readonly rank: number;
  readonly x: number;
  readonly y: number;
}

/**
 * The persistent surface the victory cascade paints onto.
 *
 * This is a drawing resource rather than game state: `update` records each stamp
 * as it happens, and `render` rasterizes what it has recorded. Clearing it is
 * part of a new deal, a `reset`, and `clearTrail`.
 */
export interface PaintLayer {
  /** Record one stamp of a card in flight. */
  stamp(stamp: Stamp): void;
  /** Drop every stamp the layer holds. */
  clear(): void;
  /** Whether the layer holds no stamp at all. */
  isEmpty(): boolean;
  /** Draw the layer into `ctx`, rasterizing pending stamps as needed. */
  draw(ctx: CanvasRenderingContext2D, settle: boolean): void;
}

/** The declared state plus the two values the build carries beside it. */
export interface GameState extends CascadeState {
  /** The painted layer's drawing resources. */
  readonly paint?: PaintLayer;
  /** The foundation the next launch tries first, cycling 0 to 3. */
  readonly launchCursor?: number;
}

/** The read-only view every transition, reading, and draw is handed. */
export type View = DeepReadonly<GameState>;

/** A transition's result: the next state and the cues it raised. */
export interface Step {
  readonly state: GameState;
  readonly cues: readonly CueName[];
}

/** One pile, named the way the debug surface names it. */
export interface PileRef {
  readonly pile: PileKind;
  readonly index: number;
}

/** A rectangle in logical units, its top-left and its size. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
