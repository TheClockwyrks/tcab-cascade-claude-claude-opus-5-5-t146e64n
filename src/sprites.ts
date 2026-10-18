// Cascade — the card sprites.
//
// Every card face and the card back are drawn in code once, at startup, into
// immutable bitmaps, so a frame that shows hundreds of cards (the painted
// cascade above all) draws each one as a single blit. A host without bitmaps
// (the in-process test runner) draws every card as shapes instead, through the
// same functions the sprites were drawn with.

import { CARD_H, CARD_W, RANK_MAX, RANK_MIN, SUITS } from "./constants";
import { drawBack, drawFace } from "./cards";
import type { Suit } from "./game";

/** The most pixels per logical unit a sprite is drawn at. */
const MAX_DENSITY = 2;

/** The margin around a sprite, so the card's outline is not clipped. */
const MARGIN = 1;

const faces = new Map<string, ImageBitmap>();
let back: ImageBitmap | null = null;

function key(suit: Suit, rank: number): string {
  return `${suit}:${rank}`;
}

/**
 * Draws every sprite at `scale` device pixels per logical unit, so a sprite is
 * blitted at its own size. Resolves once they are ready; on a host with no
 * document or no `createImageBitmap` it resolves at once and cards are drawn as
 * shapes.
 */
export async function prepareSprites(scale: number): Promise<void> {
  if (typeof document === "undefined") return;
  if (typeof createImageBitmap !== "function") return;
  const density = Math.min(MAX_DENSITY, Math.max(1, Math.ceil(scale)));
  const canvas = document.createElement("canvas");
  canvas.width = (CARD_W + MARGIN * 2) * density;
  canvas.height = (CARD_H + MARGIN * 2) * density;
  const ctx = canvas.getContext("2d");
  if (ctx === null) return;

  const snap = async (draw: () => void): Promise<ImageBitmap> => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(
      density,
      0,
      0,
      density,
      MARGIN * density,
      MARGIN * density,
    );
    draw();
    return createImageBitmap(canvas);
  };

  for (const suit of SUITS) {
    for (let rank = RANK_MIN; rank <= RANK_MAX; rank++) {
      faces.set(
        key(suit, rank),
        await snap(() => drawFace(ctx, suit, rank, 0, 0)),
      );
    }
  }
  back = await snap(() => drawBack(ctx, 0, 0));
}

function blit(
  ctx: CanvasRenderingContext2D,
  sprite: ImageBitmap,
  x: number,
  y: number,
): void {
  ctx.drawImage(
    sprite,
    x - MARGIN,
    y - MARGIN,
    CARD_W + MARGIN * 2,
    CARD_H + MARGIN * 2,
  );
}

/** Draws a face-up card, from its sprite when there is one. */
export function paintFace(
  ctx: CanvasRenderingContext2D,
  suit: Suit,
  rank: number,
  x: number,
  y: number,
): void {
  const sprite = faces.get(key(suit, rank));
  if (sprite === undefined) drawFace(ctx, suit, rank, x, y);
  else blit(ctx, sprite, x, y);
}

/** Draws a card of either face, from its sprite when there is one. */
export function paintCard(
  ctx: CanvasRenderingContext2D,
  card: {
    readonly suit: Suit;
    readonly rank: number;
    readonly faceUp: boolean;
  },
  x: number,
  y: number,
): void {
  if (card.faceUp) paintFace(ctx, card.suit, card.rank, x, y);
  else if (back === null) drawBack(ctx, x, y);
  else blit(ctx, back, x, y);
}
