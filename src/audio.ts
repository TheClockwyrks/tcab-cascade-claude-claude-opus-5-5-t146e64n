// Cascade — the ten cues (specs/audio.md), each a distinct short sound.

import type { CueSpec } from "@clockwyrks/simple-2d";
import { CUES, type CueName } from "./constants";

/** The synthesis of every cue, by name. */
export const CUE_SPECS: Readonly<Record<CueName, CueSpec>> = {
  [CUES.deal]: {
    wave: "triangle",
    freq: 330,
    freqTo: 660,
    durationMs: 220,
    gain: 0.18,
  },
  [CUES.turn]: {
    wave: "triangle",
    freq: 520,
    freqTo: 380,
    durationMs: 70,
    gain: 0.14,
  },
  [CUES.recycle]: {
    wave: "sawtooth",
    freq: 240,
    freqTo: 120,
    durationMs: 200,
    gain: 0.08,
  },
  [CUES.lift]: {
    wave: "sine",
    freq: 600,
    freqTo: 760,
    durationMs: 50,
    gain: 0.12,
  },
  [CUES.drop]: {
    wave: "sine",
    freq: 300,
    freqTo: 220,
    durationMs: 80,
    gain: 0.2,
  },
  [CUES.reject]: {
    wave: "square",
    freq: 160,
    freqTo: 110,
    durationMs: 140,
    gain: 0.07,
  },
  [CUES.flip]: {
    wave: "triangle",
    freq: 880,
    freqTo: 990,
    durationMs: 60,
    gain: 0.12,
  },
  [CUES.home]: {
    wave: "sine",
    freq: 784,
    freqTo: 1046,
    durationMs: 140,
    gain: 0.16,
  },
  [CUES.launch]: {
    wave: "triangle",
    freq: 420,
    freqTo: 900,
    durationMs: 90,
    gain: 0.08,
  },
  [CUES.win]: {
    wave: "square",
    freq: 523,
    freqTo: 1568,
    durationMs: 600,
    gain: 0.1,
  },
};
