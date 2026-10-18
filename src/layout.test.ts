import { describe, expect, it } from "vitest";
import {
  CARD_H,
  COLUMN_BOTTOM_LIMIT,
  FACE_UP_OFFSET,
  FACE_UP_OFFSET_MIN,
} from "./constants";
import { initialState } from "./debug";
import type { CardState } from "./game";
import {
  cardAt,
  cardPosition,
  columnYs,
  dropRect,
  faceUpOffset,
  pileAt,
  wasteShown,
} from "./layout";
import type { GameState } from "./types";

function cards(faces: boolean[]): CardState[] {
  return faces.map((faceUp, i) => ({
    id: i + 1,
    suit: "spades",
    rank: 13 - (i % 13),
    faceUp,
  }));
}

function blank(): GameState {
  return initialState(undefined);
}

describe("columns", () => {
  it("fans 24 under a face-down card and 34 under a face-up one", () => {
    expect(columnYs(cards([false, false, true, true]))).toEqual([
      180, 204, 228, 262,
    ]);
  });

  it("compresses a long column uniformly to fit above the limit", () => {
    const column = cards([false, false, false, ...Array(12).fill(true)]);
    const offset = faceUpOffset(column);
    expect(offset).toBeLessThan(FACE_UP_OFFSET);
    const ys = columnYs(column);
    expect(ys[ys.length - 1] + CARD_H).toBeCloseTo(COLUMN_BOTTOM_LIMIT, 6);
    expect(ys[1] - ys[0]).toBe(24);
  });

  it("never compresses below the minimum offset", () => {
    const column = cards([...Array(6).fill(false), ...Array(30).fill(true)]);
    expect(faceUpOffset(column)).toBe(FACE_UP_OFFSET_MIN);
  });

  it("returns to the full offset once the column is short again", () => {
    expect(faceUpOffset(cards([true, true, true]))).toBe(FACE_UP_OFFSET);
  });
});

describe("the waste fan", () => {
  it("shows the newest set, at most three, fanned at 26", () => {
    const state: GameState = {
      ...blank(),
      waste: cards([true, true, true, true, true]),
      wasteSets: [3, 2],
    };
    expect(wasteShown(state)).toBe(2);
    const waste = { pile: "waste", index: 0 } as const;
    expect(cardPosition(state, waste, 4)).toEqual({ x: 372, y: 24 });
    expect(cardPosition(state, waste, 3)).toEqual({ x: 346, y: 24 });
    expect(cardPosition(state, waste, 0)).toEqual({ x: 346, y: 24 });
  });

  it("shows nothing while its set memory is empty", () => {
    const state: GameState = { ...blank(), waste: cards([true]) };
    expect(wasteShown(state)).toBe(0);
    expect(cardAt(state, 360, 60)).toBeNull();
  });

  it("offers only its top card to a press", () => {
    const state: GameState = {
      ...blank(),
      waste: cards([true, true, true]),
      wasteSets: [3],
    };
    expect(cardAt(state, 350, 60)).toBeNull();
    expect(cardAt(state, 480, 60)).toEqual({
      ref: { pile: "waste", index: 0 },
      row: 2,
    });
  });
});

describe("drop rectangles and hits", () => {
  it("resolves the top row and the columns without overlap", () => {
    const state = blank();
    expect(pileAt(state, 250, 100)).toEqual({ pile: "stock", index: 0 });
    expect(pileAt(state, 400, 100)).toEqual({ pile: "waste", index: 0 });
    expect(pileAt(state, 480, 100)).toBeNull();
    expect(pileAt(state, 1000, 100)).toEqual({ pile: "foundation", index: 3 });
    expect(pileAt(state, 600, 300)).toEqual({ pile: "tableau", index: 3 });
    expect(pileAt(state, 600, 340)).toBeNull();
    expect(pileAt(state, 335, 250)).toBeNull();
  });

  it("runs a holding column's rectangle down to its lowest card", () => {
    const state: GameState = {
      ...blank(),
      tableau: [cards([false, true, true]), [], [], [], [], [], []],
    };
    expect(dropRect(state, { pile: "tableau", index: 0 })).toEqual({
      x: 224,
      y: 180,
      w: 100,
      h: 24 + 34 + CARD_H,
    });
    expect(pileAt(state, 250, 370)).toEqual({ pile: "tableau", index: 0 });
  });

  it("finds the lowest card under a point in a column", () => {
    const state: GameState = {
      ...blank(),
      tableau: [cards([false, true, true]), [], [], [], [], [], []],
    };
    expect(cardAt(state, 250, 190)).toEqual({
      ref: { pile: "tableau", index: 0 },
      row: 0,
    });
    expect(cardAt(state, 250, 215)).toEqual({
      ref: { pile: "tableau", index: 0 },
      row: 1,
    });
    expect(cardAt(state, 250, 300)).toEqual({
      ref: { pile: "tableau", index: 0 },
      row: 2,
    });
    expect(cardAt(state, 250, 600)).toBeNull();
  });
});
