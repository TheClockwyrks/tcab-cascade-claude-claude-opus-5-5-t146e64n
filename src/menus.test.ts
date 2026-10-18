import { describe, expect, it } from "vitest";
import { HUD_H, HUD_Y } from "./constants";
import { initialState } from "./debug";
import { activate, applyMenuKeys, menuLabels, menuRects } from "./menus";
import type { GameState } from "./types";

const none = { up: false, down: false, confirm: false, back: false };

function on(screen: GameState["screen"], menuIndex = 0): GameState {
  return { ...initialState(undefined), screen, menuIndex };
}

describe("the menus", () => {
  it("lays the HUD's three controls inside its strip, apart from each other", () => {
    const rects = menuRects("playing");
    expect(menuLabels("playing")).toEqual(["NEW GAME", "MENU", "SOUND"]);
    for (const [i, r] of rects.entries()) {
      expect(r.y).toBeGreaterThanOrEqual(HUD_Y);
      expect(r.y + r.h).toBeLessThanOrEqual(HUD_Y + HUD_H);
      if (i > 0) expect(r.x).toBeGreaterThan(rects[i - 1].x + rects[i - 1].w);
    }
    expect(menuRects("won")).toEqual([]);
    expect(menuLabels("won")).toEqual([]);
  });

  it("wraps the selection both ways over the HUD", () => {
    const up = applyMenuKeys(on("playing"), { ...none, up: true });
    expect(up.state.menuIndex).toBe(2);
    const down = applyMenuKeys(on("playing", 2), { ...none, down: true });
    expect(down.state.menuIndex).toBe(0);
  });

  it("leaves the how-to selection alone and reads nothing on won", () => {
    expect(
      applyMenuKeys(on("howto"), { ...none, down: true }).state.menuIndex,
    ).toBe(0);
    const won = applyMenuKeys(on("won"), { ...none, confirm: true });
    expect(won.state.screen).toBe("won");
    expect(
      applyMenuKeys(on("title"), { ...none, back: true }).state.screen,
    ).toBe("title");
  });

  it("deals from the HUD and returns to the title it came from", () => {
    const dealt = activate(on("playing", 0));
    expect(dealt.cues).toEqual(["deal"]);
    expect(dealt.state.tableau[6]).toHaveLength(7);
    const back = activate({ ...on("playing", 1), titleIndex: 1 });
    expect(back.state.screen).toBe("title");
    expect(back.state.menuIndex).toBe(1);
  });

  it("does nothing for an item a screen does not carry", () => {
    expect(activate(on("title", 5)).state.screen).toBe("title");
    expect(activate(on("playing", 7)).state.screen).toBe("playing");
    expect(activate(on("won")).state.screen).toBe("won");
  });
});
