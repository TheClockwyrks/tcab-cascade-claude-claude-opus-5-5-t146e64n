// Cascade — how a card is drawn: its face, its back, and the empty-slot mark.
//
// Every card is drawn in code as shapes and text, at a top-left in logical
// units, over a `CARD_W x CARD_H` footprint. The suits are drawn as paths rather
// than glyphs, so they look the same in every browser and every font.

import { CARD_H, CARD_W, RANK_MAX, RANK_MIN } from "./constants";
import type { Suit } from "./game";
import { colorOf } from "./rules";

export const PALETTE = {
  felt: "#0d3a32",
  feltLight: "#17594b",
  face: "#fbf7ec",
  faceEdge: "#cbbf9f",
  red: "#c0243a",
  black: "#1d2230",
  back: "#203462",
  backDeep: "#14223f",
  gold: "#efc45a",
  goldSoft: "rgba(239, 196, 90, 0.35)",
  ink: "#f4efe1",
  inkSoft: "rgba(244, 239, 225, 0.72)",
  slot: "rgba(255, 255, 255, 0.07)",
  slotEdge: "rgba(244, 239, 225, 0.32)",
  shade: "rgba(4, 18, 15, 0.55)",
} as const;

export const FONT_SANS =
  "'Trebuchet MS', 'Segoe UI', 'DejaVu Sans', sans-serif";
export const FONT_SERIF = "Georgia, 'Times New Roman', 'DejaVu Serif', serif";

const RADIUS = 8;

/** The text a rank is printed as. */
export function rankLabel(rank: number): string {
  if (rank === RANK_MIN) return "A";
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === RANK_MAX) return "K";
  return String(rank);
}

/** Traces a rounded rectangle as the current path. */
export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Fills a suit's mark centered on `(cx, cy)`, `s` units tall. */
export function drawSuit(
  ctx: CanvasRenderingContext2D,
  suit: Suit,
  cx: number,
  cy: number,
  s: number,
): void {
  ctx.beginPath();
  switch (suit) {
    case "hearts":
      ctx.moveTo(cx, cy + 0.46 * s);
      ctx.bezierCurveTo(
        cx - 0.62 * s,
        cy + 0.02 * s,
        cx - 0.52 * s,
        cy - 0.56 * s,
        cx,
        cy - 0.22 * s,
      );
      ctx.bezierCurveTo(
        cx + 0.52 * s,
        cy - 0.56 * s,
        cx + 0.62 * s,
        cy + 0.02 * s,
        cx,
        cy + 0.46 * s,
      );
      break;
    case "diamonds":
      ctx.moveTo(cx, cy - 0.5 * s);
      ctx.quadraticCurveTo(cx + 0.14 * s, cy - 0.16 * s, cx + 0.4 * s, cy);
      ctx.quadraticCurveTo(cx + 0.14 * s, cy + 0.16 * s, cx, cy + 0.5 * s);
      ctx.quadraticCurveTo(cx - 0.14 * s, cy + 0.16 * s, cx - 0.4 * s, cy);
      ctx.quadraticCurveTo(cx - 0.14 * s, cy - 0.16 * s, cx, cy - 0.5 * s);
      break;
    case "spades":
      ctx.moveTo(cx, cy - 0.5 * s);
      ctx.bezierCurveTo(
        cx + 0.62 * s,
        cy - 0.06 * s,
        cx + 0.5 * s,
        cy + 0.42 * s,
        cx + 0.02 * s,
        cy + 0.16 * s,
      );
      ctx.lineTo(cx + 0.2 * s, cy + 0.5 * s);
      ctx.lineTo(cx - 0.2 * s, cy + 0.5 * s);
      ctx.lineTo(cx - 0.02 * s, cy + 0.16 * s);
      ctx.bezierCurveTo(
        cx - 0.5 * s,
        cy + 0.42 * s,
        cx - 0.62 * s,
        cy - 0.06 * s,
        cx,
        cy - 0.5 * s,
      );
      break;
    case "clubs": {
      const r = 0.22 * s;
      ctx.moveTo(cx + r, cy - 0.26 * s);
      ctx.arc(cx, cy - 0.26 * s, r, 0, Math.PI * 2);
      ctx.moveTo(cx - 0.24 * s + r, cy + 0.08 * s);
      ctx.arc(cx - 0.24 * s, cy + 0.08 * s, r, 0, Math.PI * 2);
      ctx.moveTo(cx + 0.24 * s + r, cy + 0.08 * s);
      ctx.arc(cx + 0.24 * s, cy + 0.08 * s, r, 0, Math.PI * 2);
      ctx.moveTo(cx - 0.05 * s, cy);
      ctx.lineTo(cx + 0.05 * s, cy);
      ctx.lineTo(cx + 0.18 * s, cy + 0.5 * s);
      ctx.lineTo(cx - 0.18 * s, cy + 0.5 * s);
      ctx.closePath();
      break;
    }
  }
  ctx.fill();
}

/** Draws a face-up card: its rank and suit in the corners and a center mark. */
export function drawFace(
  ctx: CanvasRenderingContext2D,
  suit: Suit,
  rank: number,
  x: number,
  y: number,
): void {
  const ink = colorOf(suit) === "red" ? PALETTE.red : PALETTE.black;
  const label = rankLabel(rank);

  roundRectPath(ctx, x, y, CARD_W, CARD_H, RADIUS);
  ctx.fillStyle = PALETTE.face;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = PALETTE.faceEdge;
  ctx.stroke();

  // The index sits in the top strip, so a card fanned under another still
  // shows its rank and its suit.
  ctx.fillStyle = ink;
  ctx.font = `bold 19px ${FONT_SANS}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(label, x + 7, y + 4);
  const indexW = label.length === 2 ? 23 : 13;
  drawSuit(ctx, suit, x + 7 + indexW + 9, y + 13, 15);
  // A second mark under the rank keeps the suit readable in the waste's fan,
  // where only the card's left edge shows.
  drawSuit(ctx, suit, x + 7 + indexW / 2, y + 44, 14);

  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText(label, x + CARD_W - 7, y + CARD_H - 3);
  drawSuit(ctx, suit, x + CARD_W - 7 - indexW - 9, y + CARD_H - 12, 15);

  if (rank > 10) {
    roundRectPath(ctx, x + 18, y + 34, CARD_W - 36, CARD_H - 66, 5);
    ctx.fillStyle = colorOf(suit) === "red" ? "#f6e1dc" : "#e3e5ec";
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.font = `bold 40px ${FONT_SERIF}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + CARD_W / 2, y + 62);
    drawSuit(ctx, suit, x + CARD_W / 2, y + 93, 18);
  } else {
    drawSuit(ctx, suit, x + CARD_W / 2, y + 76, rank === RANK_MIN ? 58 : 44);
  }
}

/** Draws a face-down card: a navy back with a gold lattice and border. */
export function drawBack(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
): void {
  roundRectPath(ctx, x, y, CARD_W, CARD_H, RADIUS);
  ctx.fillStyle = PALETTE.back;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = PALETTE.backDeep;
  ctx.stroke();

  ctx.save();
  roundRectPath(ctx, x + 7, y + 7, CARD_W - 14, CARD_H - 14, 4);
  ctx.clip();
  ctx.beginPath();
  for (let d = -CARD_H; d < CARD_W + CARD_H; d += 14) {
    ctx.moveTo(x + d, y);
    ctx.lineTo(x + d + CARD_H, y + CARD_H);
    ctx.moveTo(x + d, y + CARD_H);
    ctx.lineTo(x + d + CARD_H, y);
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = PALETTE.goldSoft;
  ctx.stroke();
  ctx.restore();

  roundRectPath(ctx, x + 7, y + 7, CARD_W - 14, CARD_H - 14, 4);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = PALETTE.gold;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + CARD_W / 2, y + CARD_H / 2 - 16);
  ctx.lineTo(x + CARD_W / 2 + 11, y + CARD_H / 2);
  ctx.lineTo(x + CARD_W / 2, y + CARD_H / 2 + 16);
  ctx.lineTo(x + CARD_W / 2 - 11, y + CARD_H / 2);
  ctx.closePath();
  ctx.fillStyle = PALETTE.gold;
  ctx.fill();
}

/** Draws the mark of an empty pile, with an optional hint inside it. */
export function drawSlot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  hint: string,
): void {
  roundRectPath(ctx, x + 1, y + 1, CARD_W - 2, CARD_H - 2, RADIUS);
  ctx.fillStyle = PALETTE.slot;
  ctx.fill();
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = PALETTE.slotEdge;
  ctx.stroke();
  ctx.setLineDash([]);
  if (hint !== "") {
    ctx.fillStyle = PALETTE.slotEdge;
    ctx.font = `bold 30px ${FONT_SERIF}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(hint, x + CARD_W / 2, y + CARD_H / 2);
  }
}
