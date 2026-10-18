import { describe, expect, it } from "vitest";
import { CUES, SUITS } from "./constants";
import type { CascadeState } from "./game";
import { menuRects } from "./menus";
import { makeHarness } from "./testing";

function center(screen: CascadeState["screen"], index: number) {
  const rect = menuRects(screen)[index];
  return [rect.x + rect.w / 2, rect.y + rect.h / 2] as const;
}

describe("the engine running Cascade", () => {
  it("opens on the title with every cue defined and the menu actions bound", async () => {
    const h = await makeHarness();
    await h.engine.advance(1);
    expect(h.debug.snapshot(h.engine.state).screen).toBe("title");
    expect(h.engine.diagnostics().map((r) => r.name)).toEqual([
      "screen",
      "mode",
      "stock",
      "waste",
      "foundations",
      "columns",
      "hand",
      "cascade",
    ]);
    expect(h.engine.diagnostics().every((r) => r.error === undefined)).toBe(
      true,
    );
  });

  it("accumulates simTime from every frame's delta, on any screen", async () => {
    const h = await makeHarness(20);
    await h.engine.advance(50);
    expect(h.debug.snapshot(h.engine.state).simTime).toBeCloseTo(1, 9);
  });

  it("starts a game from the keyboard and plays its cue once", async () => {
    const h = await makeHarness();
    h.key("keydown", "Enter");
    await h.engine.advance(1);
    h.key("keyup", "Enter");
    const s = h.debug.snapshot(h.engine.state);
    expect(s.screen).toBe("playing");
    expect(s.menuIndex).toBe(0);
    expect(h.cues).toEqual([CUES.deal]);
  });

  it("moves before it confirms, and up before down", async () => {
    const h = await makeHarness();
    h.key("keydown", "ArrowDown");
    h.key("keydown", "Enter");
    await h.engine.advance(1);
    expect(h.debug.snapshot(h.engine.state)).toMatchObject({
      screen: "title",
      menuIndex: 1,
    });
    h.key("keyup", "ArrowDown");
    h.key("keyup", "Enter");
    h.key("keydown", "KeyW");
    h.key("keydown", "KeyS");
    await h.engine.advance(1);
    expect(h.debug.snapshot(h.engine.state).menuIndex).toBe(0);
  });

  it("walks the how-to screen and back with Escape", async () => {
    const h = await makeHarness();
    h.key("keydown", "KeyS");
    await h.engine.advance(1);
    h.key("keyup", "KeyS");
    h.key("keydown", "Space");
    await h.engine.advance(1);
    h.key("keyup", "Space");
    expect(h.debug.snapshot(h.engine.state).screen).toBe("howto");
    h.key("keydown", "Escape");
    await h.engine.advance(1);
    expect(h.debug.snapshot(h.engine.state)).toMatchObject({
      screen: "title",
      menuIndex: 1,
    });
  });

  it("answers a press and a release delivered on one frame", async () => {
    const h = await makeHarness();
    const [x, y] = center("title", 0);
    h.pointer("pointerdown", x, y);
    h.pointer("pointerup", x, y);
    await h.engine.advance(1);
    expect(h.debug.snapshot(h.engine.state).screen).toBe("playing");
  });

  it("toggles the runtime's mute bit from the SOUND control", async () => {
    const h = await makeHarness();
    h.pose((s) => h.debug.setScreen(s, "playing"));
    const [x, y] = center("playing", 2);
    h.pointer("pointerdown", x, y);
    h.pointer("pointerup", x, y);
    await h.engine.advance(1);
    expect(h.debug.snapshot(h.engine.state).muted).toBe(true);
    const gains: number[] = [];
    h.engine.events.on("cue:played", (e) => gains.push(e.gain));
    h.pose((s) => h.debug.addCard(s, "stock", 0, "clubs", 3, false));
    h.pointer("pointerdown", 270, 90);
    h.pointer("pointerup", 270, 90);
    await h.engine.advance(1);
    expect(gains).toEqual([0]);
    h.pose((s) => h.debug.pointerDown(s, x, y));
    h.pose((s) => h.debug.pointerUp(s, x, y));
    await h.engine.advance(1);
    expect(h.debug.snapshot(h.engine.state).muted).toBe(false);
  });

  it("plays drop and home together for a drop onto a foundation", async () => {
    const h = await makeHarness();
    h.pose((s) => h.debug.setScreen(s, "playing"));
    h.pose((s) => h.debug.addCard(s, "tableau", 0, "hearts", 1, true));
    h.pointer("pointerdown", 260, 200);
    h.pointer("pointermove", 640, 60);
    h.pointer("pointerup", 640, 60);
    await h.engine.advance(1);
    expect(h.cues).toEqual([CUES.lift, CUES.drop, CUES.home]);
    expect(h.debug.snapshot(h.engine.state).foundations[0]).toHaveLength(1);
  });

  it("wins on the last card home and runs the cascade to its end", async () => {
    const h = await makeHarness(1000 / 30);
    // The trail is covered by the cascade's own tests; drawing it here as
    // shapes would only slow the in-process canvas down.
    h.pose((s) =>
      h.debug.setTrailPainting(h.debug.setScreen(s, "playing"), false),
    );
    SUITS.forEach((suit, i) => {
      const top = i === 3 ? 12 : 13;
      for (let rank = 1; rank <= top; rank++) {
        h.pose((s) => h.debug.addCard(s, "foundation", i, suit, rank, true));
      }
    });
    h.pose((s) => h.debug.addCard(s, "tableau", 0, "clubs", 13, true));
    h.pointer("pointerdown", 260, 200);
    h.pointer("pointerup", 260, 200);
    h.pointer("pointerdown", 260, 200);
    h.pointer("pointerup", 260, 200);
    await h.engine.advance(1);
    let s = h.debug.snapshot(h.engine.state);
    expect(s.screen).toBe("won");
    expect(h.cues).toContain(CUES.win);
    expect(s.launched).toBe(1);

    await h.engine.advance(30 * 25);
    s = h.debug.snapshot(h.engine.state);
    expect(s.launched).toBe(52);
    expect(s.flyers).toHaveLength(0);
    expect(s.cascadeDone).toBe(true);
    expect(s.trailStamps).toBe(0);
    expect(h.cues.filter((c) => c === CUES.launch).length).toBeGreaterThan(40);

    h.pointer("pointerdown", 640, 360);
    await h.engine.advance(1);
    s = h.debug.snapshot(h.engine.state);
    expect(s.screen).toBe("playing");
    expect(s.trailStamps).toBe(0);
    expect(s.launched).toBe(0);
    expect(s.tableau[6]).toHaveLength(7);
  });

  it("records its own drawing of the table and the cascade", async () => {
    const h = await makeHarness();
    h.pose((s) => h.debug.setScreen(h.debug.deal(s), "playing"));
    h.pose((s) => h.debug.turnStock(s));
    h.pose((s) => h.debug.addFlyer(s, "spades", 13, 600, 24, 300, -120));
    h.engine.startRecording();
    await h.engine.advance(5);
    const recording = h.engine.stopRecording();
    expect(recording.frames).toHaveLength(5);
    expect(recording.frames.every((f) => f.ops.length > 100)).toBe(true);
  });

  it("draws every screen, including a painted table, without error", async () => {
    const h = await makeHarness();
    for (const screen of ["title", "howto", "playing", "won"] as const) {
      h.pose((s) => h.debug.setScreen(s, screen));
      await h.engine.advance(1);
    }
    h.pose((s) => h.debug.setScreen(h.debug.deal(s), "playing"));
    for (let i = 0; i < 40; i++) {
      h.pose((s) =>
        h.debug.addFlyer(s, "hearts", 1 + (i % 13), 100 + i * 20, 100, 0, 0),
      );
    }
    await h.engine.advance(12);
    h.pose((s) => h.debug.clearFlyers(s));
    await h.engine.advance(1);
    h.pose((s) => h.debug.setScreen(s, "won"));
    h.pose((s) => ({ ...s, cascadeDone: true }));
    await h.engine.advance(1);
    h.pose((s) => h.debug.setScreen(s, "playing"));
    h.pose((s) => h.debug.addCard(s, "tableau", 0, "spades", 13, true));
    h.pose((s) => h.debug.addCard(s, "tableau", 1, "hearts", 12, true));
    h.pose((s) =>
      h.debug.pointerDown(
        s,
        380,
        h.debug.snapshot(s).tableau[1].length * 24 + 170,
      ),
    );
    h.pose((s) => h.debug.pointerMove(s, 250, 300));
    await h.engine.advance(1);
    expect(h.debug.snapshot(h.engine.state).trailStamps).toBe(480);
  });
});
