// Cascade — the pointer (specs/controls.md).
//
// A press, a move, and a release, each answered on its own as it arrives. The
// engine's samples and the debug surface's pointer operations both come here, so
// a posed press and a player's press are the same event to the game.

import {
  CARD_H,
  CARD_W,
  CUES,
  type CueName,
  DOUBLE_CLICK_SLOP,
  DOUBLE_CLICK_WINDOW,
  DRAG_THRESHOLD,
  STOCK_X,
  TOP_ROW_Y,
} from "./constants";
import type { DropTargetState, PressState } from "./game";
import { type CardHit, cardAt, cardPosition, contains, pileAt } from "./layout";
import {
  activate,
  menuItemAt,
  menuRects,
  returnDrag,
  startGame,
} from "./menus";
import {
  land,
  pileAccepts,
  pileCards,
  playableRow,
  sendHome,
  turnStock,
  withPile,
} from "./rules";
import type { GameState, Step, View } from "./types";

const STOCK_RECT = { x: STOCK_X, y: TOP_ROW_Y, w: CARD_W, h: CARD_H };

/**
 * The pile a release would land the held run on: the one whose drop rectangle
 * holds the leading card's center, provided it accepts the run.
 */
export function computeDropTarget(state: View): DropTargetState | null {
  const drag = state.drag;
  if (drag === null) return null;
  const ref = pileAt(state, drag.x + CARD_W / 2, drag.y + CARD_H / 2);
  if (ref === null) return null;
  if (ref.pile !== "foundation" && ref.pile !== "tableau") return null;
  if (!pileAccepts(state, ref, drag.cards)) return null;
  return { pile: ref.pile, index: ref.index };
}

/** Selects the control under a point, on a screen that shows a menu. */
function hover(state: GameState, x: number, y: number): GameState {
  if (state.screen === "won") return state;
  const index = menuItemAt(state.screen, x, y);
  return index >= 0 ? { ...state, menuIndex: index } : state;
}

/**
 * Whether a press is a double click: close enough in game time and in place to
 * the press before it, and on a playable card.
 */
function isDoubleClick(
  prev: PressState | null,
  state: View,
  hit: CardHit,
): boolean {
  const press = state.lastPress;
  if (prev === null || press === null) return false;
  if (press.at - prev.at > DOUBLE_CLICK_WINDOW) return false;
  if (Math.hypot(press.x - prev.x, press.y - prev.y) > DOUBLE_CLICK_SLOP) {
    return false;
  }
  return playableRow(state, hit.ref) === hit.row;
}

/** Lifts the run under a press into the hand, if the card there lifts one. */
function lift(state: GameState, hit: CardHit): Step {
  const { ref, row } = hit;
  const cards = pileCards(state, ref);
  const card = cards[row];
  if (ref.pile === "stock" || !card.faceUp) return { state, cues: [] };
  if (ref.pile !== "tableau" && row !== cards.length - 1) {
    return { state, cues: [] };
  }
  const position = cardPosition(state, ref, row);
  const lifted = withPile(state, ref, cards.slice(0, row));
  const next: GameState = {
    ...lifted,
    drag: {
      cards: cards.slice(row),
      fromPile: ref.pile,
      fromIndex: ref.index,
      x: position.x,
      y: position.y,
    },
  };
  return {
    state: { ...next, dropTarget: computeDropTarget(next) },
    cues: [CUES.lift],
  };
}

/** A press at a logical stage point. */
export function pointerDown(state: View, x: number, y: number): Step {
  const pressed: GameState = {
    ...state,
    pointer: { x, y, down: true },
    lastPress: { x, y, at: state.simTime },
  };
  if (state.screen === "won") return startGame(pressed);
  if (state.screen !== "playing")
    return { state: hover(pressed, x, y), cues: [] };

  const base = hover(returnDrag(pressed), x, y);
  const hit = cardAt(base, x, y);
  if (hit === null) return { state: base, cues: [] };
  if (isDoubleClick(state.lastPress, base, hit)) {
    return sendHome(base, hit.ref) ?? { state: base, cues: [] };
  }
  return lift(base, hit);
}

/** A move to a logical stage point. A held run travels as far as the pointer. */
export function pointerMove(state: View, x: number, y: number): Step {
  let next: GameState = {
    ...state,
    pointer: { x, y, down: state.pointer.down },
  };
  const drag = state.drag;
  if (drag !== null) {
    next = {
      ...next,
      drag: {
        ...drag,
        x: drag.x + (x - state.pointer.x),
        y: drag.y + (y - state.pointer.y),
      },
    };
    next = { ...next, dropTarget: computeDropTarget(next) };
  }
  return { state: hover(next, x, y), cues: [] };
}

/** Lands the held run where a drop resolves, or returns it to its pile. */
function drop(state: GameState): Step {
  const drag = state.drag;
  if (drag === null) return { state, cues: [] };
  const back = returnDrag(state);
  const ref = pileAt(state, drag.x + CARD_W / 2, drag.y + CARD_H / 2);
  const from = { pile: drag.fromPile, index: drag.fromIndex };
  const settled: GameState = { ...state, drag: null, dropTarget: null };
  const landed = ref === null ? null : land(settled, drag.cards, from, ref);
  if (landed === null) return { state: back, cues: [CUES.reject] };
  return { state: landed.state, cues: [CUES.drop, ...landed.cues] };
}

/** A release at a logical stage point, which ends the gesture its press began. */
export function pointerUp(state: View, x: number, y: number): Step {
  // The release carries a position of its own, so the held run follows it there
  // before the gesture resolves.
  const released: GameState = {
    ...pointerMove(state, x, y).state,
    pointer: { x, y, down: false },
  };
  // Only a release of a held pointer ends a gesture; a stray one moves nothing.
  const press = state.lastPress;
  if (press === null || !state.pointer.down) {
    return { state: returnDrag(released), cues: [] };
  }

  const cues: CueName[] = [];
  let next = released;
  const click = Math.hypot(x - press.x, y - press.y) <= DRAG_THRESHOLD;

  if (next.screen === "playing") {
    if (click) {
      next = returnDrag(next);
      if (contains(STOCK_RECT, press.x, press.y)) {
        const turned = turnStock(next);
        next = turned.state;
        cues.push(...turned.cues);
      }
    } else {
      const dropped = drop(next);
      next = dropped.state;
      cues.push(...dropped.cues);
    }
  }

  if (next.screen !== "won" && menuRects(next.screen).length > 0) {
    const pressedOn = menuItemAt(next.screen, press.x, press.y);
    const releasedOn = menuItemAt(next.screen, x, y);
    if (pressedOn >= 0 && pressedOn === releasedOn) {
      const activated = activate({ ...returnDrag(next), menuIndex: pressedOn });
      next = activated.state;
      cues.push(...activated.cues);
    }
  }
  return { state: next, cues };
}
