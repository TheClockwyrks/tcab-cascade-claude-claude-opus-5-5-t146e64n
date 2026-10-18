import { beforeEach, describe, expect, it } from "vitest";
import { advanceFlyer, drawLaunchVx, stepCascade } from "./cascade";
import {
  BOUNCE_DAMP,
  FLOOR_Y,
  FOUNDATION_X,
  GRAVITY,
  LAUNCH_INTERVAL,
  LAUNCH_VX_MAX,
  LAUNCH_VX_MIN,
  LAUNCH_VY,
  SUITS,
  TOP_ROW_Y,
} from "./constants";
import { createDebugApi, initialState } from "./debug";
import type { CascadeDebugApi, CascadeState, FlyerState } from "./game";
import type { GameState, PaintLayer, Stamp } from "./types";

let debug: CascadeDebugApi;
let state: CascadeState;
let stamps: Stamp[];

/** A painted layer that only counts what it is given. */
function countingLayer(): PaintLayer {
  return {
    stamp: (stamp) => stamps.push(stamp),
    clear: () => {
      stamps = [];
    },
    isEmpty: () => stamps.length === 0,
    draw: () => undefined,
  };
}

beforeEach(() => {
  stamps = [];
  debug = createDebugApi();
  state = initialState(countingLayer());
});

/** A won board: every foundation complete, Ace to King. */
function wonBoard(): CascadeState {
  let s = debug.setScreen(state, "playing");
  for (const [i, suit] of SUITS.entries()) {
    for (let rank = 1; rank <= 13; rank++) {
      s = debug.addCard(s, "foundation", i, suit, rank, true);
    }
  }
  return {
    ...s,
    screen: "won",
    launchClock: LAUNCH_INTERVAL,
    launched: 0,
    cascadeDone: false,
  };
}

function run(s: CascadeState, seconds: number, dt: number): CascadeState {
  let next = s as GameState;
  const frames = Math.round(seconds / dt);
  for (let i = 0; i < frames; i++) next = stepCascade(next, dt).state;
  return next;
}

describe("a flyer", () => {
  const flyer: FlyerState = {
    id: 1,
    suit: "hearts",
    rank: 5,
    x: 100,
    y: 100,
    vx: 200,
    vy: 0,
  };

  it("falls under gravity and drifts at its own speed", () => {
    const next = advanceFlyer(flyer, 0.1);
    expect(next.vy).toBeCloseTo(GRAVITY * 0.1);
    expect(next.x).toBeCloseTo(120);
    expect(next.y).toBeCloseTo(100 + GRAVITY * 0.1 * 0.1);
  });

  it("bounces off the floor, keeping BOUNCE_DAMP of its speed", () => {
    const next = advanceFlyer({ ...flyer, y: FLOOR_Y - 1, vy: 500 }, 0.01);
    expect(next.y).toBe(FLOOR_Y);
    expect(next.vy).toBeCloseTo(-(500 + GRAVITY * 0.01) * BOUNCE_DAMP);
    expect(next.vx).toBe(200);
  });

  it("does not bounce while it is rising", () => {
    const next = advanceFlyer({ ...flyer, y: FLOOR_Y + 5, vy: -900 }, 0.01);
    expect(next.vy).toBeCloseTo(-900 + GRAVITY * 0.01);
    expect(next.y).toBeCloseTo(FLOOR_Y + 5 + next.vy * 0.01);
  });
});

describe("the launch draw", () => {
  it("draws a magnitude in range with either sign", () => {
    const draws = Array.from({ length: 400 }, () => drawLaunchVx());
    for (const vx of draws) {
      expect(Math.abs(vx)).toBeGreaterThanOrEqual(LAUNCH_VX_MIN);
      expect(Math.abs(vx)).toBeLessThanOrEqual(LAUNCH_VX_MAX);
    }
    expect(draws.some((vx) => vx < 0)).toBe(true);
    expect(draws.some((vx) => vx > 0)).toBe(true);
  });

  it("is reachable from the debug surface without changing the state", () => {
    const before = debug.snapshot(state);
    expect(Math.abs(debug.drawLaunchVx(state))).toBeGreaterThanOrEqual(
      LAUNCH_VX_MIN,
    );
    expect(debug.snapshot(state)).toEqual(before);
  });
});

describe("the cascade", () => {
  it("launches its first card on its first frame, from foundation 0's King", () => {
    const step = stepCascade(wonBoard() as GameState, 1 / 60);
    expect(step.cues).toEqual(["launch"]);
    const s = debug.snapshot(step.state);
    expect(s.launched).toBe(1);
    expect(s.flyers).toHaveLength(1);
    expect(s.flyers[0]).toMatchObject({
      suit: "spades",
      rank: 13,
      x: FOUNDATION_X[0],
      y: TOP_ROW_Y,
      vy: LAUNCH_VY,
    });
    expect(s.foundations[0]).toHaveLength(12);
  });

  it("launches floor(t / interval) + 1 cards after t seconds", () => {
    const s = run(wonBoard(), 1, 1 / 100);
    expect(s.launched).toBe(Math.floor(1 / LAUNCH_INTERVAL) + 1);
  });

  it("cycles the foundations, each walking down from its King", () => {
    let s: GameState = { ...wonBoard(), launchClock: 0 };
    const order: string[] = [];
    for (let i = 0; i < 8; i++) {
      s = stepCascade(s, LAUNCH_INTERVAL).state;
      const flyer = s.flyers[s.flyers.length - 1];
      order.push(`${flyer.suit}${flyer.rank}`);
    }
    expect(order).toEqual([
      "spades13",
      "hearts13",
      "diamonds13",
      "clubs13",
      "spades12",
      "hearts12",
      "diamonds12",
      "clubs12",
    ]);
  });

  it("skips a foundation that has been emptied", () => {
    let s: CascadeState = debug.clearTable(state);
    s = debug.addCard(s, "foundation", 0, "spades", 1, true);
    for (let rank = 1; rank <= 3; rank++) {
      s = debug.addCard(s, "foundation", 1, "hearts", rank, true);
      s = debug.addCard(s, "foundation", 2, "clubs", rank, true);
    }
    s = { ...debug.setScreen(s, "won"), launchClock: 0 };
    const order: string[] = [];
    let g = s as GameState;
    for (let i = 0; i < 7; i++) {
      g = stepCascade(g, LAUNCH_INTERVAL).state;
      const flyer = g.flyers[g.flyers.length - 1];
      order.push(`${flyer.suit}${flyer.rank}`);
    }
    expect(order).toEqual([
      "spades1",
      "hearts3",
      "clubs3",
      "hearts2",
      "clubs2",
      "hearts1",
      "clubs1",
    ]);
  });

  it("runs to completion: all launched, none in flight, done", () => {
    const s = run(wonBoard(), 30, 1 / 30);
    expect(s.launched).toBe(52);
    expect(s.flyers).toHaveLength(0);
    expect(s.cascadeDone).toBe(true);
    expect(s.trailStamps).toBeGreaterThan(52);
    expect(stamps.length).toBe(s.trailStamps);
  });

  it("advances by the same distance however time is divided", () => {
    let one = debug.addFlyer(state, "clubs", 4, 300, 100, 150, 0);
    let many = one;
    one = stepCascade(one as GameState, 0.5).state;
    for (let i = 0; i < 30; i++)
      many = stepCascade(many as GameState, 0.5 / 30).state;
    expect(one.flyers[0].x).toBeCloseTo(many.flyers[0].x, 6);
    expect(one.simTime).toBe(many.simTime);
  });

  it("stops launching with the gate off, while flyers keep flying", () => {
    let s = stepCascade(wonBoard() as GameState, 0.01).state;
    s = { ...s, launching: false };
    const x = s.flyers[0].x;
    s = run(s, 1, 0.05);
    expect(s.launched).toBe(1);
    expect(s.flyers[0].x).not.toBe(x);
  });

  it("stops painting with the gate off, while flyers keep flying", () => {
    let s = debug.addFlyer(state, "clubs", 4, 300, 100, 150, 0);
    s = debug.setTrailPainting(s, false);
    s = run(s, 0.5, 0.05);
    expect(s.trailStamps).toBe(0);
    expect(s.flyers[0].x).toBeGreaterThan(300);
  });

  it("retires a flyer past a side edge, and posed flyers never finish it", () => {
    let s = debug.setScreen(debug.clearTable(state), "won");
    s = debug.addFlyer(s, "clubs", 4, 1275, 100, 600, 0);
    s = run(s, 0.1, 0.05);
    expect(s.flyers).toHaveLength(0);
    expect(s.cascadeDone).toBe(false);
    expect(s.launched).toBe(0);
  });

  it("flies a posed flyer on any screen without launching", () => {
    let s = debug.addFlyer(
      debug.setScreen(state, "playing"),
      "clubs",
      4,
      300,
      100,
      0,
      0,
    );
    s = run(s, 0.2, 0.05);
    expect(s.flyers[0].y).toBeGreaterThan(100);
    expect(s.launched).toBe(0);
  });
});
