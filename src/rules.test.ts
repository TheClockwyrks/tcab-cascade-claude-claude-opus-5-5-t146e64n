import { describe, expect, it } from "vitest";
import { DECK_SIZE, LAUNCH_INTERVAL, SUITS } from "./constants";
import { initialState } from "./debug";
import type { CardState, Suit } from "./game";
import {
  colorOf,
  columnAccepts,
  deal,
  foundationAccepts,
  homeFor,
  isRun,
  sendHome,
  shrinkWasteSets,
  shuffledDeck,
  tryMove,
  turnStock,
} from "./rules";
import type { GameState } from "./types";

let nextId = 1000;
function card(suit: Suit, rank: number, faceUp = true): CardState {
  return { id: nextId++, suit, rank, faceUp };
}

function blank(): GameState {
  return initialState(undefined);
}

function fullFoundation(suit: Suit, upTo = 13): CardState[] {
  return Array.from({ length: upTo }, (_, i) => card(suit, i + 1));
}

describe("colors and runs", () => {
  it("reads red from hearts and diamonds, black from spades and clubs", () => {
    expect(colorOf("hearts")).toBe("red");
    expect(colorOf("diamonds")).toBe("red");
    expect(colorOf("spades")).toBe("black");
    expect(colorOf("clubs")).toBe("black");
  });

  it("accepts descending alternating runs and refuses the rest", () => {
    expect(isRun([card("spades", 9)])).toBe(true);
    expect(isRun([card("spades", 9), card("hearts", 8)])).toBe(true);
    expect(isRun([card("spades", 9), card("clubs", 8)])).toBe(false);
    expect(isRun([card("spades", 9), card("hearts", 7)])).toBe(false);
    expect(isRun([])).toBe(false);
  });
});

describe("what a column accepts", () => {
  it("takes only a King-led run when empty", () => {
    expect(columnAccepts([], [card("hearts", 13)])).toBe(true);
    expect(columnAccepts([], [card("hearts", 12)])).toBe(false);
  });

  it("takes one rank lower in the other color on a face-up card", () => {
    const column = [card("spades", 8)];
    expect(columnAccepts(column, [card("hearts", 7)])).toBe(true);
    expect(columnAccepts(column, [card("diamonds", 7), card("clubs", 6)])).toBe(
      true,
    );
    expect(columnAccepts(column, [card("clubs", 7)])).toBe(false);
    expect(columnAccepts(column, [card("hearts", 6)])).toBe(false);
  });

  it("takes nothing on a face-down card or out of run order", () => {
    expect(columnAccepts([card("spades", 8, false)], [card("hearts", 7)])).toBe(
      false,
    );
    expect(
      columnAccepts(
        [card("spades", 8)],
        [card("hearts", 7), card("hearts", 6)],
      ),
    ).toBe(false);
  });
});

describe("what a foundation accepts", () => {
  it("starts with any Ace and builds up in suit", () => {
    expect(foundationAccepts([], [card("clubs", 1)])).toBe(true);
    expect(foundationAccepts([], [card("clubs", 2)])).toBe(false);
    const pile = [card("clubs", 1)];
    expect(foundationAccepts(pile, [card("clubs", 2)])).toBe(true);
    expect(foundationAccepts(pile, [card("spades", 2)])).toBe(false);
    expect(foundationAccepts(pile, [card("clubs", 3)])).toBe(false);
  });

  it("refuses a run of two even when its lead alone would go", () => {
    expect(foundationAccepts([], [card("clubs", 1), card("hearts", 13)])).toBe(
      false,
    );
  });

  it("takes nothing on a King", () => {
    const pile = fullFoundation("hearts");
    expect(foundationAccepts(pile, [card("hearts", 1)])).toBe(false);
  });

  it("names the one foundation a card belongs on", () => {
    const state: GameState = {
      ...blank(),
      foundations: [[], [card("hearts", 1)], [], []],
    };
    expect(homeFor(state, card("hearts", 2))).toBe(1);
    expect(homeFor(state, card("spades", 1))).toBe(0);
    expect(homeFor(state, card("spades", 2))).toBe(-1);
  });
});

describe("the deal", () => {
  it("shuffles every card of the deck exactly once", () => {
    const deck = shuffledDeck(1);
    expect(deck).toHaveLength(DECK_SIZE);
    const keys = new Set(deck.map((c) => `${c.suit}${c.rank}`));
    expect(keys.size).toBe(DECK_SIZE);
    expect(new Set(deck.map((c) => c.id)).size).toBe(DECK_SIZE);
    for (const suit of SUITS) {
      expect(deck.filter((c) => c.suit === suit)).toHaveLength(13);
    }
  });

  it("deals afresh each time", () => {
    const a = shuffledDeck(1).map((c) => `${c.suit}${c.rank}`);
    const b = shuffledDeck(1).map((c) => `${c.suit}${c.rank}`);
    expect(a).not.toEqual(b);
  });

  it("lays out seven columns with one face-up card each, and a stock of 24", () => {
    const state = deal(blank());
    expect(state.tableau.map((c) => c.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const column of state.tableau) {
      expect(column.filter((c) => c.faceUp)).toHaveLength(1);
      expect(column[column.length - 1].faceUp).toBe(true);
    }
    expect(state.stock).toHaveLength(24);
    expect(state.stock.every((c) => !c.faceUp)).toBe(true);
    expect(state.waste).toEqual([]);
    expect(state.wasteSets).toEqual([]);
    expect(state.foundations.every((f) => f.length === 0)).toBe(true);
    expect(state.nextId).toBe(1 + DECK_SIZE);
  });

  it("leaves the stock in the order the tableau left the deck", () => {
    const random = () => 0.42;
    const deck = shuffledDeck(1, random);
    const state = deal(blank(), random);
    expect(state.stock.map((c) => c.id)).toEqual(
      deck.slice(28).map((c) => c.id),
    );
  });
});

describe("turning the stock", () => {
  function withStock(cards: CardState[]): GameState {
    return { ...blank(), stock: cards.map((c) => ({ ...c, faceUp: false })) };
  }

  it("moves three cards face-up, the stock's top card deepest", () => {
    const cards = [
      card("clubs", 1),
      card("clubs", 2),
      card("clubs", 3),
      card("clubs", 4),
    ];
    const { state, cues } = turnStock(withStock(cards));
    expect(state.stock.map((c) => c.rank)).toEqual([1]);
    expect(state.waste.map((c) => c.rank)).toEqual([4, 3, 2]);
    expect(state.waste.every((c) => c.faceUp)).toBe(true);
    expect(state.wasteSets).toEqual([3]);
    expect(cues).toEqual(["turn"]);
  });

  it("moves all that remain when fewer than three are left", () => {
    const first = turnStock(
      withStock([
        card("clubs", 1),
        card("clubs", 2),
        card("clubs", 3),
        card("clubs", 4),
      ]),
    );
    const second = turnStock(first.state);
    expect(second.state.stock).toEqual([]);
    expect(second.state.wasteSets).toEqual([3, 1]);
    expect(second.state.waste.map((c) => c.rank)).toEqual([4, 3, 2, 1]);
  });

  it("recycles the waste face-down in reverse, and repeats the same pass", () => {
    const cards = [1, 2, 3, 4, 5].map((r) => card("hearts", r));
    let state: GameState = withStock(cards);
    const order: number[][] = [];
    for (let pass = 0; pass < 2; pass++) {
      state = turnStock(state).state;
      state = turnStock(state).state;
      order.push(state.waste.map((c) => c.id));
      const recycled = turnStock(state);
      expect(recycled.cues).toEqual(["recycle"]);
      state = recycled.state;
      expect(state.waste).toEqual([]);
      expect(state.wasteSets).toEqual([]);
      expect(state.stock.every((c) => !c.faceUp)).toBe(true);
      expect(state.stock.map((c) => c.id)).toEqual(cards.map((c) => c.id));
    }
    expect(order[0]).toEqual(order[1]);
  });

  it("does nothing with the stock and the waste both empty", () => {
    const { state, cues } = turnStock(blank());
    expect(state.stock).toEqual([]);
    expect(state.waste).toEqual([]);
    expect(cues).toEqual([]);
  });
});

describe("moves", () => {
  it("moves a run between columns and turns the newly exposed card", () => {
    const state: GameState = {
      ...blank(),
      tableau: [
        [card("clubs", 5, false), card("hearts", 9), card("spades", 8)],
        [card("clubs", 10)],
        [],
        [],
        [],
        [],
        [],
      ],
    };
    const step = tryMove(state, { pile: "tableau", index: 0 }, 1, {
      pile: "tableau",
      index: 1,
    });
    expect(step).not.toBeNull();
    expect(step?.state.tableau[1].map((c) => c.rank)).toEqual([10, 9, 8]);
    expect(step?.state.tableau[0]).toHaveLength(1);
    expect(step?.state.tableau[0][0].faceUp).toBe(true);
    expect(step?.cues).toEqual(["flip"]);
  });

  it("leaves the exposed card face-down with auto-flip off", () => {
    const state: GameState = {
      ...blank(),
      autoFlip: false,
      tableau: [
        [card("clubs", 5, false), card("hearts", 13)],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    };
    const step = tryMove(state, { pile: "tableau", index: 0 }, 1, {
      pile: "tableau",
      index: 1,
    });
    expect(step?.state.tableau[0][0].faceUp).toBe(false);
    expect(step?.cues).toEqual([]);
  });

  it("refuses a face-down card and an illegal target, changing nothing", () => {
    const state: GameState = {
      ...blank(),
      tableau: [
        [card("clubs", 5, false), card("hearts", 9)],
        [card("diamonds", 10)],
        [],
        [],
        [],
        [],
        [],
      ],
    };
    expect(
      tryMove(state, { pile: "tableau", index: 0 }, 0, {
        pile: "tableau",
        index: 2,
      }),
    ).toBeNull();
    expect(
      tryMove(state, { pile: "tableau", index: 0 }, 1, {
        pile: "tableau",
        index: 1,
      }),
    ).toBeNull();
    expect(
      tryMove(state, { pile: "tableau", index: 0 }, 1, {
        pile: "stock",
        index: 0,
      }),
    ).toBeNull();
    expect(
      tryMove(state, { pile: "tableau", index: 0 }, 1, {
        pile: "waste",
        index: 0,
      }),
    ).toBeNull();
  });

  it("plays only the waste's top card, settling its set memory", () => {
    const state: GameState = {
      ...blank(),
      waste: [card("hearts", 5), card("clubs", 1), card("spades", 1)],
      wasteSets: [1, 2],
    };
    const waste = { pile: "waste", index: 0 } as const;
    const home = { pile: "foundation", index: 0 } as const;
    expect(tryMove(state, waste, 1, home)).toBeNull();
    const first = tryMove(state, waste, 2, home);
    expect(first?.state.wasteSets).toEqual([1, 1]);
    expect(first?.cues).toEqual(["home"]);
    const second = tryMove(first!.state, waste, 1, {
      pile: "foundation",
      index: 1,
    });
    expect(second?.state.wasteSets).toEqual([1]);
    expect(second?.state.waste.map((c) => c.rank)).toEqual([5]);
  });

  it("refuses a waste card while the set memory is empty", () => {
    const state: GameState = { ...blank(), waste: [card("spades", 1)] };
    expect(sendHome(state, { pile: "waste", index: 0 })).toBeNull();
  });

  it("moves a foundation's top card back to a column, but not between foundations", () => {
    const state: GameState = {
      ...blank(),
      foundations: [fullFoundation("hearts", 7), [], [], []],
      tableau: [[card("spades", 8)], [], [], [], [], [], []],
    };
    const from = { pile: "foundation", index: 0 } as const;
    expect(
      tryMove(state, from, 6, { pile: "foundation", index: 1 }),
    ).toBeNull();
    expect(tryMove(state, from, 5, { pile: "tableau", index: 0 })).toBeNull();
    const step = tryMove(state, from, 6, { pile: "tableau", index: 0 });
    expect(step?.state.foundations[0]).toHaveLength(6);
    expect(step?.state.tableau[0].map((c) => c.rank)).toEqual([8, 7]);
  });

  it("sends a column's lowest face-up card home, and nothing from elsewhere", () => {
    const state: GameState = {
      ...blank(),
      tableau: [
        [card("clubs", 9, false), card("diamonds", 1)],
        [card("clubs", 1, false)],
        [],
        [],
        [],
        [],
        [],
      ],
    };
    const step = sendHome(state, { pile: "tableau", index: 0 });
    expect(step?.state.foundations[0].map((c) => c.rank)).toEqual([1]);
    expect(step?.cues).toEqual(["home", "flip"]);
    expect(sendHome(state, { pile: "tableau", index: 1 })).toBeNull();
    expect(sendHome(state, { pile: "tableau", index: 2 })).toBeNull();
    expect(sendHome(state, { pile: "foundation", index: 0 })).toBeNull();
    expect(sendHome(state, { pile: "stock", index: 0 })).toBeNull();
  });

  it("wins the moment the fifty-second card goes home", () => {
    const state: GameState = {
      ...blank(),
      screen: "playing",
      foundations: [
        fullFoundation("spades"),
        fullFoundation("hearts"),
        fullFoundation("diamonds"),
        fullFoundation("clubs", 12),
      ],
      tableau: [[card("clubs", 13)], [], [], [], [], [], []],
    };
    const step = sendHome(state, { pile: "tableau", index: 0 });
    expect(step?.state.screen).toBe("won");
    expect(step?.state.launchClock).toBe(LAUNCH_INTERVAL);
    expect(step?.state.launched).toBe(0);
    expect(step?.cues).toEqual(["home", "win"]);

    const undetected = sendHome(
      { ...state, winDetect: false },
      { pile: "tableau", index: 0 },
    );
    expect(undetected?.state.screen).toBe("playing");
  });

  it("takes cards off the newest sets first", () => {
    expect(shrinkWasteSets([2, 1], 1)).toEqual([2]);
    expect(shrinkWasteSets([2, 3], 1)).toEqual([2, 2]);
    expect(shrinkWasteSets([], 1)).toEqual([]);
  });
});
