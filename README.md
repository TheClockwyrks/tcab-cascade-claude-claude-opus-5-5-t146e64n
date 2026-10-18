# Cascade

Cascade is a Klondike solitaire that runs entirely in the browser. Build all four
foundations, one suit each, from Ace to King. The moment the last card goes home,
the table gives way: every card leaps off the foundations, arcs under gravity,
bounces along the floor, and paints itself onto the felt until the table is buried.

This build plays **Draw Three**: the stock turns three cards at a time onto the
waste, fanned, and only the front card plays.

Everything, from the cards and the table to the screens and the sounds, is drawn
and synthesized in code. The game needs no server, no assets, and no network.

## Install

You need Node.js 20 or later.

```sh
npm ci
```

## Run in development

```sh
npm run dev
```

Vite prints a local URL. Open it in a browser. The page reloads as you edit.

## Production build

```sh
npm run build
```

This type-checks the project and writes a static site to `dist/`, with
`index.html` at its root. Serve the directory as-is from any static host, at the
root or at a sub-path. To try the build locally:

```sh
npm run preview
```

## Controls

A mouse and a touchscreen work the same way: a press, a drag, and a release.

| Action | How |
| --- | --- |
| Move cards | Drag a face-up card. Every card below it in the column comes with it. Release it over a column or a foundation that accepts it. A highlighted pile shows where it will land. |
| Turn the stock | Click the stock. With the stock empty, click it again to turn the waste back over. |
| Send a card home | Double-click the waste's front card or a column's bottom card. |
| HUD | **NEW GAME** deals again, **MENU** returns to the title, and **SOUND** mutes or unmutes. |
| After a win | Press anywhere to deal a fresh game. |

The menus also take the keyboard:

| Key | Does |
| --- | --- |
| `↑` / `W` | Select the previous item |
| `↓` / `S` | Select the next item |
| `Enter` / `Space` | Activate the selected item |
| `Esc` | Leave the how-to screen |
| `` ` `` | Show or hide the debug overlay |

## Development

| Command | Checks |
| --- | --- |
| `npm run typecheck` | TypeScript, with `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier, in check mode |
| `npm test` | Vitest unit tests, with coverage written to `coverage/` |

The game is built on the Simple 2D engine, which owns the frame loop, input,
audio, and the canvas fit. Its documentation is in `engine/`, and the game's
specification is in `specs/`. The sources in `src/` are:

| Module | Holds |
| --- | --- |
| `game.ts` | The state, the debug surface's type, and the three functions the engine drives |
| `rules.ts` | The deck, the deal, the stock, and what each pile accepts |
| `layout.ts` | The geometry of the table, and its hit tests |
| `pointer.ts` | Press, move, and release |
| `menus.ts` | The controls of each screen, and what they do |
| `cascade.ts` | The victory cascade |
| `paint.ts` | The painted layer the cascade leaves behind |
| `cards.ts`, `sprites.ts`, `render.ts` | Drawing |
| `debug.ts`, `diagnostics.ts` | The debug and automation surface, and the overlay's values |
| `audio.ts` | The ten sound cues |

The `showcase/` directory holds the game's store-page description and media.
