import { beforeEach, describe, expect, it } from "vitest";
import { createDebugApi, initialState } from "./debug";
import type { CascadeDebugApi, CascadeState, Suit } from "./game";
import { menuRects } from "./menus";
import { pointerDown, pointerUp } from "./pointer";
import type { GameState } from "./types";

let debug: CascadeDebugApi;
let state: CascadeState;

beforeEach(() => {
  debug = createDebugApi();
  state = debug.setScreen(initialState(undefined), "playing");
});

function add(
  pile: "stock" | "waste" | "foundation" | "tableau",
  index: number,
  suit: Suit,
  rank: number,
  faceUp = true,
): void {
  state = debug.addCard(state, pile, index, suit, rank, faceUp);
}

function snap() {
  return debug.snapshot(state);
}

describe("lifting and dropping", () => {
  beforeEach(() => {
    add("tableau", 0, "clubs", 4, false);
    add("tableau", 0, "hearts", 9);
    add("tableau", 0, "spades", 8);
    add("tableau", 1, "clubs", 10);
  });

  it("lifts a face-up card and every card below it on the press", () => {
    const step = pointerDown(state, 250, 215);
    expect(step.cues).toEqual(["lift"]);
    state = step.state;
    const s = snap();
    expect(s.drag?.cards.map((c) => c.rank)).toEqual([9, 8]);
    expect(s.drag?.x).toBe(224);
    expect(s.drag?.y).toBe(204);
    expect(s.tableau[0]).toHaveLength(1);
    expect(s.tableau[0][0].faceUp).toBe(false);
  });

  it("carries the run as far as the pointer travels and highlights the target", () => {
    state = debug.pointerDown(state, 250, 215);
    state = debug.pointerMove(state, 380, 260);
    const s = snap();
    expect(s.drag?.x).toBe(224 + 130);
    expect(s.drag?.y).toBe(204 + 45);
    expect(s.dropTarget).toEqual({ pile: "tableau", index: 1 });
  });

  it("lands an accepted drop and turns the exposed card", () => {
    state = debug.pointerDown(state, 250, 215);
    state = debug.pointerMove(state, 380, 260);
    const step = pointerUp(state, 380, 260);
    expect(step.cues).toEqual(["drop", "flip"]);
    state = step.state;
    const s = snap();
    expect(s.drag).toBeNull();
    expect(s.tableau[1].map((c) => c.rank)).toEqual([10, 9, 8]);
    expect(s.tableau[0][0].faceUp).toBe(true);
  });

  it("returns a refused drop, leaving the card beneath face-down", () => {
    const before = snap();
    state = debug.pointerDown(state, 250, 215);
    state = debug.pointerMove(state, 700, 500);
    expect(snap().dropTarget).toBeNull();
    const step = pointerUp(state, 700, 500);
    expect(step.cues).toEqual(["reject"]);
    state = step.state;
    expect(snap().tableau).toEqual(before.tableau);
  });

  it("returns the run on a click, with no cue", () => {
    const before = snap();
    state = debug.pointerDown(state, 250, 215);
    const step = pointerUp(state, 253, 218);
    expect(step.cues).toEqual([]);
    state = step.state;
    expect(snap().tableau).toEqual(before.tableau);
  });

  it("answers a press and its release on the same frame", () => {
    state = debug.pointerDown(state, 250, 215);
    state = debug.pointerUp(state, 380, 260);
    expect(snap().tableau[1]).toHaveLength(3);
  });

  it("lifts nothing from a face-down card or bare felt", () => {
    expect(pointerDown(state, 250, 190).cues).toEqual([]);
    expect(debug.snapshot(debug.pointerDown(state, 250, 190)).drag).toBeNull();
    expect(debug.snapshot(debug.pointerDown(state, 640, 600)).drag).toBeNull();
  });
});

describe("the stock and the waste under the pointer", () => {
  beforeEach(() => {
    for (let rank = 1; rank <= 5; rank++)
      add("stock", 0, "hearts", rank, false);
  });

  it("turns the stock on a click and not on a drag", () => {
    state = debug.pointerDown(state, 270, 90);
    const click = pointerUp(state, 272, 92);
    expect(click.cues).toEqual(["turn"]);
    state = click.state;
    expect(snap().wasteSets).toEqual([3]);
    state = debug.pointerDown(state, 270, 90);
    state = debug.pointerUp(state, 300, 300);
    expect(snap().wasteSets).toEqual([3]);
  });

  it("turns nothing on a release with no press in progress", () => {
    state = debug.pointerDown(state, 270, 90);
    state = debug.pointerUp(state, 270, 90);
    state = debug.pointerUp(state, 270, 90);
    expect(snap().wasteSets).toEqual([3]);
  });

  it("lifts the waste's top card alone and keeps the set memory while held", () => {
    state = debug.turnStock(state);
    const topX = 346 + 2 * 26 + 50;
    state = debug.pointerDown(state, topX, 90);
    expect(snap().drag?.cards.map((c) => c.rank)).toEqual([3]);
    expect(snap().wasteSets).toEqual([3]);
    state = debug.pointerUp(state, topX, 90);
    expect(snap().waste.map((c) => c.rank)).toEqual([5, 4, 3]);
    expect(snap().wasteSets).toEqual([3]);
  });

  it("lifts nothing from a waste card under the top card", () => {
    state = debug.turnStock(state);
    state = debug.pointerDown(state, 355, 90);
    expect(snap().drag).toBeNull();
  });
});

describe("the double click", () => {
  beforeEach(() => {
    add("tableau", 2, "clubs", 6, false);
    add("tableau", 2, "spades", 1);
  });

  it("sends a playable card home on the second press", () => {
    state = debug.pointerDown(state, 500, 230);
    state = debug.pointerUp(state, 500, 230);
    const step = pointerDown(state, 505, 232);
    expect(step.cues).toEqual(["home", "flip"]);
    state = step.state;
    expect(snap().foundations[0].map((c) => c.rank)).toEqual([1]);
    expect(snap().drag).toBeNull();
    state = debug.pointerUp(state, 505, 232);
    expect(snap().foundations[0]).toHaveLength(1);
  });

  it("is no double click outside the window", () => {
    state = debug.pointerDown(state, 500, 230);
    state = debug.pointerUp(state, 500, 230);
    state = { ...state, simTime: state.simTime + 0.31 };
    state = debug.pointerDown(state, 500, 230);
    expect(snap().drag).not.toBeNull();
    expect(snap().foundations[0]).toHaveLength(0);
  });

  it("is no double click outside the slop", () => {
    state = debug.pointerDown(state, 500, 230);
    state = debug.pointerUp(state, 500, 230);
    state = debug.pointerDown(state, 500, 251);
    expect(snap().drag).not.toBeNull();
    expect(snap().foundations[0]).toHaveLength(0);
  });

  it("leaves a card the foundations refuse where it is", () => {
    state = debug.clearPile(state, "tableau", 2);
    add("tableau", 2, "spades", 5);
    state = debug.pointerDown(state, 500, 230);
    state = debug.pointerUp(state, 500, 230);
    state = debug.pointerDown(state, 500, 230);
    expect(snap().drag).toBeNull();
    expect(snap().tableau[2]).toHaveLength(1);
  });

  it("records every press for the next one to be measured against", () => {
    state = { ...state, simTime: 4 };
    state = debug.pointerDown(state, 12, 34);
    expect(snap().lastPress).toEqual({ x: 12, y: 34, at: 4 });
  });
});

describe("controls", () => {
  function center(screen: CascadeState["screen"], index: number) {
    const rect = menuRects(screen)[index];
    return [rect.x + rect.w / 2, rect.y + rect.h / 2] as const;
  }

  it("activates a control whose region holds both edges of a gesture", () => {
    const [x, y] = center("playing", 2);
    state = debug.pointerDown(state, x, y);
    expect(snap().menuIndex).toBe(2);
    state = debug.pointerUp(state, x, y);
    expect(snap().muted).toBe(true);
  });

  it("activates nothing when the two edges land in different regions", () => {
    const [x, y] = center("playing", 1);
    const [x2, y2] = center("playing", 2);
    state = debug.pointerDown(state, x, y);
    state = debug.pointerUp(state, x2, y2);
    expect(snap().screen).toBe("playing");
    expect(snap().muted).toBe(false);
  });

  it("selects the item a mouse moves onto", () => {
    const [x, y] = center("playing", 1);
    state = debug.pointerMove(state, x, y);
    expect(snap().menuIndex).toBe(1);
  });

  it("drives the title and the how-to screen", () => {
    state = debug.setScreen(state, "title");
    const [hx, hy] = center("title", 1);
    state = debug.pointerDown(state, hx, hy);
    state = debug.pointerUp(state, hx, hy);
    expect(snap().screen).toBe("howto");
    expect(snap().titleIndex).toBe(1);
    const [bx, by] = center("howto", 0);
    state = debug.pointerDown(state, bx, by);
    state = debug.pointerUp(state, bx, by);
    expect(snap().screen).toBe("title");
    expect(snap().menuIndex).toBe(1);
    const [nx, ny] = center("title", 0);
    state = debug.pointerDown(state, nx, ny);
    state = debug.pointerUp(state, nx, ny);
    expect(snap().screen).toBe("playing");
    expect(snap().titleIndex).toBe(0);
    expect(snap().stock).toHaveLength(24);
  });

  it("deals a fresh game on any press on the won screen", () => {
    const won: GameState = { ...(debug.setScreen(state, "won") as GameState) };
    const step = pointerDown(won, 10, 10);
    expect(step.cues).toEqual(["deal"]);
    expect(step.state.screen).toBe("playing");
    expect(step.state.tableau[6]).toHaveLength(7);
  });
});
