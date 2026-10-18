import { describe, test, expect } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { createEngine, ConstantClock, type Game } from "@clockwyrks/simple-2d";
import {
  game,
  debug,
  type OrreryState,
  type OrreryDebugApi,
  type Hex,
  type PartKind,
  type MoteType,
} from "./game";
import {
  initial,
  open,
  loadSolution,
  loadChallenge,
  place,
  editPart,
  readSolution,
} from "./model";
import { courses, reference, single } from "./content";
import { advance, start, boundary } from "./simulation";
import { action, pointer, menuItemRect } from "./editor";
import { field, xy, target, cost, period, validateParts } from "./geometry";
import * as C from "./constants";
import delivery from "../assets/particles/deliver.json";
const testGame: Game<OrreryState, OrreryDebugApi> = {
  ...game,
  initialize: (api) =>
    game.initialize({
      ...api,
      assets: {
        ...api.assets,
        loadImage: async () => createCanvas(48, 48) as unknown as ImageBitmap,
        load: async () => new Blob([JSON.stringify(delivery)]),
      },
      audio: {
        ...api.audio,
        load: async (name) => {
          api.audio.define(name, { freq: 440, durationMs: 10 });
        },
      },
    }),
};
async function engine() {
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H);
  const events = new EventTarget();
  const e = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game: testGame,
    clock: new ConstantClock(1000 / 60),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  await e.initialize();
  return e;
}
function sandbox() {
  return debug.setCompletion(
    start(
      loadChallenge(initial(), {
        name: "Laboratory",
        reagents: [single("dust")],
        products: [single("dust")],
        permitted: ["arm"],
        target: C.CONSTELLATION_TARGET,
      }),
    ),
    false,
  );
}
function mote(s: OrreryState, h: Hex, type: MoteType = "dust") {
  return debug.spawnMote(s, h.q, h.r, type);
}
describe("shipped course", () => {
  for (const mode of ["campaign", "extras"] as const)
    courses[mode].forEach((ch, index) =>
      test(`${mode}: ${ch.name} reference completes`, () => {
        let s = open(initial(), mode, index);
        s = loadSolution(s, reference(mode, index));
        validateParts(s.editor.parts, ch);
        expect(s.editor.parts.filter((p) => p.kind === "rise")).toHaveLength(
          ch.reagents.length,
        );
        expect(s.editor.parts.filter((p) => p.kind === "set")).toHaveLength(
          ch.products.length,
        );
        const original = JSON.stringify(s.editor);
        s = advance(start(s), C.CAMPAIGN_REFERENCE_CYCLES);
        expect(s.sim!.fault).toBeNull();
        expect(s.sim!.status).toBe("complete");
        expect(s.sim!.tallies.every((n) => n >= ch.target)).toBe(true);
        expect(JSON.stringify(s.editor)).toBe(original);
        expect(s[`${mode}Solved`]).toContain(index);
      }),
    );
  test("campaign breadth and progression", () => {
    const refs = courses.campaign.map((_, i) => reference("campaign", i));
    expect(refs[0].parts.length).toBeLessThanOrEqual(C.CAMPAIGN_OPENER_PARTS);
    expect(refs[refs.length - 1].parts.length).toBeGreaterThanOrEqual(
      C.CAMPAIGN_FINALE_PARTS,
    );
    for (let i = 2; i < refs.length; i++)
      expect(refs[i].parts.length).toBeGreaterThanOrEqual(
        refs[i - 2].parts.length,
      );
    for (const kind of C.PARTS)
      expect(refs.some((r) => r.parts.some((p) => p.kind === kind))).toBe(true);
    expect(
      Math.max(...refs[refs.length - 1].parts.map((p) => p.tape?.length ?? 0)),
    ).toBeGreaterThan(
      Math.max(
        ...refs
          .slice(0, -1)
          .flatMap((r) => r.parts.map((p) => p.tape?.length ?? 0)),
      ),
    );
  });
});
describe("simulation", () => {
  test("frame partition has no effect", () => {
    const s = start(
      loadSolution(open(initial(), "campaign", 0), reference("campaign", 0)),
    );
    const full = advance(s, 20);
    let divided = s;
    for (let i = 0; i < 1200; i++) divided = advance(divided, 1 / 60);
    expect({ ...divided.sim, fraction: 0 }).toEqual({
      ...full.sim,
      fraction: 0,
    });
    expect(divided.sim!.fraction).toBeCloseTo(full.sim!.fraction, 8);
  });
  for (const [length, stationary, collides, sample] of [
    [1, { q: 1, r: 1 }, true, 3],
    [1, { q: 1, r: -1 }, false, 0],
    [2, { q: 1, r: 0 }, false, 0],
    [2, { q: 1, r: 1 }, true, 1],
  ] as const)
    test(`rotating collision ${length} / ${stationary.q},${stationary.r}`, () => {
      let s = sandbox();
      s = place(s, "arm", 0, 0);
      s = editPart(s, 1, { length, tape: ["rotate-cw"] });
      s = debug.setPoseLength(s, 1, length);
      s = mote(s, { q: length, r: 0 });
      s = mote(s, stationary);
      s = debug.setGrip(s, 1, 0, 1);
      s = advance(s, 1);
      expect(s.sim!.status).toBe(collides ? "faulted" : "running");
      if (collides) {
        expect(s.sim!.fault!.kind).toBe("collision");
        expect(s.sim!.fraction).toBe(sample / 8);
      }
    });
  test("resting neighbors remain separate", () => {
    let s = sandbox();
    s = mote(s, { q: 0, r: 0 });
    s = mote(s, { q: 1, r: 0 });
    s = advance(s, 10);
    expect(s.sim!.fault).toBeNull();
    expect(s.sim!.cycle).toBe(10);
  });
  test.each([
    ["arm", "extend", "impossible"],
    ["piston", "retract", "overretracted"],
    ["arm", "advance", "unmounted"],
    ["wheel", "grab", "impossible"],
  ] as const)("%s %s fetch faults as %s", (kind, instruction, fault) => {
    let s = sandbox();
    s = place(s, kind, 0, 0);
    s = editPart(s, 1, { tape: [instruction] });
    s = advance(s, 0.01);
    expect(s.sim!.fault?.kind).toBe(fault);
    expect(s.sim!.cycle).toBe(0);
  });
  test("incompatible holds tear a bonded body", () => {
    let s = sandbox();
    s = place(s, "arm", 0, 0);
    s = place(s, "arm", 2, 0, 3);
    s = editPart(s, 1, { tape: ["rotate-cw"] });
    s = mote(s, { q: 1, r: 0 });
    s = debug.setGrip(s, 1, 0, 1);
    s = debug.setGrip(s, 2, 3, 1);
    s = advance(s, 1);
    expect(s.sim!.fault).toEqual({ kind: "torn", parts: [1, 2], motes: [1] });
  });
  test("completion gate preserves progress", () => {
    let s = debug.setCompletion(
      start(
        loadSolution(open(initial(), "campaign", 0), reference("campaign", 0)),
      ),
      false,
    );
    s = advance(s, 90);
    expect(s.sim!.status).toBe("running");
    expect(s.campaignSolved).toEqual([]);
    expect(s.sim!.tallies[0]).toBeGreaterThan(6);
  });
  const sigils: [PartKind, MoteType[], MoteType[]][] = [
    ["wane", ["comet"], ["dust"]],
    ["mirror", ["nova", "dust"], ["nova", "nova"]],
    ["ascend", ["mercury", "saturn"], ["jupiter"]],
    ["conjoin", ["venus", "venus"], ["luna"]],
    ["eclipse", ["dust", "dust"], ["umbra", "lumen"]],
    ["dispersion", ["aether"], ["nebula", "comet", "nova", "meteor"]],
    ["void", ["dust"], []],
  ];
  for (const [kind, types, expected] of sigils)
    test(`${kind} transforms only at a boundary`, () => {
      let s = sandbox();
      s = place(s, kind, 0, 0);
      types.forEach((t, i) => {
        s = mote(s, { q: i, r: 0 }, t);
      });
      expect(s.sim!.motes.map((m) => m.type)).toEqual(types);
      s = { ...s, sim: boundary(s, s.sim!) };
      expect(s.sim!.motes.map((m) => m.type).sort()).toEqual(
        [...expected].sort(),
      );
    });
});
describe("editor and automation", () => {
  test("91 cells and exact targeting", () => {
    expect(field).toHaveLength(91);
    for (const h of field) {
      const p = xy(h);
      expect(target(p.x, p.y)).toEqual(h);
    }
    expect(target(0, 0)).toBeNull();
  });
  test("pointer placement, tape write, undo and redo", () => {
    let s = open(initial(), "campaign", 0);
    s = pointer(s, "down", 40, 70);
    s = pointer(s, "move", C.FIELD_CX, C.FIELD_CY);
    s = pointer(s, "up");
    expect(s.editor.parts).toHaveLength(1);
    expect(s.editor.undo).toHaveLength(1);
    s = pointer(s, "down", 324, 574);
    s = pointer(s, "up");
    s = action(s, "ins-grab");
    s = action(s, "ins-rotate-cw");
    expect(s.editor.parts[0].tape).toEqual(["grab", "rotate-cw"]);
    expect(s.editor.cursor?.col).toBe(2);
    s = action(s, "undo");
    expect(s.editor.parts[0].tape).toEqual(["grab"]);
    s = action(s, "redo");
    expect(period(s.editor.parts)).toBe(2);
    expect(cost(s.editor.parts)).toBe(C.PART_COSTS.arm);
  });
  test("illegal placement leaves original state untouched", () => {
    const s = place(open(initial(), "campaign", 0), "arm", 0, 0);
    const before = JSON.stringify(s);
    expect(() => place(s, "arm", 0, 0)).toThrow("Rule 4");
    expect(JSON.stringify(s)).toBe(before);
  });
  test("tapes trim and macros preserve cells after expansion", () => {
    let s = place(open(initial(), "campaign", 0), "arm", 0, 0);
    s = debug.setTapeCell(s, 1, 9, "grab");
    s = debug.setTapeCell(s, 1, 0, "rotate-cw");
    s = debug.setFocus(debug.setCursor(s, 1, 1), "tape");
    s = action(s, "ins-reset");
    expect(s.editor.parts[0].tape?.slice(0, 3)).toEqual([
      "rotate-cw",
      "drop",
      "rotate-ccw",
    ]);
    expect(s.editor.parts[0].tape?.[9]).toBe("grab");
    s = debug.setTapeCell(s, 1, 9, null);
    expect(s.editor.parts[0].tape).toHaveLength(3);
  });
  test("all menu rows fit stage", () => {
    const s = debug.setScreen(initial(), "select");
    for (let i = 0; i < courses.campaign.length; i++) {
      const r = menuItemRect(s, i)!;
      expect(r.y + r.h).toBeLessThan(C.STAGE_H);
    }
  });
  test("solution serialization round trip", () => {
    const s = loadSolution(
      open(initial(), "extras", 3),
      reference("extras", 3),
    );
    expect(readSolution(loadSolution(s, readSolution(s)))).toEqual(
      readSolution(s),
    );
  });
  test("reset clears progress but leaves mute", () => {
    let s = advance(
      start(
        loadSolution(open(initial(), "campaign", 0), reference("campaign", 0)),
      ),
      600,
    );
    s = { ...s, muted: true };
    expect(debug.reset(s)).toEqual({ ...initial(), muted: true });
  });
  test("engine advances actual game, diagnostics and audio", async () => {
    const e = await engine();
    const cues: string[] = [];
    e.events.on("cue:played", (v) => cues.push(v.cue));
    e.apply((s) => debug.openChallenge(s, "campaign", 0));
    e.apply((s) => debug.loadSolution(s, reference("campaign", 0)));
    e.apply((s) => debug.startRun(s));
    e.apply((s) => debug.setSpeed(s, 3));
    await e.advance(100);
    expect(e.state.sim!.status).toBe("complete");
    expect(cues).toContain(C.CUES.complete);
    expect(cues).toContain(C.CUES.constellation);
    expect(
      e
        .diagnostics()
        .some((d) => d.name === "status" && d.value === "complete"),
    ).toBe(true);
    expect(e.state.simTime).toBeCloseTo(100 / 60);
    e.destroy();
  });
});

describe("document and editor edge cases", () => {
  test("disconnected molecule is rejected", () => {
    const c = {
      name: "Broken",
      reagents: [
        {
          motes: [
            { q: 0, r: 0, type: "dust" as const },
            { q: 1, r: 0, type: "dust" as const },
          ],
          filaments: [],
          repeat: null,
        },
      ],
      products: [single("dust")],
      permitted: ["arm" as const],
      target: 6,
    };
    expect(() => loadChallenge(initial(), c)).toThrow("connected");
  });
  test("duplicate links and overlapping repeats are rejected", () => {
    const p = {
      motes: [
        { q: 0, r: 0, type: "dust" as const },
        { q: 1, r: 0, type: "dust" as const },
      ],
      filaments: [{ a: { q: 0, r: 0 }, b: { q: 1, r: 0 }, weight: 1 }],
      repeat: null,
    };
    const c = {
      name: "Links",
      reagents: [p],
      products: [single("dust")],
      permitted: ["arm" as const],
      target: 6,
    };
    expect(() =>
      loadChallenge(initial(), {
        ...c,
        reagents: [{ ...p, filaments: [...p.filaments, ...p.filaments] }],
      }),
    ).toThrow("Duplicate");
  });
  test("track laying is one undoable gesture", () => {
    let s = open(initial(), "extras", 9);
    s = debug.placeTrack(s, 0, 0);
    const a = xy({ q: 0, r: 0 }),
      b = xy({ q: 1, r: 0 }),
      c = xy({ q: 1, r: 1 });
    s = pointer(s, "down", a.x, a.y);
    s = pointer(s, "move", b.x, b.y);
    s = pointer(s, "move", c.x, c.y);
    s = pointer(s, "move", b.x, b.y);
    s = pointer(s, "up");
    expect(s.editor.parts[0].cells).toEqual([
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ]);
    expect(s.editor.undo).toHaveLength(1);
    s = action(s, "undo");
    expect(s.editor.parts[0].cells).toHaveLength(1);
  });
  test("reset macro walks back on an open track", () => {
    let s = open(initial(), "extras", 9);
    s = debug.placeTrack(s, 0, 0);
    s = debug.extendTrack(s, 1, 1, 0);
    s = debug.extendTrack(s, 1, 2, 0);
    s = debug.placePart(s, "arm", 0, 0, 0);
    s = debug.setTapeCell(s, 2, 0, "advance");
    s = debug.setTapeCell(s, 2, 1, "advance");
    s = debug.setFocus(debug.setCursor(s, 2, 2), "tape");
    s = action(s, "ins-reset");
    expect(s.editor.parts[1].tape).toEqual([
      "advance",
      "advance",
      "drop",
      "recede",
      "recede",
    ]);
  });
  test("illegal translated release preserves legal rotation", () => {
    let s = open(initial(), "campaign", 0);
    s = place(s, "arm", 0, 0);
    s = place(s, "arm", 1, 0);
    const a = xy({ q: 0, r: 0 }),
      b = xy({ q: 1, r: 0 });
    s = pointer(s, "down", a.x, a.y);
    s = action(s, "part-cw");
    s = pointer(s, "move", b.x, b.y);
    s = pointer(s, "up");
    expect(s.editor.parts[0].q).toBe(0);
    expect(s.editor.parts[0].rotation).toBe(1);
  });
  test("menu activation needs matching press and release", () => {
    let s = initial();
    const a = menuItemRect(s, 0)!,
      b = menuItemRect(s, 1)!;
    s = pointer(s, "down", a.x + 10, a.y + 10);
    s = pointer(s, "move", b.x + 10, b.y + 10);
    s = pointer(s, "up");
    expect(s.screen).toBe("title");
    expect(s.menuIndex).toBe(1);
    s = pointer(s, "down", b.x + 10, b.y + 10);
    s = pointer(s, "up");
    expect(s.mode).toBe("extras");
    expect(s.screen).toBe("select");
  });
  test("sessions stash machines separately", () => {
    let s = open(initial(), "campaign", 0);
    s = place(s, "arm", 0, 0);
    s = action(s, "back");
    expect(s.campaignMachines[0]).toHaveLength(1);
    s = action(s, "confirm");
    expect(s.editor.parts).toHaveLength(1);
    expect(s.editor.undo).toEqual([]);
  });
  test("step starts paused and advances exactly one boundary", () => {
    let s = loadSolution(
      open(initial(), "campaign", 0),
      reference("campaign", 0),
    );
    s = action(s, "step");
    expect(s.sim!.cycle).toBe(0);
    expect(s.sim!.status).toBe("paused");
    s = action(s, "step");
    expect(s.sim!.cycle).toBe(1);
    expect(s.sim!.status).toBe("paused");
    s = action(s, "back");
    expect(s.sim).toBeNull();
  });
  test("live solution replacement initializes all poses once", () => {
    let s = start(
      loadSolution(open(initial(), "campaign", 0), reference("campaign", 0)),
    );
    s = debug.loadSolution(s, reference("campaign", 0));
    expect(s.sim!.poses).toHaveLength(1);
    expect(s.sim!.poses[0].length).toBe(2);
  });
});
