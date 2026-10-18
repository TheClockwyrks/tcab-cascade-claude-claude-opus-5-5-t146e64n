// Cascade — drawing every screen (specs/screens.md, specs/table.md).
//
// The renderer reads the state and draws it; it changes nothing. Positions come
// from `layout.ts`, so what is drawn is exactly what the hit tests resolve.

import {
  CARD_H,
  CARD_W,
  COLUMN_X,
  DEAL_MODE_LABEL,
  FOUNDATION_X,
  HUD_H,
  HUD_Y,
  STAGE_H,
  STAGE_W,
  STOCK_X,
  TABLEAU_Y,
  TAGLINE_TEXT,
  TITLE_TEXT,
  TOP_ROW_Y,
  WASTE_X,
  WIN_TEXT,
} from "./constants";
import {
  drawSlot,
  FONT_SANS,
  FONT_SERIF,
  PALETTE,
  roundRectPath,
} from "./cards";
import { advanceFlyer } from "./cascade";
import type { CardState, FlyerState, Suit } from "./game";
import { columnYs, dropRect, wasteFanX, wasteShown } from "./layout";
import { menuLabels, menuRects } from "./menus";
import { paintCard, paintFace } from "./sprites";
import type { Rect, View } from "./types";

type Ctx = CanvasRenderingContext2D;

/** The felt: the background color, lit toward the middle of the table. */
function drawFelt(ctx: Ctx): void {
  const glow = ctx.createRadialGradient(640, 330, 80, 640, 360, 820);
  glow.addColorStop(0, PALETTE.feltLight);
  glow.addColorStop(1, PALETTE.felt);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
}

function drawText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  font: string,
  color: string,
  align: CanvasTextAlign = "center",
): void {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

/** Draws one menu control: a button, filled gold while it is selected. */
function drawButton(
  ctx: Ctx,
  rect: Rect,
  label: string,
  selected: boolean,
  size: number,
): void {
  roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, Math.min(12, rect.h / 2));
  ctx.fillStyle = selected ? PALETTE.gold : "rgba(6, 26, 22, 0.72)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = selected ? "#fff3cf" : PALETTE.slotEdge;
  ctx.stroke();
  drawText(
    ctx,
    label,
    rect.x + rect.w / 2,
    rect.y + rect.h / 2 + 1,
    `bold ${size}px ${FONT_SANS}`,
    selected ? PALETTE.backDeep : PALETTE.ink,
  );
}

function drawMenu(ctx: Ctx, state: View, size: number): void {
  const rects = menuRects(state.screen);
  const labels = menuLabels(state.screen);
  rects.forEach((rect, i) => {
    drawButton(ctx, rect, labels[i], i === state.menuIndex, size);
  });
}

/** The waste: the cards squared beneath, then the newest set fanned. */
function drawWaste(ctx: Ctx, state: View): void {
  if (state.wasteSets.length === 0 || state.waste.length === 0) {
    drawSlot(ctx, WASTE_X, TOP_ROW_Y, "");
    return;
  }
  const shown = wasteShown(state);
  const squared = state.waste.length - shown;
  if (squared > 0) {
    paintCard(ctx, state.waste[squared - 1], WASTE_X, TOP_ROW_Y);
  } else {
    drawSlot(ctx, WASTE_X, TOP_ROW_Y, "");
  }
  for (let i = 0; i < shown; i++) {
    paintCard(ctx, state.waste[squared + i], wasteFanX(i), TOP_ROW_Y);
  }
}

/** The stock: its top card, or an empty slot showing whether it can recycle. */
function drawStock(ctx: Ctx, state: View): void {
  const top = state.stock[state.stock.length - 1];
  if (top !== undefined) {
    paintCard(ctx, top, STOCK_X, TOP_ROW_Y);
    return;
  }
  drawSlot(ctx, STOCK_X, TOP_ROW_Y, "");
  if (state.waste.length === 0) return;
  // A ring with an arrowhead: clicking here turns the waste back over.
  const cx = STOCK_X + CARD_W / 2;
  const cy = TOP_ROW_Y + CARD_H / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 20, -Math.PI * 0.35, Math.PI * 1.45);
  ctx.lineWidth = 5;
  ctx.strokeStyle = PALETTE.slotEdge;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 8, cy - 28);
  ctx.lineTo(cx + 20, cy - 14);
  ctx.lineTo(cx + 2, cy - 10);
  ctx.closePath();
  ctx.fillStyle = PALETTE.slotEdge;
  ctx.fill();
}

function drawFoundations(ctx: Ctx, state: View): void {
  state.foundations.forEach((pile, i) => {
    const top = pile[pile.length - 1];
    if (top === undefined) drawSlot(ctx, FOUNDATION_X[i], TOP_ROW_Y, "A");
    else paintCard(ctx, top, FOUNDATION_X[i], TOP_ROW_Y);
  });
}

function drawColumns(ctx: Ctx, state: View): void {
  state.tableau.forEach((column, i) => {
    if (column.length === 0) {
      drawSlot(ctx, COLUMN_X[i], TABLEAU_Y, "K");
      return;
    }
    const ys = columnYs(column);
    column.forEach((card, row) => paintCard(ctx, card, COLUMN_X[i], ys[row]));
  });
}

/** Draws the highlight over the pile a release would land the held run on. */
function drawDropTarget(ctx: Ctx, state: View): void {
  const target = state.dropTarget;
  if (target === null) return;
  const rect = dropRect(state, target);
  const y = rect.h > CARD_H ? rect.y + rect.h - CARD_H : rect.y;
  ctx.save();
  roundRectPath(ctx, rect.x - 4, y - 4, CARD_W + 8, CARD_H + 8, 11);
  ctx.shadowColor = PALETTE.gold;
  ctx.shadowBlur = 18;
  ctx.lineWidth = 4;
  ctx.strokeStyle = PALETTE.gold;
  ctx.stroke();
  ctx.restore();
  roundRectPath(ctx, rect.x, y, CARD_W, CARD_H, 8);
  ctx.fillStyle = "rgba(239, 196, 90, 0.22)";
  ctx.fill();
}

/** Draws the run in hand, lifted on a soft shadow above everything else. */
function drawHand(ctx: Ctx, state: View): void {
  const drag = state.drag;
  if (drag === null) return;
  const ys = columnYs(drag.cards as readonly CardState[]).map(
    (y) => y - TABLEAU_Y + drag.y,
  );
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = 22;
  ctx.shadowOffsetX = 6;
  ctx.shadowOffsetY = 12;
  roundRectPath(
    ctx,
    drag.x,
    drag.y,
    CARD_W,
    ys[ys.length - 1] - drag.y + CARD_H,
    8,
  );
  ctx.fillStyle = PALETTE.face;
  ctx.fill();
  ctx.restore();
  drag.cards.forEach((card, i) => paintCard(ctx, card, drag.x, ys[i]));
}

function drawFlyers(ctx: Ctx, state: View): void {
  for (const flyer of state.flyers) {
    paintFace(ctx, flyer.suit, flyer.rank, flyer.x, flyer.y);
  }
}

/** The HUD strip: the three controls and the deal-mode label. */
function drawHud(ctx: Ctx, state: View): void {
  ctx.fillStyle = "rgba(3, 20, 17, 0.6)";
  ctx.fillRect(0, HUD_Y, STAGE_W, HUD_H);
  ctx.fillStyle = PALETTE.goldSoft;
  ctx.fillRect(0, HUD_Y, STAGE_W, 1);
  drawMenu(ctx, state, 15);

  // The sound control carries a dot that is lit while sound is on.
  const sound = menuRects("playing")[2];
  const cx = sound.x + sound.w - 16;
  const cy = sound.y + sound.h / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  const selected = state.menuIndex === 2;
  const ink = selected ? PALETTE.backDeep : PALETTE.ink;
  ctx.lineWidth = 2;
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  if (state.muted) ctx.stroke();
  else ctx.fill();

  drawText(
    ctx,
    DEAL_MODE_LABEL,
    COLUMN_X[6] + CARD_W,
    HUD_Y + HUD_H / 2 + 1,
    `bold 15px ${FONT_SANS}`,
    PALETTE.gold,
    "right",
  );
}

/** The table as play leaves it: piles, the painted layer, flyers, the hand. */
function drawTable(ctx: Ctx, state: View): void {
  drawFelt(ctx);
  const paint = state.paint;
  if (paint !== undefined && !paint.isEmpty()) {
    paint.draw(ctx, state.flyers.length === 0);
  }
  drawStock(ctx, state);
  drawWaste(ctx, state);
  drawFoundations(ctx, state);
  drawColumns(ctx, state);
  drawDropTarget(ctx, state);
  drawFlyers(ctx, state);
  drawHand(ctx, state);
}

/** The table once won: the painted felt, flyers, and the cards still home. */
function drawWonTable(ctx: Ctx, state: View): void {
  drawFelt(ctx);
  const paint = state.paint;
  if (paint !== undefined && !paint.isEmpty()) {
    paint.draw(ctx, state.flyers.length === 0);
  }
  state.foundations.forEach((pile, i) => {
    const top = pile[pile.length - 1];
    if (top !== undefined) paintCard(ctx, top, FOUNDATION_X[i], TOP_ROW_Y);
  });
  drawFlyers(ctx, state);
}

/** The stamps of one card falling the way the cascade throws them. */
function titleTrail(
  suit: Suit,
  rank: number,
  x: number,
  vx: number,
): readonly { suit: Suit; rank: number; x: number; y: number }[] {
  const stamps: { suit: Suit; rank: number; x: number; y: number }[] = [];
  let flyer: FlyerState = { id: 0, suit, rank, x, y: 40, vx, vy: -120 };
  for (let step = 0; step < 240; step++) {
    flyer = advanceFlyer(flyer, 1 / 30);
    if (flyer.x + CARD_W < 0 || flyer.x > STAGE_W) break;
    if (step % 3 === 0) stamps.push({ suit, rank, x: flyer.x, y: flyer.y });
  }
  return stamps;
}

/** Two cascades in miniature, one down each side of the title. */
const TITLE_TRAILS = [
  ...titleTrail("hearts", 13, 190, -170),
  ...titleTrail("spades", 13, 990, 170),
];

function drawTitle(ctx: Ctx, state: View): void {
  drawFelt(ctx);
  ctx.save();
  ctx.globalAlpha = 0.5;
  for (const stamp of TITLE_TRAILS) {
    paintFace(ctx, stamp.suit, stamp.rank, stamp.x, stamp.y);
  }
  ctx.restore();

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 6;
  drawText(ctx, TITLE_TEXT, 640, 200, `bold 118px ${FONT_SERIF}`, PALETTE.gold);
  ctx.restore();
  drawText(ctx, TAGLINE_TEXT, 640, 288, `bold 24px ${FONT_SANS}`, PALETTE.ink);

  roundRectPath(ctx, 560, 324, 160, 34, 17);
  ctx.lineWidth = 2;
  ctx.strokeStyle = PALETTE.gold;
  ctx.stroke();
  drawText(
    ctx,
    DEAL_MODE_LABEL,
    640,
    342,
    `bold 16px ${FONT_SANS}`,
    PALETTE.gold,
  );

  drawMenu(ctx, state, 22);
  drawText(
    ctx,
    "UP / DOWN TO CHOOSE  ·  ENTER TO CONFIRM",
    640,
    684,
    `14px ${FONT_SANS}`,
    PALETTE.inkSoft,
  );
}

const HOWTO_SECTIONS: readonly { heading: string; lines: readonly string[] }[] =
  [
    {
      heading: "THE GOAL",
      lines: [
        "Build all four foundations, one suit each, from ACE up to KING.",
      ],
    },
    {
      heading: "THE COLUMNS",
      lines: [
        "Stack cards down the columns in falling rank, alternating red and black.",
        "Only a KING, or a run led by one, may fill an empty column.",
      ],
    },
    {
      heading: "THE STOCK",
      lines: [
        "Click the STOCK to turn three cards onto the waste. Only the front one plays.",
        "When the STOCK runs dry, click it again to recycle the waste.",
      ],
    },
    {
      heading: "MOVING CARDS",
      lines: [
        "Drag a face-up card, with every card below it, onto a column or foundation.",
        "DOUBLE-CLICK a card to send it straight home to its foundation.",
      ],
    },
  ];

function drawHowto(ctx: Ctx, state: View): void {
  drawFelt(ctx);
  roundRectPath(ctx, 170, 34, 940, 574, 18);
  ctx.fillStyle = "rgba(4, 22, 19, 0.78)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = PALETTE.goldSoft;
  ctx.stroke();

  drawText(
    ctx,
    "HOW TO PLAY",
    640,
    84,
    `bold 40px ${FONT_SERIF}`,
    PALETTE.gold,
  );
  let y = 150;
  for (const section of HOWTO_SECTIONS) {
    drawText(
      ctx,
      section.heading,
      220,
      y,
      `bold 18px ${FONT_SANS}`,
      PALETTE.gold,
      "left",
    );
    y += 30;
    for (const line of section.lines) {
      drawText(ctx, line, 220, y, `19px ${FONT_SANS}`, PALETTE.ink, "left");
      y += 28;
    }
    y += 20;
  }
  drawMenu(ctx, state, 20);
}

function drawWinMessage(ctx: Ctx): void {
  ctx.fillStyle = "rgba(3, 18, 15, 0.7)";
  ctx.fillRect(0, 250, STAGE_W, 210);
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 20;
  drawText(ctx, WIN_TEXT, 640, 336, `bold 104px ${FONT_SERIF}`, PALETTE.gold);
  ctx.restore();
  drawText(
    ctx,
    "PRESS ANYWHERE TO DEAL AGAIN",
    640,
    420,
    `bold 20px ${FONT_SANS}`,
    PALETTE.ink,
  );
}

/** Draws the current screen. */
export function renderState(ctx: Ctx, state: View): void {
  switch (state.screen) {
    case "title":
      drawTitle(ctx, state);
      return;
    case "howto":
      drawHowto(ctx, state);
      return;
    case "playing":
      drawTable(ctx, state);
      drawHud(ctx, state);
      return;
    case "won":
      drawWonTable(ctx, state);
      if (state.cascadeDone) drawWinMessage(ctx);
      return;
  }
}
