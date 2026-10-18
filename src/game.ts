export type Screen = "title" | "howto" | "select" | "editor";

export type Mode = "campaign" | "extras";

export type MoteType =
  | "dust"
  | "nebula"
  | "comet"
  | "nova"
  | "meteor"
  | "mercury"
  | "saturn"
  | "jupiter"
  | "mars"
  | "venus"
  | "luna"
  | "sol"
  | "umbra"
  | "lumen"
  | "aether";

export type PartKind =
  | "arm"
  | "biarm"
  | "triarm"
  | "hexarm"
  | "piston"
  | "wheel"
  | "track"
  | "bind"
  | "manifold"
  | "triune"
  | "sunder"
  | "wane"
  | "mirror"
  | "ascend"
  | "conjoin"
  | "eclipse"
  | "confluence"
  | "dispersion"
  | "void"
  | "rise"
  | "set";

export type Instruction =
  | "grab"
  | "drop"
  | "rotate-cw"
  | "rotate-ccw"
  | "pivot-cw"
  | "pivot-ccw"
  | "extend"
  | "retract"
  | "advance"
  | "recede";

export type TapeCell = Instruction | null;

export type SimStatus = "running" | "paused" | "faulted" | "complete";

export type FaultKind =
  | "collision"
  | "torn"
  | "overextended"
  | "overretracted"
  | "unmounted"
  | "track-end"
  | "impossible";

export type Focus = "field" | "tape";

export interface Hex {
  readonly q: number;
  readonly r: number;
}

export interface PatternFilament {
  readonly a: Hex;
  readonly b: Hex;
  readonly weight: number;
}

export interface Molecule {
  readonly motes: readonly {
    readonly q: number;
    readonly r: number;
    readonly type: MoteType;
  }[];
  readonly filaments: readonly PatternFilament[];
  readonly repeat: {
    readonly vector: Hex;
    readonly link: PatternFilament;
  } | null;
}

export interface Challenge {
  readonly name: string;
  readonly reagents: readonly Molecule[];
  readonly products: readonly Molecule[];
  readonly permitted: readonly PartKind[];
  readonly target: number;
}

export interface PartState {
  readonly id: number;
  readonly kind: PartKind;
  readonly q: number;
  readonly r: number;
  readonly rotation: number;
  readonly length: number;
  readonly cells: readonly Hex[] | null;
  readonly closed: boolean | null;
  readonly index: number | null;
  readonly tape: readonly TapeCell[] | null;
}

export type DragState =
  | {
      readonly kind: "place";
      readonly part: PartKind;
      readonly index: number | null;
      readonly rotation: number;
      readonly length: number;
      readonly at: Hex | null;
      readonly before: readonly PartState[];
    }
  | {
      readonly kind: "move";
      readonly part: number;
      readonly from: Hex;
      readonly at: Hex | null;
      readonly rotation: number;
      readonly length: number;
      readonly before: readonly PartState[];
    }
  | {
      readonly kind: "lay";
      readonly part: number;
      readonly end: "first" | "last";
      readonly before: readonly PartState[];
    };

export interface EditorState {
  readonly parts: readonly PartState[];
  readonly nextId: number;
  readonly selected: number | null;
  readonly focus: Focus;
  readonly cursor: { readonly part: number; readonly col: number } | null;
  readonly drag: DragState | null;
  readonly undo: readonly (readonly PartState[])[];
  readonly redo: readonly (readonly PartState[])[];
}

export interface MoteState {
  readonly id: number;
  readonly q: number;
  readonly r: number;
  readonly type: MoteType;
  readonly wheel: number | null;
}

export interface SimFilament {
  readonly a: number;
  readonly b: number;
  readonly weight: number;
}

export interface Pose {
  readonly part: number;
  readonly rotation: number;
  readonly length: number;
  readonly cell: Hex;
}

export interface Grip {
  readonly part: number;
  readonly spoke: number;
  readonly mote: number;
}

export interface Metrics {
  readonly cost: number;
  readonly cycles: number;
  readonly area: number;
}

export interface SimState {
  readonly status: SimStatus;
  readonly cycle: number;
  readonly fraction: number;
  readonly speed: number;
  readonly motes: readonly MoteState[];
  readonly nextMoteId: number;
  readonly filaments: readonly SimFilament[];
  readonly poses: readonly Pose[];
  readonly grips: readonly Grip[];
  readonly tallies: readonly number[];
  readonly areaHexes: readonly Hex[];
  readonly fault: {
    readonly kind: FaultKind;
    readonly parts: readonly number[];
    readonly motes: readonly number[];
  } | null;
  readonly metrics: Metrics | null;
}

export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
}

export interface OrreryState {
  readonly menuPress?: number | null;
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly selectIndex: number;
  readonly howtoPage: number;

  readonly unlockedCount: number;
  readonly campaignSolved: readonly number[];
  readonly extrasSolved: readonly number[];
  readonly campaignRecords: readonly (Metrics | null)[];
  readonly extrasRecords: readonly (Metrics | null)[];
  readonly campaignMachines: readonly (readonly PartState[] | null)[];
  readonly extrasMachines: readonly (readonly PartState[] | null)[];
  readonly campaignLast: number;
  readonly extrasLast: number;

  readonly challenge: Challenge | null;
  readonly challengeRef: { readonly mode: Mode; readonly index: number } | null;
  readonly editor: EditorState;
  readonly sim: SimState | null;

  readonly pointer: PointerState;
  readonly completion: boolean;
  readonly simTime: number;
  readonly muted: boolean;
}

import type { Game } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import { initial, baseDebug } from "./model";
import { courses } from "./content";
import { cost, period } from "./geometry";
import { advance, drawnMotes } from "./simulation";
import {
  action,
  pointer,
  menuItemRect,
  pendingCues,
  menuCount,
} from "./editor";
import {
  loadAssets,
  render,
  presentationDelta,
  effect,
  effectAt,
  clearPresentation,
} from "./presentation";
export const BACKGROUND = "#070f1b";
export function snapshot(s: OrreryState) {
  return {
    version: C.ORRERY_DEBUG_VERSION,
    screen: s.screen,
    mode: s.mode,
    menuIndex: s.menuIndex,
    titleIndex: s.titleIndex,
    selectIndex: s.selectIndex,
    howtoPage: s.howtoPage,
    campaign: {
      count: courses.campaign.length,
      unlockedCount: s.unlockedCount,
      solved: s.campaignSolved,
      records: s.campaignRecords,
      stashed: s.campaignMachines.flatMap((p, i) => (p ? [i] : [])),
      last: s.campaignLast,
    },
    extras: {
      count: courses.extras.length,
      solved: s.extrasSolved,
      records: s.extrasRecords,
      stashed: s.extrasMachines.flatMap((p, i) => (p ? [i] : [])),
      last: s.extrasLast,
    },
    challenge: s.challenge
      ? {
          ...s.challenge,
          source: s.challengeRef?.mode ?? "custom",
          index: s.challengeRef?.index ?? null,
        }
      : null,
    editor: {
      parts: s.editor.parts,
      cost: cost(s.editor.parts),
      period: period(s.editor.parts),
      selected: s.editor.selected,
      focus: s.editor.focus,
      cursor: s.editor.cursor,
      drag: s.editor.drag
        ? Object.fromEntries(
            Object.entries(s.editor.drag).filter(
              ([k]) =>
                k !== "before" &&
                (s.editor.drag!.kind !== "move" ||
                  !["rotation", "length"].includes(k)),
            ),
          )
        : null,
      undoDepth: s.editor.undo.length,
      redoDepth: s.editor.redo.length,
    },
    sim: s.sim
      ? {
          status: s.sim.status,
          cycle: s.sim.cycle,
          fraction: s.sim.fraction,
          speed: s.sim.speed,
          motes: drawnMotes(s),
          filaments: s.sim.filaments,
          poses: s.sim.poses,
          grips: s.sim.grips,
          tallies: s.sim.tallies,
          area: s.sim.areaHexes.length,
          fault: s.sim.fault,
          metrics: s.sim.metrics,
        }
      : null,
    pointer: s.pointer,
    completion: s.completion,
    muted: s.muted,
    simTime: s.simTime,
  };
}
export const debug = {
  ...baseDebug,
  reset: (s: OrreryState) => {
    pendingCues.clear();
    clearPresentation();
    return baseDebug.reset(s);
  },
  snapshot,
  menuItemRect,
  setMenuIndex: (s: OrreryState, n: number) => {
    if (!Number.isInteger(n) || n < 0 || n >= menuCount(s))
      throw Error("Menu index out of bounds");
    return s.screen === "select"
      ? { ...s, selectIndex: n }
      : { ...s, menuIndex: n };
  },
  pointerDown: (s: OrreryState, x: number, y: number) =>
    pointer(s, "down", x, y),
  pointerMove: (s: OrreryState, x: number, y: number) =>
    pointer(s, "move", x, y),
  pointerUp: (s: OrreryState) => pointer(s, "up"),
};
export type OrreryDebugApi = typeof debug;
export const game: Game<OrreryState, OrreryDebugApi> = {
  async initialize(api) {
    clearPresentation();
    pendingCues.clear();
    for (const name of C.ACTIONS)
      api.input.register(name, { keys: [...C.BINDINGS[name]] });
    await loadAssets(api);
    const sources: Record<
      string,
      (s: OrreryState) => string | number | boolean
    > = {
      screen: (s) => s.screen,
      mode: (s) => s.mode,
      challenge: (s) => s.challenge?.name ?? "none",
      source: (s) => s.challengeRef?.mode ?? "custom",
      parts: (s) => s.editor.parts.length,
      cost: (s) => cost(s.editor.parts),
      period: (s) => period(s.editor.parts),
      status: (s) => s.sim?.status ?? "editing",
      cycle: (s) => s.sim?.cycle ?? 0,
      fraction: (s) => s.sim?.fraction ?? 0,
      speed: (s) => C.SPEEDS[s.sim?.speed ?? C.DEFAULT_SPEED_INDEX],
      tallies: (s) =>
        s.sim?.tallies.map((n) => `${n}/${s.challenge!.target}`).join(" ") ??
        "none",
      motes: (s) => s.sim?.motes.length ?? 0,
      area: (s) => s.sim?.areaHexes.length ?? 0,
      fault: (s) => s.sim?.fault?.kind ?? "none",
      focus: (s) => s.editor.focus,
      pointer: (s) => `${s.pointer.x}, ${s.pointer.y}`,
    };
    for (const [name, f] of Object.entries(sources))
      api.diagnostics.register(name, f);
    return [initial(), debug];
  },
  update(state, api, dt) {
    let s: OrreryState = state;
    const old = s.sim;
    let confirmed = false;
    api.audio.loop(C.CUES.music);
    for (const a of C.ACTIONS)
      if (api.input.pressed(a)) {
        if (a === "mute") api.audio.setMuted(!api.audio.muted());
        else {
          if (a === "confirm" && menuCount(s) > 0) confirmed = true;
          s = action(s, a);
        }
      }
    for (const p of api.input.pointerSamples())
      if (p.primary) {
        if (confirmed) {
          s = pointer({ ...s, menuPress: null }, "move", p.x, p.y);
          s = {
            ...s,
            pointer: { x: p.x, y: p.y, down: p.buttons.includes("primary") },
          };
        } else s = pointer(s, p.type, p.x, p.y);
      }
    if (s.screen === "editor" && s.sim?.status === "running")
      s = advance(s, C.SPEEDS[s.sim.speed] * dt);
    if (s.sim) {
      s.sim.tallies.forEach((n, i) => {
        if (n > (old?.tallies[i] ?? 0)) {
          pendingCues.add(C.CUES.constellation);
          const p = s.editor.parts.find(
            (p) => p.kind === "set" && p.index === i,
          );
          if (p) effect("deliver", p);
        }
      });
      if (s.sim.status === "faulted" && old?.status !== "faulted") {
        pendingCues.add(C.CUES.halt);
        const m = drawnMotes(s)
          .filter((m) => s.sim!.fault!.motes.includes(m.id))
          .sort((a, b) => a.y - b.y || a.x - b.x)[0];
        if (m) effectAt("fault", m.x, m.y);
        else
          effect(
            "fault",
            s.editor.parts.find((p) => s.sim!.fault!.parts.includes(p.id)) ?? {
              q: 0,
              r: 0,
            },
          );
      }
      if (s.sim.status === "complete" && old?.status !== "complete") {
        pendingCues.add(C.CUES.complete);
        effect("complete", { q: 0, r: 0 });
      }
    }
    for (const cue of pendingCues) api.audio.play(cue);
    pendingCues.clear();
    presentationDelta(dt);
    return { ...s, simTime: s.simTime + dt, muted: api.audio.muted() };
  },
  render,
};
