// Cascade — the controls each screen carries and what activating one does
// (specs/controls.md, specs/screens.md).

import {
  CUES,
  type CueName,
  HOWTO_BACK_LABEL,
  HUD_H,
  HUD_ITEMS,
  HUD_Y,
  TITLE_ITEMS,
} from "./constants";
import type { Screen } from "./game";
import { contains } from "./layout";
import { deal } from "./rules";
import type { GameState, Rect, Step, View } from "./types";

const TITLE_ITEM_W = 320;
const TITLE_ITEM_H = 56;
const TITLE_ITEM_Y = 420;
const TITLE_ITEM_GAP = 18;

const HUD_ITEM_X = 224;
const HUD_ITEM_GAP = 12;
const HUD_ITEM_WIDTHS: readonly number[] = [150, 110, 130];
const HUD_ITEM_INSET = 3;

/** The hit regions of every control a screen carries, in menu order. */
export function menuRects(screen: Screen): readonly Rect[] {
  switch (screen) {
    case "title":
      return TITLE_ITEMS.map((_, i) => ({
        x: 640 - TITLE_ITEM_W / 2,
        y: TITLE_ITEM_Y + i * (TITLE_ITEM_H + TITLE_ITEM_GAP),
        w: TITLE_ITEM_W,
        h: TITLE_ITEM_H,
      }));
    case "howto":
      return [{ x: 540, y: 628, w: 200, h: 52 }];
    case "playing": {
      let x = HUD_ITEM_X;
      return HUD_ITEMS.map((_, i) => {
        const rect = {
          x,
          y: HUD_Y + HUD_ITEM_INSET,
          w: HUD_ITEM_WIDTHS[i],
          h: HUD_H - HUD_ITEM_INSET * 2,
        };
        x += HUD_ITEM_WIDTHS[i] + HUD_ITEM_GAP;
        return rect;
      });
    }
    case "won":
      return [];
  }
}

/** The labels of every control a screen carries, in menu order. */
export function menuLabels(screen: Screen): readonly string[] {
  switch (screen) {
    case "title":
      return TITLE_ITEMS;
    case "howto":
      return [HOWTO_BACK_LABEL];
    case "playing":
      return HUD_ITEMS;
    case "won":
      return [];
  }
}

/** The index of the control whose region holds a point, or `-1`. */
export function menuItemAt(screen: Screen, x: number, y: number): number {
  return menuRects(screen).findIndex((rect) => contains(rect, x, y));
}

/** Puts a held run back on the pile it was lifted from, face for face. */
export function returnDrag(state: View): GameState {
  const drag = state.drag;
  if (drag === null) return { ...state };
  const back = [...drag.cards];
  const next: GameState = { ...state, drag: null, dropTarget: null };
  switch (drag.fromPile) {
    case "waste":
      return { ...next, waste: [...state.waste, ...back] };
    case "foundation":
      return {
        ...next,
        foundations: state.foundations.map((pile, i) =>
          i === drag.fromIndex ? [...pile, ...back] : pile,
        ),
      };
    case "tableau":
      return {
        ...next,
        tableau: state.tableau.map((pile, i) =>
          i === drag.fromIndex ? [...pile, ...back] : pile,
        ),
      };
  }
}

/**
 * Deals a fresh game and puts it in play: the `playing` screen, the HUD's first
 * item selected, nothing in hand, and no cascade left running.
 */
export function startGame(state: View): Step {
  const dealt = deal({ ...state, drag: null, dropTarget: null });
  return {
    state: {
      ...dealt,
      screen: "playing",
      menuIndex: 0,
      flyers: [],
      launchClock: 0,
      cascadeDone: false,
    },
    cues: [CUES.deal],
  };
}

/** Returns to the title with the entry last activated there selected. */
function toTitle(state: View): GameState {
  return { ...returnDrag(state), screen: "title", menuIndex: state.titleIndex };
}

/**
 * Activates the item at `menuIndex` on the current screen, with the effect
 * specs/screens.md gives it.
 */
export function activate(state: View): Step {
  const none: CueName[] = [];
  const index = state.menuIndex;
  switch (state.screen) {
    case "title":
      if (index === 0) return startGame({ ...state, titleIndex: 0 });
      if (index === 1) {
        return {
          state: { ...state, titleIndex: 1, screen: "howto", menuIndex: 0 },
          cues: none,
        };
      }
      break;
    case "howto":
      return { state: toTitle(state), cues: none };
    case "playing":
      if (index === 0) return startGame(state);
      if (index === 1) return { state: toTitle(state), cues: none };
      if (index === 2)
        return { state: { ...state, muted: !state.muted }, cues: none };
      break;
    case "won":
      break;
  }
  return { state: { ...state }, cues: none };
}

/** The keyboard edges one frame carried, in the four actions' terms. */
export interface MenuKeys {
  readonly up: boolean;
  readonly down: boolean;
  readonly confirm: boolean;
  readonly back: boolean;
}

/**
 * Applies one frame's menu keys: up before down, and movement before confirm,
 * so a frame carrying several edges takes the first of them alone.
 */
export function applyMenuKeys(state: View, keys: MenuKeys): Step {
  const count = menuRects(state.screen).length;
  switch (state.screen) {
    case "title":
    case "playing":
      if (keys.up) {
        const menuIndex = (state.menuIndex - 1 + count) % count;
        return { state: { ...state, menuIndex }, cues: [] };
      }
      if (keys.down) {
        const menuIndex = (state.menuIndex + 1) % count;
        return { state: { ...state, menuIndex }, cues: [] };
      }
      if (keys.confirm) return activate(state);
      break;
    case "howto":
      if (keys.confirm || keys.back)
        return activate({ ...state, menuIndex: 0 });
      break;
    case "won":
      break;
  }
  return { state: { ...state }, cues: [] };
}
