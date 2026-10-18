// Cascade — the geometry of the table (specs/table.md).
//
// Every function here is a pure read of the state: where a pile sits, where each
// of its cards is drawn, which card a point lands on, and which pile a release
// resolves to. Nothing here draws, so the hit tests and the renderer agree by
// construction.

import {
  CARD_H,
  CARD_W,
  COLUMN_BOTTOM_LIMIT,
  COLUMN_X,
  FACE_DOWN_OFFSET,
  FACE_UP_OFFSET,
  FACE_UP_OFFSET_MIN,
  FOUNDATION_COUNT,
  FOUNDATION_X,
  STOCK_X,
  TABLEAU_COLUMNS,
  TABLEAU_Y,
  TOP_ROW_Y,
  TURN_COUNT,
  WASTE_FAN,
  WASTE_X,
} from "./constants";
import type { CardState } from "./game";
import type { PileRef, Rect, View } from "./types";

/** Whether a point lies inside a rectangle, edges included. */
export function contains(rect: Rect, x: number, y: number): boolean {
  return (
    x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
  );
}

function cardRect(x: number, y: number): Rect {
  return { x, y, w: CARD_W, h: CARD_H };
}

/**
 * The face-up offset a column is drawn with: `FACE_UP_OFFSET`, reduced
 * uniformly to the largest value that keeps the column's lowest card above
 * `COLUMN_BOTTOM_LIMIT`, and never below `FACE_UP_OFFSET_MIN`.
 */
export function faceUpOffset(column: readonly CardState[]): number {
  let down = 0;
  let up = 0;
  for (let i = 0; i < column.length - 1; i++) {
    if (column[i].faceUp) up++;
    else down++;
  }
  if (up === 0) return FACE_UP_OFFSET;
  const room =
    COLUMN_BOTTOM_LIMIT - CARD_H - TABLEAU_Y - down * FACE_DOWN_OFFSET;
  const fit = room / up;
  if (fit >= FACE_UP_OFFSET) return FACE_UP_OFFSET;
  return Math.max(FACE_UP_OFFSET_MIN, fit);
}

/** The top edge of every card in a column, from its first card down. */
export function columnYs(column: readonly CardState[]): number[] {
  const upOffset = faceUpOffset(column);
  const ys: number[] = [];
  let y = TABLEAU_Y;
  for (const card of column) {
    ys.push(y);
    y += card.faceUp ? upOffset : FACE_DOWN_OFFSET;
  }
  return ys;
}

/**
 * How many cards the waste fans: the cards of its newest set, at most
 * `TURN_COUNT` of them, less any of that set held in hand.
 */
export function wasteShown(state: View): number {
  const sets = state.wasteSets;
  if (sets.length === 0) return 0;
  const held = state.drag?.fromPile === "waste" ? state.drag.cards.length : 0;
  const newest = Math.max(0, sets[sets.length - 1] - held);
  return Math.min(newest, state.waste.length, TURN_COUNT);
}

/** The top-left of the `i`-th card the waste fans, counted from the oldest. */
export function wasteFanX(i: number): number {
  return WASTE_X + i * WASTE_FAN;
}

/** The anchor every card of a pile is laid out from. */
export function pileAnchor(ref: PileRef): { x: number; y: number } {
  switch (ref.pile) {
    case "stock":
      return { x: STOCK_X, y: TOP_ROW_Y };
    case "waste":
      return { x: WASTE_X, y: TOP_ROW_Y };
    case "foundation":
      return { x: FOUNDATION_X[ref.index], y: TOP_ROW_Y };
    case "tableau":
      return { x: COLUMN_X[ref.index], y: TABLEAU_Y };
  }
}

/** The top-left a card at `row` of a pile is drawn at, the pile as it stands. */
export function cardPosition(
  state: View,
  ref: PileRef,
  row: number,
): { x: number; y: number } {
  const anchor = pileAnchor(ref);
  if (ref.pile === "tableau") {
    return { x: anchor.x, y: columnYs(state.tableau[ref.index])[row] };
  }
  if (ref.pile === "waste") {
    const shown = wasteShown(state);
    const firstShown = state.waste.length - shown;
    return row >= firstShown && shown > 0
      ? { x: wasteFanX(row - firstShown), y: anchor.y }
      : anchor;
  }
  return anchor;
}

/** The rectangle a pile answers a release in. */
export function dropRect(state: View, ref: PileRef): Rect {
  const anchor = pileAnchor(ref);
  if (ref.pile !== "tableau") return cardRect(anchor.x, anchor.y);
  const column = state.tableau[ref.index];
  if (column.length === 0) return cardRect(anchor.x, anchor.y);
  const ys = columnYs(column);
  const bottom = ys[ys.length - 1] + CARD_H;
  return { x: anchor.x, y: TABLEAU_Y, w: CARD_W, h: bottom - TABLEAU_Y };
}

/** Every one of the thirteen piles, in a fixed order. */
export function allPiles(): PileRef[] {
  const refs: PileRef[] = [
    { pile: "stock", index: 0 },
    { pile: "waste", index: 0 },
  ];
  for (let i = 0; i < FOUNDATION_COUNT; i++) {
    refs.push({ pile: "foundation", index: i });
  }
  for (let i = 0; i < TABLEAU_COLUMNS; i++) {
    refs.push({ pile: "tableau", index: i });
  }
  return refs;
}

/** The pile whose drop rectangle contains a point, or `null` for none. */
export function pileAt(state: View, x: number, y: number): PileRef | null {
  for (const ref of allPiles()) {
    if (contains(dropRect(state, ref), x, y)) return ref;
  }
  return null;
}

/** The card a press lands on: the pile it sits in and its row there. */
export interface CardHit {
  readonly ref: PileRef;
  readonly row: number;
}

/**
 * The card drawn over every other card at a point, or `null` when the point
 * lies on no card. A waste card other than the top card, and a waste whose set
 * memory is empty, are reported as no card, because neither offers one to play.
 */
export function cardAt(state: View, x: number, y: number): CardHit | null {
  for (let i = 0; i < TABLEAU_COLUMNS; i++) {
    const column = state.tableau[i];
    const ys = columnYs(column);
    for (let row = column.length - 1; row >= 0; row--) {
      if (contains(cardRect(COLUMN_X[i], ys[row]), x, y)) {
        return { ref: { pile: "tableau", index: i }, row };
      }
    }
  }
  for (let i = 0; i < FOUNDATION_COUNT; i++) {
    const pile = state.foundations[i];
    if (
      pile.length > 0 &&
      contains(cardRect(FOUNDATION_X[i], TOP_ROW_Y), x, y)
    ) {
      return { ref: { pile: "foundation", index: i }, row: pile.length - 1 };
    }
  }
  if (state.stock.length > 0 && contains(cardRect(STOCK_X, TOP_ROW_Y), x, y)) {
    return { ref: { pile: "stock", index: 0 }, row: state.stock.length - 1 };
  }
  const shown = wasteShown(state);
  if (shown > 0) {
    const top = state.waste.length - 1;
    if (contains(cardRect(wasteFanX(shown - 1), TOP_ROW_Y), x, y)) {
      return { ref: { pile: "waste", index: 0 }, row: top };
    }
  }
  return null;
}
