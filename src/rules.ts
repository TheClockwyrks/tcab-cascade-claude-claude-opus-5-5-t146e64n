// Cascade — the rules over the thirteen piles.
//
// The deck and the deal (specs/deal.md), the stock and its waste
// (specs/stock.md), what a foundation and a column accept
// (specs/foundations.md, specs/tableau.md), and the win (specs/victory.md).
// Every function is a transition over the state: it reads the view it is handed
// and returns the next state, with the cues its event raised beside it.

import {
  CUES,
  type CueName,
  DECK_SIZE,
  FOUNDATION_COUNT,
  LAUNCH_INTERVAL,
  RANK_MAX,
  RANK_MIN,
  SUITS,
  TABLEAU_COLUMNS,
  TURN_COUNT,
} from "./constants";
import type { CardState, Suit } from "./game";
import type { GameState, PileRef, Step, View } from "./types";

/** The color a suit is drawn in. */
export function colorOf(suit: Suit): "red" | "black" {
  return suit === "hearts" || suit === "diamonds" ? "red" : "black";
}

/** Whether cards are in run order: each one rank lower and opposite in color. */
export function isRun(cards: readonly CardState[]): boolean {
  for (let i = 1; i < cards.length; i++) {
    const above = cards[i - 1];
    const below = cards[i];
    if (below.rank !== above.rank - 1) return false;
    if (colorOf(below.suit) === colorOf(above.suit)) return false;
  }
  return cards.length > 0;
}

/** Whether a column accepts a run, by specs/tableau.md. */
export function columnAccepts(
  column: readonly CardState[],
  run: readonly CardState[],
): boolean {
  if (!isRun(run) || !run.every((card) => card.faceUp)) return false;
  const lead = run[0];
  if (column.length === 0) return lead.rank === RANK_MAX;
  const lowest = column[column.length - 1];
  if (!lowest.faceUp) return false;
  return (
    lead.rank === lowest.rank - 1 && colorOf(lead.suit) !== colorOf(lowest.suit)
  );
}

/** Whether a foundation accepts a run, by specs/foundations.md. */
export function foundationAccepts(
  foundation: readonly CardState[],
  run: readonly CardState[],
): boolean {
  if (run.length !== 1 || !run[0].faceUp) return false;
  const card = run[0];
  if (foundation.length === 0) return card.rank === RANK_MIN;
  const top = foundation[foundation.length - 1];
  return card.suit === top.suit && card.rank === top.rank + 1;
}

/** Whether the pile named by `ref` accepts `run`. Stock and waste accept none. */
export function pileAccepts(
  state: View,
  ref: PileRef,
  run: readonly CardState[],
): boolean {
  if (ref.pile === "foundation") {
    return foundationAccepts(state.foundations[ref.index], run);
  }
  if (ref.pile === "tableau") {
    return columnAccepts(state.tableau[ref.index], run);
  }
  return false;
}

/** The foundation a card belongs on, or `-1` when none accepts it. */
export function homeFor(state: View, card: CardState): number {
  for (let i = 0; i < FOUNDATION_COUNT; i++) {
    if (foundationAccepts(state.foundations[i], [card])) return i;
  }
  return -1;
}

/** The cards a pile holds, bottom to top. */
export function pileCards(state: View, ref: PileRef): readonly CardState[] {
  switch (ref.pile) {
    case "stock":
      return state.stock;
    case "waste":
      return state.waste;
    case "foundation":
      return state.foundations[ref.index];
    case "tableau":
      return state.tableau[ref.index];
  }
}

/** The state with the pile named by `ref` holding exactly `cards`. */
export function withPile(
  state: View,
  ref: PileRef,
  cards: readonly CardState[],
): GameState {
  switch (ref.pile) {
    case "stock":
      return { ...state, stock: cards };
    case "waste":
      return { ...state, waste: cards };
    case "foundation":
      return {
        ...state,
        foundations: state.foundations.map((pile, i) =>
          i === ref.index ? cards : pile,
        ),
      };
    case "tableau":
      return {
        ...state,
        tableau: state.tableau.map((pile, i) =>
          i === ref.index ? cards : pile,
        ),
      };
  }
}

/** The waste's set memory with `count` cards taken off its newest sets. */
export function shrinkWasteSets(
  sets: readonly number[],
  count: number,
): readonly number[] {
  const next = [...sets];
  let left = count;
  while (left > 0 && next.length > 0) {
    const newest = next.length - 1;
    const taken = Math.min(left, next[newest]);
    next[newest] -= taken;
    left -= taken;
    if (next[newest] <= 0) next.pop();
  }
  return next;
}

/** A full deck, shuffled uniformly at random with Fisher–Yates. */
export function shuffledDeck(
  firstId: number,
  random: () => number = Math.random,
): CardState[] {
  const deck: CardState[] = [];
  for (const suit of SUITS) {
    for (let rank = RANK_MIN; rank <= RANK_MAX; rank++) {
      deck.push({ id: 0, suit, rank, faceUp: false });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.map((card, i) => ({ ...card, id: firstId + i }));
}

/**
 * Deals a fresh game from a shuffled deck, by specs/deal.md: seven columns of
 * one to seven cards with only the last of each face-up, the other twenty-four
 * face-down on the stock, and the waste, its set memory, and the foundations
 * empty. A deal also clears the painted layer and the cascade's launch count.
 */
export function deal(
  state: View,
  random: () => number = Math.random,
): GameState {
  const deck = shuffledDeck(state.nextId, random);
  const tableau: CardState[][] = [];
  let next = 0;
  for (let column = 0; column < TABLEAU_COLUMNS; column++) {
    const cards: CardState[] = [];
    for (let row = 0; row <= column; row++) {
      cards.push({ ...deck[next++], faceUp: row === column });
    }
    tableau.push(cards);
  }
  const stock = deck.slice(next);
  state.paint?.clear();
  return {
    ...state,
    stock,
    waste: [],
    wasteSets: [],
    foundations: Array.from({ length: FOUNDATION_COUNT }, () => []),
    tableau,
    launched: 0,
    launchCursor: 0,
    trailStamps: 0,
    nextId: state.nextId + DECK_SIZE,
  };
}

/**
 * Turns the stock, by specs/stock.md: up to `TURN_COUNT` cards move one at a
 * time onto the waste face-up as one new set, or, with the stock empty, the
 * waste returns to the stock face-down in reverse order and its memory empties.
 */
export function turnStock(state: View): Step {
  if (state.stock.length > 0) {
    const count = Math.min(TURN_COUNT, state.stock.length);
    const stock = state.stock.slice(0, state.stock.length - count);
    const turned = state.stock
      .slice(state.stock.length - count)
      .reverse()
      .map((card) => ({ ...card, faceUp: true }));
    return {
      state: {
        ...state,
        stock,
        waste: [...state.waste, ...turned],
        wasteSets: [...state.wasteSets, count],
      },
      cues: [CUES.turn],
    };
  }
  if (state.waste.length === 0) return { state: { ...state }, cues: [] };
  const stock = [...state.waste]
    .reverse()
    .map((card) => ({ ...card, faceUp: false }));
  return {
    state: { ...state, stock, waste: [], wasteSets: [] },
    cues: [CUES.recycle],
  };
}

/** The state entered when the board is won: the `won` screen, cascade primed. */
export function enterWin(state: View): GameState {
  return {
    ...state,
    screen: "won",
    drag: null,
    dropTarget: null,
    launchClock: LAUNCH_INTERVAL,
    launched: 0,
    launchCursor: 0,
    cascadeDone: false,
  };
}

/** Whether every foundation is complete, Ace to King. */
export function boardComplete(state: View): boolean {
  return state.foundations.every((pile) => pile.length === RANK_MAX);
}

/**
 * Lands a run that has already left its source onto a target, if the target
 * accepts it. Returns `null` when the target refuses, so the caller puts the
 * run back. An accepted landing settles the waste's set memory, turns a newly
 * exposed column card, and wins a completed board.
 */
export function land(
  state: View,
  run: readonly CardState[],
  from: PileRef,
  to: PileRef,
): Step | null {
  if (!pileAccepts(state, to, run)) return null;
  const cues: CueName[] = [];
  let next = withPile(state, to, [...pileCards(state, to), ...run]);
  if (from.pile === "waste") {
    next = { ...next, wasteSets: shrinkWasteSets(next.wasteSets, run.length) };
  }
  if (to.pile === "foundation") cues.push(CUES.home);
  if (from.pile === "tableau" && next.autoFlip) {
    const column = next.tableau[from.index];
    const lowest = column[column.length - 1];
    if (lowest !== undefined && !lowest.faceUp) {
      next = withPile(next, from, [
        ...column.slice(0, -1),
        { ...lowest, faceUp: true },
      ]);
      cues.push(CUES.flip);
    }
  }
  if (next.winDetect && boardComplete(next)) {
    next = enterWin(next);
    cues.push(CUES.win);
  }
  return { state: next, cues };
}

/**
 * The run a move out of `from` at `row` takes, or `null` when the source itself
 * refuses: the stock, a waste card other than its playable top card, a
 * foundation card other than its top card, or a face-down column card.
 */
function sourceRun(
  state: View,
  from: PileRef,
  row: number,
): readonly CardState[] | null {
  const cards = pileCards(state, from);
  switch (from.pile) {
    case "stock":
      return null;
    case "waste":
      if (state.wasteSets.length === 0 || row !== cards.length - 1) return null;
      return [cards[row]];
    case "foundation":
      return row === cards.length - 1 ? [cards[row]] : null;
    case "tableau":
      return cards[row].faceUp ? cards.slice(row) : null;
  }
}

/**
 * Attempts a move of the card at `row` of `from`, and every card after it, onto
 * `to`. Returns the step when the rules accept it, or `null` when they refuse,
 * in which case the board stays exactly as it was.
 */
export function tryMove(
  state: View,
  from: PileRef,
  row: number,
  to: PileRef,
): Step | null {
  if (from.pile === "foundation" && to.pile === "foundation") return null;
  const run = sourceRun(state, from, row);
  if (run === null) return null;
  const cards = pileCards(state, from);
  const lifted = withPile(state, from, cards.slice(0, row));
  return land(lifted, run, from, to);
}

/**
 * The card a pile offers to play: the waste's top card while its set memory
 * holds any, or a column's lowest card while it is face-up. Returns its row,
 * or `-1` when the pile offers none.
 */
export function playableRow(state: View, ref: PileRef): number {
  if (ref.pile === "waste") {
    return state.wasteSets.length > 0 && state.waste.length > 0
      ? state.waste.length - 1
      : -1;
  }
  if (ref.pile === "tableau") {
    const column = state.tableau[ref.index];
    const lowest = column[column.length - 1];
    return lowest?.faceUp ? column.length - 1 : -1;
  }
  return -1;
}

/** Sends a pile's playable card to the foundation it belongs on, if legal. */
export function sendHome(state: View, ref: PileRef): Step | null {
  const row = playableRow(state, ref);
  if (row < 0) return null;
  const card = pileCards(state, ref)[row];
  const home = homeFor(state, card);
  if (home < 0) return null;
  return tryMove(state, ref, row, { pile: "foundation", index: home });
}
