// Cascade — the game.
//
// This module declares the state the game is written against (specs/state.md)
// and the debug and automation surface (specs/instrumentation.md), and binds the
// three functions the engine drives. The rules, the pointer, the cascade, and the
// drawing live in their own modules beside this one.

import type {
  Game,
  InitApi,
  RenderApi,
  UpdateApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { CUE_SPECS } from "./audio";
import { stepCascade } from "./cascade";
import {
  type CueName,
  MENU_BACK,
  MENU_BINDINGS,
  MENU_CONFIRM,
  MENU_DOWN,
  MENU_UP,
} from "./constants";
import { createDebugApi, initialState } from "./debug";
import { registerDiagnostics } from "./diagnostics";
import { applyMenuKeys } from "./menus";
import { createPaintLayer } from "./paint";
import { pointerDown, pointerMove, pointerUp } from "./pointer";
import { renderState } from "./render";
import { prepareSprites } from "./sprites";
import type { GameState, Step, View } from "./types";

// ---- The state (specs/state.md) -------------------------------------------

export type Screen = "title" | "howto" | "playing" | "won";

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";

export type PileKind = "stock" | "waste" | "foundation" | "tableau";

export interface CardState {
  readonly id: number;
  readonly suit: Suit;
  readonly rank: number;
  readonly faceUp: boolean;
}

export interface DragState {
  readonly cards: readonly CardState[];
  readonly fromPile: "waste" | "foundation" | "tableau";
  readonly fromIndex: number;
  readonly x: number;
  readonly y: number;
}

export interface DropTargetState {
  readonly pile: "foundation" | "tableau";
  readonly index: number;
}

export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
}

export interface PressState {
  readonly x: number;
  readonly y: number;
  readonly at: number;
}

export interface FlyerState {
  readonly id: number;
  readonly suit: Suit;
  readonly rank: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}

export interface CascadeState {
  readonly screen: Screen;
  readonly menuIndex: number;
  readonly titleIndex: number;

  readonly stock: readonly CardState[];
  readonly waste: readonly CardState[];
  readonly wasteSets: readonly number[];
  readonly foundations: readonly (readonly CardState[])[];
  readonly tableau: readonly (readonly CardState[])[];

  readonly drag: DragState | null;
  readonly dropTarget: DropTargetState | null;
  readonly pointer: PointerState;
  readonly lastPress: PressState | null;

  readonly autoFlip: boolean;
  readonly winDetect: boolean;
  readonly launching: boolean;
  readonly trailPainting: boolean;

  readonly launchClock: number;
  readonly launched: number;
  readonly flyers: readonly FlyerState[];
  readonly cascadeDone: boolean;
  readonly trailStamps: number;

  readonly nextId: number;
  readonly simTime: number;
  readonly muted: boolean;
}

// ---- The debug surface (specs/instrumentation.md) --------------------------

/** A card as the snapshot reports it, its color read from its suit. */
export interface CardSnapshot {
  id: number;
  suit: Suit;
  rank: number;
  color: "red" | "black";
  faceUp: boolean;
}

/** What `snapshot` returns: the state as plain values. */
export interface CascadeSnapshot {
  version: number;
  screen: Screen;
  menuIndex: number;
  titleIndex: number;
  dealMode: string;
  turnCount: number;
  dealModeLabel: string;
  muted: boolean;

  autoFlip: boolean;
  winDetect: boolean;
  launching: boolean;
  trailPainting: boolean;

  stock: CardSnapshot[];
  waste: CardSnapshot[];
  wasteSets: number[];
  wasteVisibleCount: number;
  foundations: CardSnapshot[][];
  tableau: CardSnapshot[][];

  drag: null | {
    cards: CardSnapshot[];
    fromPile: "waste" | "foundation" | "tableau";
    fromIndex: number;
    x: number;
    y: number;
  };
  dropTarget: null | { pile: "foundation" | "tableau"; index: number };

  pointer: { x: number; y: number; down: boolean };
  lastPress: null | { x: number; y: number; at: number };

  launchClock: number;
  launched: number;
  flyers: {
    id: number;
    suit: Suit;
    rank: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
  }[];
  cascadeDone: boolean;
  trailStamps: number;

  simTime: number;
}

/** A control's hit region in logical units. */
export interface MenuItemRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type S = DeepReadonly<CascadeState>;

/**
 * The debug and automation surface. A pose takes the current state and returns
 * the next; a reading takes the state and returns what it read; `move` and
 * `autoMove` return the next state beside the rules' verdict.
 */
export interface CascadeDebugApi {
  readonly version: number;

  reset(state: S): CascadeState;
  snapshot(state: S): CascadeSnapshot;
  reconcile(state: S): CascadeState;
  menuItemRect(state: S, index: number): MenuItemRect | null;

  setScreen(state: S, screen: Screen): CascadeState;
  setMenuIndex(state: S, index: number): CascadeState;
  setTitleIndex(state: S, index: number): CascadeState;

  addCard(
    state: S,
    pile: PileKind,
    index: number,
    suit: Suit,
    rank: number,
    faceUp: boolean,
  ): CascadeState;
  removeCard(state: S, id: number): CascadeState;
  setCardFaceUp(state: S, id: number, faceUp: boolean): CascadeState;
  clearPile(state: S, pile: PileKind, index: number): CascadeState;
  clearTable(state: S): CascadeState;

  addWasteSet(state: S, count: number): CascadeState;
  clearWasteSets(state: S): CascadeState;

  deal(state: S): CascadeState;
  turnStock(state: S): CascadeState;
  move(
    state: S,
    fromPile: PileKind,
    fromIndex: number,
    fromRow: number,
    toPile: PileKind,
    toIndex: number,
  ): [CascadeState, boolean];
  autoMove(state: S, pile: PileKind, index: number): [CascadeState, boolean];

  pointerDown(state: S, x: number, y: number): CascadeState;
  pointerMove(state: S, x: number, y: number): CascadeState;
  pointerUp(state: S, x: number, y: number): CascadeState;

  setAutoFlip(state: S, enabled: boolean): CascadeState;
  setWinDetect(state: S, enabled: boolean): CascadeState;
  setLaunching(state: S, enabled: boolean): CascadeState;
  setTrailPainting(state: S, enabled: boolean): CascadeState;

  addFlyer(
    state: S,
    suit: Suit,
    rank: number,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ): CascadeState;
  setFlyerPosition(state: S, id: number, x: number, y: number): CascadeState;
  setFlyerVelocity(state: S, id: number, vx: number, vy: number): CascadeState;
  removeFlyer(state: S, id: number): CascadeState;
  clearFlyers(state: S): CascadeState;
  setLaunchClock(state: S, seconds: number): CascadeState;
  clearTrail(state: S): CascadeState;
  drawLaunchVx(state: S): number;
}

// ---- The game --------------------------------------------------------------

/**
 * The table background, a CSS color string: the felt's base color, which the
 * engine clears the canvas to so the letterbox bars match the table.
 */
export const BACKGROUND = "#0d3a32";

/** Folds one step into a running frame: its state, and its cues collected. */
function absorb(cues: Set<CueName>, step: Step): GameState {
  for (const cue of step.cues) cues.add(cue);
  return step.state;
}

/** Reads the four menu actions' edges, consuming every one of them. */
function readMenuKeys(api: UpdateApi) {
  const up = api.input.pressed(MENU_UP);
  const down = api.input.pressed(MENU_DOWN);
  const confirm = api.input.pressed(MENU_CONFIRM);
  const back = api.input.pressed(MENU_BACK);
  return { up, down, confirm, back };
}

/** The game this build's engine drives. */
export const game: Game<CascadeState, CascadeDebugApi> = {
  async initialize(
    api: InitApi<CascadeState>,
  ): Promise<[CascadeState, CascadeDebugApi]> {
    for (const [action, keys] of Object.entries(MENU_BINDINGS)) {
      api.input.register(action, { keys: [...keys] });
    }
    for (const [cue, spec] of Object.entries(CUE_SPECS)) {
      api.audio.define(cue, spec);
    }
    registerDiagnostics(api);
    await prepareSprites(api.viewport().scale);
    const state = initialState(createPaintLayer());
    return [state, createDebugApi()];
  },

  update(
    state: DeepReadonly<CascadeState>,
    api: UpdateApi,
    dt: number,
  ): CascadeState {
    const cues = new Set<CueName>();
    let next: GameState = {
      ...(state as View),
      simTime: state.simTime + dt,
    };

    for (const sample of api.input.pointerSamples()) {
      if (!sample.primary) continue;
      if (sample.type === "down") {
        next = absorb(cues, pointerDown(next, sample.x, sample.y));
      } else if (sample.type === "move") {
        next = absorb(cues, pointerMove(next, sample.x, sample.y));
      } else {
        next = absorb(cues, pointerUp(next, sample.x, sample.y));
      }
    }

    const keys = readMenuKeys(api);
    next = absorb(cues, applyMenuKeys(next, keys));
    next = absorb(cues, stepCascade(next, dt));

    // `muted` carries the bit the player last asked for; the runtime owns the
    // bit itself, so the request is handed over and the runtime's answer kept.
    if (next.muted !== api.audio.muted()) api.audio.setMuted(next.muted);
    next = { ...next, muted: api.audio.muted() };

    for (const cue of cues) api.audio.play(cue);
    return next;
  },

  render(state: DeepReadonly<CascadeState>, api: RenderApi): void {
    renderState(api.ctx, state as View);
  },
};
