import { beforeEach, describe, expect, it } from "vitest";
import {
  CASCADE_DEBUG_VERSION,
  DEAL_MODE,
  DEAL_MODE_LABEL,
  HUD_Y,
  TURN_COUNT,
} from "./constants";
import { createDebugApi, initialState } from "./debug";
import type { CascadeDebugApi, CascadeState } from "./game";
import { createPaintLayer } from "./paint";

let debug: CascadeDebugApi;
let state: CascadeState;

beforeEach(() => {
  debug = createDebugApi();
  state = initialState(createPaintLayer());
});

const snap = () => debug.snapshot(state);

describe("the snapshot", () => {
  it("reports the opening state with every field present", () => {
    expect(snap()).toEqual({
      version: CASCADE_DEBUG_VERSION,
      screen: "title",
      menuIndex: 0,
      titleIndex: 0,
      dealMode: DEAL_MODE,
      turnCount: TURN_COUNT,
      dealModeLabel: DEAL_MODE_LABEL,
      muted: false,
      autoFlip: true,
      winDetect: true,
      launching: true,
      trailPainting: true,
      stock: [],
      waste: [],
      wasteSets: [],
      wasteVisibleCount: 0,
      foundations: [[], [], [], []],
      tableau: [[], [], [], [], [], [], []],
      drag: null,
      dropTarget: null,
      pointer: { x: 0, y: 0, down: false },
      lastPress: null,
      launchClock: 0,
      launched: 0,
      flyers: [],
      cascadeDone: false,
      trailStamps: 0,
      simTime: 0,
    });
    expect(debug.version).toBe(1);
  });

  it("reports a card's color from its suit", () => {
    state = debug.addCard(state, "tableau", 3, "diamonds", 12, true);
    state = debug.addCard(state, "tableau", 3, "clubs", 11, false);
    expect(snap().tableau[3]).toEqual([
      { id: 1, suit: "diamonds", rank: 12, color: "red", faceUp: true },
      { id: 2, suit: "clubs", rank: 11, color: "black", faceUp: false },
    ]);
  });
});

describe("posing cards", () => {
  it("appends a card with a fresh id, touching nothing else", () => {
    state = debug.addCard(state, "waste", 0, "hearts", 1, true);
    expect(snap().waste[0].id).toBe(1);
    expect(snap().wasteSets).toEqual([]);
    state = debug.addCard(state, "foundation", 2, "hearts", 2, true);
    expect(snap().foundations[2][0].id).toBe(2);
  });

  it("removes a card by id, taking a waste card off its newest set", () => {
    state = debug.addCard(state, "waste", 0, "hearts", 1, true);
    state = debug.addCard(state, "waste", 0, "hearts", 2, true);
    state = debug.addWasteSet(state, 1);
    state = debug.addWasteSet(state, 1);
    state = debug.removeCard(state, 2);
    expect(snap().waste.map((c) => c.rank)).toEqual([1]);
    expect(snap().wasteSets).toEqual([1]);
    expect(snap().wasteVisibleCount).toBe(1);
  });

  it("sets a card's face and clears piles", () => {
    state = debug.addCard(state, "tableau", 0, "spades", 5, false);
    state = debug.setCardFaceUp(state, 1, true);
    expect(snap().tableau[0][0].faceUp).toBe(true);
    state = debug.addCard(state, "waste", 0, "spades", 6, true);
    state = debug.addWasteSet(state, 1);
    state = debug.clearPile(state, "waste", 0);
    expect(snap().waste).toEqual([]);
    expect(snap().wasteSets).toEqual([]);
    expect(snap().tableau[0]).toHaveLength(1);
    state = debug.clearTable(state);
    expect(snap().tableau[0]).toEqual([]);
  });

  it("keeps the cards on the waste when its set memory is cleared", () => {
    state = debug.addCard(state, "waste", 0, "spades", 6, true);
    state = debug.addWasteSet(state, 1);
    state = debug.clearWasteSets(state);
    expect(snap().waste).toHaveLength(1);
    expect(snap().wasteVisibleCount).toBe(0);
  });

  it("clears the hand along with the table", () => {
    state = debug.setScreen(state, "playing");
    state = debug.addCard(state, "tableau", 0, "spades", 6, true);
    state = debug.pointerDown(state, 250, 200);
    expect(snap().drag).not.toBeNull();
    state = debug.clearPile(state, "tableau", 1);
    expect(snap().drag).not.toBeNull();
    state = debug.removeCard(state, 1);
    expect(snap().drag).toBeNull();
    state = debug.addCard(state, "tableau", 0, "spades", 6, true);
    state = { ...state, simTime: 1 };
    state = debug.pointerDown(state, 250, 200);
    state = debug.setCardFaceUp(state, 2, false);
    expect(snap().drag?.cards[0].faceUp).toBe(false);
    state = debug.clearTable(state);
    expect(snap().drag).toBeNull();
  });
});

describe("failing loudly", () => {
  it("throws on a pile, an id, or a number it cannot act on", () => {
    expect(() =>
      debug.addCard(state, "tableau", 7, "spades", 1, true),
    ).toThrow();
    expect(() =>
      debug.addCard(state, "foundation", -1, "spades", 1, true),
    ).toThrow();
    expect(() => debug.addCard(state, "stock", 1, "spades", 1, true)).toThrow();
    expect(() =>
      debug.addCard(state, "tableau", 0, "stars" as "spades", 1, true),
    ).toThrow();
    expect(() =>
      debug.addCard(state, "tableau", 0, "spades", 14, true),
    ).toThrow();
    expect(() =>
      debug.addCard(state, "tableau", 0, "spades", 1.5, true),
    ).toThrow();
    expect(() => debug.clearPile(state, "attic" as "stock", 0)).toThrow();
    expect(() => debug.removeCard(state, 99)).toThrow();
    expect(() => debug.setCardFaceUp(state, 99, true)).toThrow();
    expect(() => debug.addWasteSet(state, 1.5)).toThrow();
    expect(() => debug.addWasteSet(state, -1)).toThrow();
    expect(() => debug.removeFlyer(state, 99)).toThrow();
    expect(() => debug.setFlyerPosition(state, 99, 0, 0)).toThrow();
    expect(() => debug.setFlyerVelocity(state, 99, 0, 0)).toThrow();
    expect(() => debug.setScreen(state, "paused" as "title")).toThrow();
    expect(() => debug.setMenuIndex(state, 0.5)).toThrow();
    expect(() => debug.setMenuIndex(state, -1)).toThrow();
    expect(() => debug.setTitleIndex(state, 2)).toThrow();
    expect(() => debug.move(state, "tableau", 0, 0, "tableau", 1)).toThrow();
    expect(() => debug.pointerDown(state, Number.NaN, 0)).toThrow();
    expect(() => debug.setLaunchClock(state, Infinity)).toThrow();
    expect(() => debug.setAutoFlip(state, 1 as unknown as boolean)).toThrow();
  });
});

describe("the game's own events", () => {
  it("deals from any screen, changing no other field", () => {
    state = debug.setMenuIndex(state, 1);
    state = debug.deal(state);
    expect(snap().screen).toBe("title");
    expect(snap().menuIndex).toBe(1);
    expect(snap().stock).toHaveLength(24);
    expect(snap().launched).toBe(0);
  });

  it("turns the stock three at a time, and recycles", () => {
    state = debug.deal(state);
    for (let i = 0; i < 8; i++) state = debug.turnStock(state);
    expect(snap().wasteSets).toEqual([3, 3, 3, 3, 3, 3, 3, 3]);
    expect(snap().wasteVisibleCount).toBe(3);
    state = debug.turnStock(state);
    expect(snap().stock).toHaveLength(24);
    expect(snap().wasteSets).toEqual([]);
  });

  it("reports the rules' verdict on a move", () => {
    state = debug.addCard(state, "tableau", 0, "spades", 13, true);
    state = debug.addCard(state, "tableau", 1, "hearts", 12, true);
    const [refused, no] = debug.move(state, "tableau", 1, 0, "tableau", 2);
    expect(no).toBe(false);
    expect(debug.snapshot(refused).tableau).toEqual(snap().tableau);
    const [moved, yes] = debug.move(state, "tableau", 1, 0, "tableau", 0);
    expect(yes).toBe(true);
    expect(debug.snapshot(moved).tableau[0]).toHaveLength(2);
  });

  it("sends a playable card home and reports whether it went", () => {
    state = debug.addCard(state, "tableau", 0, "spades", 1, true);
    const [home, went] = debug.autoMove(state, "tableau", 0);
    expect(went).toBe(true);
    expect(debug.snapshot(home).foundations[0]).toHaveLength(1);
    const [, nothing] = debug.autoMove(home, "tableau", 0);
    expect(nothing).toBe(false);
  });
});

describe("screens, menus, and gates", () => {
  it("sets each field alone", () => {
    state = debug.setScreen(state, "howto");
    state = debug.setMenuIndex(state, 0);
    state = debug.setTitleIndex(state, 1);
    expect(snap()).toMatchObject({
      screen: "howto",
      menuIndex: 0,
      titleIndex: 1,
    });
    state = debug.setAutoFlip(state, false);
    state = debug.setWinDetect(state, false);
    state = debug.setLaunching(state, false);
    state = debug.setTrailPainting(state, false);
    expect(snap()).toMatchObject({
      autoFlip: false,
      winDetect: false,
      launching: false,
      trailPainting: false,
    });
  });

  it("reports each screen's control regions, and none on won", () => {
    expect(debug.menuItemRect(state, 0)).not.toBeNull();
    expect(debug.menuItemRect(state, 2)).toBeNull();
    state = debug.setScreen(state, "playing");
    const hud = debug.menuItemRect(state, 2);
    expect(hud?.y).toBeGreaterThanOrEqual(HUD_Y);
    state = debug.setScreen(state, "won");
    expect(debug.menuItemRect(state, 0)).toBeNull();
  });
});

describe("flyers and the trail", () => {
  it("poses, moves, and removes flyers by id", () => {
    state = debug.addFlyer(state, "hearts", 7, 10, 20, 30, 40);
    const id = snap().flyers[0].id;
    state = debug.setFlyerPosition(state, id, 50, 60);
    state = debug.setFlyerVelocity(state, id, -5, -6);
    expect(snap().flyers[0]).toEqual({
      id,
      suit: "hearts",
      rank: 7,
      x: 50,
      y: 60,
      vx: -5,
      vy: -6,
    });
    state = debug.removeFlyer(state, id);
    expect(snap().flyers).toEqual([]);
    state = debug.addFlyer(state, "hearts", 7, 10, 20, 30, 40);
    state = debug.clearFlyers(state);
    expect(snap().flyers).toEqual([]);
  });

  it("sets the launch clock and clears the trail", () => {
    state = debug.setLaunchClock(state, 0.1);
    expect(snap().launchClock).toBe(0.1);
    state = { ...state, trailStamps: 9 };
    state = debug.clearTrail(state);
    expect(snap().trailStamps).toBe(0);
  });
});

describe("reset and reconcile", () => {
  it("restores the title-screen values but keeps muting", () => {
    state = debug.deal(debug.setScreen(state, "playing"));
    state = debug.addFlyer(state, "hearts", 7, 10, 20, 30, 40);
    state = { ...debug.setAutoFlip(state, false), muted: true, simTime: 3 };
    state = debug.reset(state);
    const opening = debug.snapshot(initialState(undefined));
    expect(snap()).toEqual({ ...opening, muted: true });
  });

  it("brings the drop target into agreement after a pose", () => {
    state = debug.setScreen(state, "playing");
    state = debug.addCard(state, "tableau", 0, "hearts", 12, true);
    state = debug.pointerDown(state, 250, 200);
    state = debug.pointerMove(state, 380, 200);
    expect(snap().dropTarget).toBeNull();
    state = debug.addCard(state, "tableau", 1, "spades", 13, true);
    expect(snap().dropTarget).toBeNull();
    state = debug.reconcile(state);
    expect(snap().dropTarget).toEqual({ pile: "tableau", index: 1 });
    const again = debug.reconcile(state);
    expect(debug.snapshot(again)).toEqual(snap());
  });
});
