// Cascade — the painted layer the victory cascade buries the table under
// (specs/victory.md).
//
// The layer is a drawing resource beside the state. `update` records every stamp
// as it happens; `render` draws the recent stamps as cards and, once enough have
// gathered, bakes them into an offscreen surface the size of the stage, so a
// frame never redraws more than a bounded number of cards however long the
// cascade has run. Clearing it drops the stamps and blanks the surface.

import { STAGE_H, STAGE_W } from "./constants";
import { paintFace } from "./sprites";
import type { PaintLayer, Stamp } from "./types";

/** How many stamps gather as cards before they are baked into the surface. */
const BAKE_AT = 1200;

/** The highest resolution the surface is baked at, in pixels per unit. */
const MAX_DENSITY = 2;

interface Surface {
  readonly canvas: CanvasImageSource;
  readonly ctx: CanvasRenderingContext2D;
}

type CanvasConstructor = new (
  width: number,
  height: number,
) => {
  getContext(kind: "2d"): CanvasRenderingContext2D | null;
};

/**
 * A blank canvas of the given size, made the way the host makes one: an element
 * in a browser, or another instance of the drawing canvas's own class in
 * process. Returns `null` on a host that offers neither.
 */
function makeSurface(
  like: CanvasRenderingContext2D,
  width: number,
  height: number,
): Surface | null {
  try {
    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      return ctx === null ? null : { canvas, ctx };
    }
    const Own = like.canvas?.constructor as CanvasConstructor | undefined;
    if (Own === undefined) return null;
    const canvas = new Own(width, height);
    const ctx = canvas.getContext("2d");
    return ctx === null
      ? null
      : { canvas: canvas as unknown as CanvasImageSource, ctx };
  } catch {
    return null;
  }
}

/** The pixels per logical unit the destination context is drawing at. */
function densityOf(ctx: CanvasRenderingContext2D): number {
  try {
    const scale = ctx.getTransform().a;
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  } catch {
    return 1;
  }
}

/** Creates an empty painted layer. */
export function createPaintLayer(): PaintLayer {
  let pending: Stamp[] = [];
  let surface: Surface | null = null;
  let baked = false;
  // An immutable copy of the surface as last baked, where the host can make
  // one. Drawing the copy rather than the canvas lets a recording capture the
  // trail once per bake instead of once per frame.
  let still: ImageBitmap | null = null;
  let generation = 0;

  function dropStill(): void {
    still?.close();
    still = null;
  }

  function snapshotSurface(canvas: CanvasImageSource): void {
    if (typeof createImageBitmap !== "function") return;
    const made = ++generation;
    createImageBitmap(canvas as HTMLCanvasElement).then(
      (bitmap) => {
        if (made === generation) still = bitmap;
        else bitmap.close();
      },
      () => undefined,
    );
  }

  function bake(like: CanvasRenderingContext2D): void {
    if (surface === null) {
      const density = Math.min(MAX_DENSITY, Math.max(1, densityOf(like)));
      surface = makeSurface(
        like,
        Math.round(STAGE_W * density),
        Math.round(STAGE_H * density),
      );
      if (surface === null) return;
      surface.ctx.setTransform(density, 0, 0, density, 0, 0);
    }
    for (const stamp of pending) {
      paintFace(surface.ctx, stamp.suit, stamp.rank, stamp.x, stamp.y);
    }
    pending = [];
    baked = true;
    dropStill();
    snapshotSurface(surface.canvas);
  }

  return {
    stamp(stamp) {
      // Whole units: a stamp lands on the pixel grid, so it blits rather than
      // resamples, and the trail it leaves is the same either way.
      pending.push({
        suit: stamp.suit,
        rank: stamp.rank,
        x: Math.round(stamp.x),
        y: Math.round(stamp.y),
      });
    },
    clear() {
      pending = [];
      baked = false;
      surface = null;
      generation++;
      dropStill();
    },
    isEmpty() {
      return pending.length === 0 && !baked;
    },
    draw(ctx, settle) {
      if (pending.length >= BAKE_AT || (settle && pending.length > 0)) {
        bake(ctx);
      }
      if (baked && surface !== null) {
        ctx.drawImage(still ?? surface.canvas, 0, 0, STAGE_W, STAGE_H);
      }
      for (const stamp of pending) {
        paintFace(ctx, stamp.suit, stamp.rank, stamp.x, stamp.y);
      }
    },
  };
}
