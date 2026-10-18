// Cascade — the harness the tests stand the engine up in.
//
// The engine runs in process over an `@napi-rs/canvas` canvas and a surface of
// the test's own, stepped with `advance` under a constant clock, so every test
// is exact and needs no browser.

import { createCanvas } from "@napi-rs/canvas";
import {
  ConstantClock,
  createEngine,
  type Engine,
} from "@clockwyrks/simple-2d";
import { STAGE_H, STAGE_W } from "./constants";
import {
  BACKGROUND,
  type CascadeDebugApi,
  type CascadeState,
  game,
} from "./game";

export interface Harness {
  readonly engine: Engine<CascadeState, CascadeDebugApi>;
  readonly debug: CascadeDebugApi;
  readonly events: EventTarget;
  /** Every cue played since the harness was built, in order. */
  readonly cues: string[];
  /** Applies a pose of the debug surface to the engine's state. */
  pose(transition: (state: CascadeState) => CascadeState): void;
  /** Dispatches a pointer event at a logical stage point. */
  pointer(
    type: "pointerdown" | "pointermove" | "pointerup",
    x: number,
    y: number,
  ): void;
  /** Dispatches a key event by `KeyboardEvent.code`. */
  key(type: "keydown" | "keyup", code: string): void;
}

/** Builds an engine over a 1280x720 in-process canvas, initialized. */
export async function makeHarness(stepMs = 1000 / 60): Promise<Harness> {
  const canvas = createCanvas(STAGE_W, STAGE_H);
  const events = new EventTarget();
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: STAGE_W,
    height: STAGE_H,
    game,
    background: BACKGROUND,
    clock: new ConstantClock(stepMs),
    surface: {
      cssWidth: () => STAGE_W,
      cssHeight: () => STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  const cues: string[] = [];
  engine.events.on("cue:played", (event) => cues.push(event.cue));
  await engine.initialize();
  const debug = engine.debug;
  let held = false;
  return {
    engine,
    debug,
    events,
    cues,
    pose(transition) {
      engine.apply((s) => transition(s as CascadeState));
    },
    pointer(type, x, y) {
      if (type === "pointerdown") held = true;
      if (type === "pointerup") held = false;
      const event = Object.assign(new Event(type), {
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: type === "pointermove" ? -1 : 0,
        buttons: held ? 1 : 0,
      });
      events.dispatchEvent(event);
    },
    key(type, code) {
      events.dispatchEvent(
        Object.assign(new Event(type), { code, key: code, repeat: false }),
      );
    },
  };
}
