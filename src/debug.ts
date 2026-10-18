// Cascade — the debug and automation surface (specs/instrumentation.md).
//
// Every operation is a reading or a pose of the state, written in the shape of
// `update`. The game's own events — the deal, the turn, a move, a send home, and
// the pointer — run through exactly the code a player's gesture runs through.
// A call the game has nothing to act on throws rather than returning quietly.

import { drawLaunchVx } from "./cascade";
import {
  CASCADE_DEBUG_VERSION,
  DEAL_MODE,
  DEAL_MODE_LABEL,
  FOUNDATION_COUNT,
  RANK_MAX,
  RANK_MIN,
  SUITS,
  TABLEAU_COLUMNS,
  TURN_COUNT,
} from "./constants";
import type {
  CardSnapshot,
  CardState,
  CascadeDebugApi,
  CascadeSnapshot,
  PileKind,
  Screen,
  Suit,
} from "./game";
import { menuRects } from "./menus";
import {
  computeDropTarget,
  pointerDown,
  pointerMove,
  pointerUp,
} from "./pointer";
import {
  colorOf,
  deal,
  pileCards,
  sendHome,
  shrinkWasteSets,
  tryMove,
  turnStock,
  withPile,
} from "./rules";
import type { GameState, PaintLayer, PileRef, View } from "./types";

const SCREENS: readonly Screen[] = ["title", "howto", "playing", "won"];

/** The state the game opens on, and the one `reset` restores. */
export function initialState(paint: PaintLayer | undefined): GameState {
  return {
    screen: "title",
    menuIndex: 0,
    titleIndex: 0,
    stock: [],
    waste: [],
    wasteSets: [],
    foundations: Array.from({ length: FOUNDATION_COUNT }, () => []),
    tableau: Array.from({ length: TABLEAU_COLUMNS }, () => []),
    drag: null,
    dropTarget: null,
    pointer: { x: 0, y: 0, down: false },
    lastPress: null,
    autoFlip: true,
    winDetect: true,
    launching: true,
    trailPainting: true,
    launchClock: 0,
    launched: 0,
    flyers: [],
    cascadeDone: false,
    trailStamps: 0,
    nextId: 1,
    simTime: 0,
    muted: false,
    paint,
    launchCursor: 0,
  };
}

// ---- Argument checks --------------------------------------------------------

function fail(message: string): never {
  throw new Error(`Cascade debug: ${message}`);
}

function wholeNumber(value: number, name: string): number {
  if (!Number.isInteger(value))
    fail(`${name} must be a whole number, got ${value}`);
  return value;
}

function finite(value: number, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${name} must be a finite number, got ${String(value)}`);
  }
  return value;
}

function flag(value: boolean, name: string): boolean {
  if (typeof value !== "boolean") fail(`${name} must be a boolean`);
  return value;
}

function pileRef(pile: PileKind, index: number): PileRef {
  wholeNumber(index, "index");
  const count =
    pile === "stock" || pile === "waste"
      ? 1
      : pile === "foundation"
        ? FOUNDATION_COUNT
        : pile === "tableau"
          ? TABLEAU_COLUMNS
          : 0;
  if (count === 0) fail(`no pile is named ${String(pile)}`);
  if (index < 0 || index >= count) fail(`${pile} ${index} names no pile`);
  return { pile, index };
}

function suitOf(suit: Suit): Suit {
  if (!(SUITS as readonly string[]).includes(suit)) {
    fail(`no suit is named ${String(suit)}`);
  }
  return suit;
}

function rankOf(rank: number): number {
  wholeNumber(rank, "rank");
  if (rank < RANK_MIN || rank > RANK_MAX) fail(`rank ${rank} is out of range`);
  return rank;
}

// ---- Locating a card or a flyer ---------------------------------------------

/** Every pile on the table, with its reference. */
function piles(state: View): { ref: PileRef; cards: readonly CardState[] }[] {
  const all: { ref: PileRef; cards: readonly CardState[] }[] = [
    { ref: { pile: "stock", index: 0 }, cards: state.stock },
    { ref: { pile: "waste", index: 0 }, cards: state.waste },
  ];
  state.foundations.forEach((cards, index) =>
    all.push({ ref: { pile: "foundation", index }, cards }),
  );
  state.tableau.forEach((cards, index) =>
    all.push({ ref: { pile: "tableau", index }, cards }),
  );
  return all;
}

function findCard(
  state: View,
  id: number,
): { ref: PileRef; row: number } | null {
  for (const { ref, cards } of piles(state)) {
    const row = cards.findIndex((card) => card.id === id);
    if (row >= 0) return { ref, row };
  }
  return null;
}

function flyerIndex(state: View, id: number): number {
  const index = state.flyers.findIndex((flyer) => flyer.id === id);
  if (index < 0) fail(`no flyer carries id ${id}`);
  return index;
}

// ---- Snapshot ---------------------------------------------------------------

function cardSnapshot(card: CardState): CardSnapshot {
  return {
    id: card.id,
    suit: card.suit,
    rank: card.rank,
    color: colorOf(card.suit),
    faceUp: card.faceUp,
  };
}

function snapshotOf(state: View): CascadeSnapshot {
  const sets = state.wasteSets;
  return {
    version: CASCADE_DEBUG_VERSION,
    screen: state.screen,
    menuIndex: state.menuIndex,
    titleIndex: state.titleIndex,
    dealMode: DEAL_MODE,
    turnCount: TURN_COUNT,
    dealModeLabel: DEAL_MODE_LABEL,
    muted: state.muted,
    autoFlip: state.autoFlip,
    winDetect: state.winDetect,
    launching: state.launching,
    trailPainting: state.trailPainting,
    stock: state.stock.map(cardSnapshot),
    waste: state.waste.map(cardSnapshot),
    wasteSets: [...sets],
    wasteVisibleCount: sets.length > 0 ? sets[sets.length - 1] : 0,
    foundations: state.foundations.map((pile) => pile.map(cardSnapshot)),
    tableau: state.tableau.map((pile) => pile.map(cardSnapshot)),
    drag:
      state.drag === null
        ? null
        : {
            cards: state.drag.cards.map(cardSnapshot),
            fromPile: state.drag.fromPile,
            fromIndex: state.drag.fromIndex,
            x: state.drag.x,
            y: state.drag.y,
          },
    dropTarget:
      state.dropTarget === null
        ? null
        : { pile: state.dropTarget.pile, index: state.dropTarget.index },
    pointer: { ...state.pointer },
    lastPress: state.lastPress === null ? null : { ...state.lastPress },
    launchClock: state.launchClock,
    launched: state.launched,
    flyers: state.flyers.map((flyer) => ({ ...flyer })),
    cascadeDone: state.cascadeDone,
    trailStamps: state.trailStamps,
    simTime: state.simTime,
  };
}

// ---- The surface ------------------------------------------------------------

/** Builds the debug surface `initialize` returns beside the state. */
export function createDebugApi(): CascadeDebugApi {
  return {
    version: CASCADE_DEBUG_VERSION,

    reset(state) {
      const s = state as View;
      s.paint?.clear();
      return { ...initialState(s.paint), muted: s.muted };
    },

    snapshot: (state) => snapshotOf(state as View),

    reconcile(state) {
      const s = state as View;
      return { ...s, dropTarget: computeDropTarget(s) };
    },

    menuItemRect(state, index) {
      const rect = menuRects(state.screen)[index];
      return rect === undefined ? null : { ...rect };
    },

    setScreen(state, screen) {
      if (!SCREENS.includes(screen))
        fail(`no screen is named ${String(screen)}`);
      return { ...(state as View), screen };
    },

    setMenuIndex(state, index) {
      wholeNumber(index, "menu index");
      if (index < 0) fail(`menu index ${index} is negative`);
      return { ...(state as View), menuIndex: index };
    },

    setTitleIndex(state, index) {
      wholeNumber(index, "title index");
      if (index < 0 || index >= menuRects("title").length) {
        fail(`title index ${index} names no title item`);
      }
      return { ...(state as View), titleIndex: index };
    },

    addCard(state, pile, index, suit, rank, faceUp) {
      const s = state as View;
      const ref = pileRef(pile, index);
      const card: CardState = {
        id: s.nextId,
        suit: suitOf(suit),
        rank: rankOf(rank),
        faceUp: flag(faceUp, "faceUp"),
      };
      return {
        ...withPile(s, ref, [...pileCards(s, ref), card]),
        nextId: s.nextId + 1,
      };
    },

    removeCard(state, id) {
      const s = state as View;
      const found = findCard(s, id);
      if (found !== null) {
        const cards = pileCards(s, found.ref).filter((card) => card.id !== id);
        const next = withPile(s, found.ref, cards);
        return found.ref.pile === "waste"
          ? { ...next, wasteSets: shrinkWasteSets(next.wasteSets, 1) }
          : next;
      }
      const drag = s.drag;
      if (drag !== null && drag.cards.some((card) => card.id === id)) {
        const cards = drag.cards.filter((card) => card.id !== id);
        return cards.length === 0
          ? { ...s, drag: null, dropTarget: null }
          : { ...s, drag: { ...drag, cards } };
      }
      return fail(`no card carries id ${id}`);
    },

    setCardFaceUp(state, id, faceUp) {
      const s = state as View;
      flag(faceUp, "faceUp");
      const turn = (card: CardState): CardState =>
        card.id === id ? { ...card, faceUp } : card;
      const found = findCard(s, id);
      if (found !== null) {
        return withPile(s, found.ref, pileCards(s, found.ref).map(turn));
      }
      const drag = s.drag;
      if (drag !== null && drag.cards.some((card) => card.id === id)) {
        return { ...s, drag: { ...drag, cards: drag.cards.map(turn) } };
      }
      return fail(`no card carries id ${id}`);
    },

    clearPile(state, pile, index) {
      const s = state as View;
      const ref = pileRef(pile, index);
      const next = withPile(s, ref, []);
      return ref.pile === "waste" ? { ...next, wasteSets: [] } : next;
    },

    clearTable(state) {
      const s = state as View;
      return {
        ...s,
        stock: [],
        waste: [],
        wasteSets: [],
        foundations: s.foundations.map(() => []),
        tableau: s.tableau.map(() => []),
        drag: null,
        dropTarget: null,
      };
    },

    addWasteSet(state, count) {
      wholeNumber(count, "count");
      if (count < 0) fail(`count ${count} is negative`);
      return { ...(state as View), wasteSets: [...state.wasteSets, count] };
    },

    clearWasteSets: (state) => ({ ...(state as View), wasteSets: [] }),

    deal: (state) => deal(state as View),

    turnStock: (state) => turnStock(state as View).state,

    move(state, fromPile, fromIndex, fromRow, toPile, toIndex) {
      const s = state as View;
      const from = pileRef(fromPile, fromIndex);
      const to = pileRef(toPile, toIndex);
      wholeNumber(fromRow, "fromRow");
      const cards = pileCards(s, from);
      if (fromRow < 0 || fromRow >= cards.length) {
        fail(`${fromPile} ${fromIndex} holds no card at row ${fromRow}`);
      }
      const step = tryMove(s, from, fromRow, to);
      return step === null ? [{ ...s }, false] : [step.state, true];
    },

    autoMove(state, pile, index) {
      const s = state as View;
      const step = sendHome(s, pileRef(pile, index));
      return step === null ? [{ ...s }, false] : [step.state, true];
    },

    pointerDown: (state, x, y) =>
      pointerDown(state as View, finite(x, "x"), finite(y, "y")).state,
    pointerMove: (state, x, y) =>
      pointerMove(state as View, finite(x, "x"), finite(y, "y")).state,
    pointerUp: (state, x, y) =>
      pointerUp(state as View, finite(x, "x"), finite(y, "y")).state,

    setAutoFlip: (state, enabled) => ({
      ...(state as View),
      autoFlip: flag(enabled, "enabled"),
    }),
    setWinDetect: (state, enabled) => ({
      ...(state as View),
      winDetect: flag(enabled, "enabled"),
    }),
    setLaunching: (state, enabled) => ({
      ...(state as View),
      launching: flag(enabled, "enabled"),
    }),
    setTrailPainting: (state, enabled) => ({
      ...(state as View),
      trailPainting: flag(enabled, "enabled"),
    }),

    addFlyer(state, suit, rank, x, y, vx, vy) {
      const s = state as View;
      const flyer = {
        id: s.nextId,
        suit: suitOf(suit),
        rank: rankOf(rank),
        x: finite(x, "x"),
        y: finite(y, "y"),
        vx: finite(vx, "vx"),
        vy: finite(vy, "vy"),
      };
      return { ...s, flyers: [...s.flyers, flyer], nextId: s.nextId + 1 };
    },

    setFlyerPosition(state, id, x, y) {
      const s = state as View;
      const index = flyerIndex(s, id);
      finite(x, "x");
      finite(y, "y");
      return {
        ...s,
        flyers: s.flyers.map((f, i) => (i === index ? { ...f, x, y } : f)),
      };
    },

    setFlyerVelocity(state, id, vx, vy) {
      const s = state as View;
      const index = flyerIndex(s, id);
      finite(vx, "vx");
      finite(vy, "vy");
      return {
        ...s,
        flyers: s.flyers.map((f, i) => (i === index ? { ...f, vx, vy } : f)),
      };
    },

    removeFlyer(state, id) {
      const s = state as View;
      const index = flyerIndex(s, id);
      return { ...s, flyers: s.flyers.filter((_, i) => i !== index) };
    },

    clearFlyers: (state) => ({ ...(state as View), flyers: [] }),

    setLaunchClock: (state, seconds) => ({
      ...(state as View),
      launchClock: finite(seconds, "seconds"),
    }),

    clearTrail(state) {
      const s = state as View;
      s.paint?.clear();
      return { ...s, trailStamps: 0 };
    },

    drawLaunchVx: () => drawLaunchVx(),
  };
}
