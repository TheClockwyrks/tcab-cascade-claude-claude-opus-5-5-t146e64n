// Cascade — the values the debug overlay shows (specs/instrumentation.md).
// Every source is a pure read of the state it is handed.

import type { InitApi } from "@clockwyrks/simple-2d";
import { DEAL_MODE } from "./constants";
import type { CascadeState } from "./game";

/** Registers Cascade's diagnostic sources with the engine. */
export function registerDiagnostics(api: InitApi<CascadeState>): void {
  const sources = api.diagnostics;
  sources.register("screen", (s) => s.screen);
  sources.register("mode", () => DEAL_MODE);
  sources.register("stock", (s) => s.stock.length);
  sources.register("waste", (s) => s.waste.length);
  sources.register("foundations", (s) =>
    s.foundations.map((pile) => pile.length).join(" "),
  );
  sources.register("columns", (s) =>
    s.tableau.map((pile) => pile.length).join(" "),
  );
  sources.register("hand", (s) =>
    s.drag === null ? "empty" : `${s.drag.cards.length} held`,
  );
  sources.register("cascade", (s) =>
    s.screen === "won" || s.flyers.length > 0
      ? `${s.launched} launched, ${s.flyers.length} in flight`
      : "-",
  );
}
