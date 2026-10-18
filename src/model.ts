/** State construction, document loading, and explicit debug poses. These operations never advance a clock or emit sound. */
import { validateChallenge } from "./validation";
import type {
  OrreryState,
  EditorState,
  PartState,
  PartKind,
  Challenge,
  Mode,
  TapeCell,
  SimState,
  Screen,
} from "./game";
import * as C from "./constants";
import { courses, reference, type Solution } from "./content";
import {
  mechanism,
  arm,
  validateParts,
  same,
  add,
  sub,
  adjacent,
  spokes,
  tip,
} from "./geometry";
import { start, spawn, remove, restPose } from "./simulation";
export const emptyEditor = (): EditorState => ({
  parts: [],
  nextId: 1,
  selected: null,
  focus: "field",
  cursor: null,
  drag: null,
  undo: [],
  redo: [],
});
export function initial(): OrreryState {
  return {
    screen: "title",
    mode: "campaign",
    menuIndex: 0,
    titleIndex: 0,
    selectIndex: 0,
    howtoPage: 0,
    unlockedCount: 1,
    campaignSolved: [],
    extrasSolved: [],
    campaignRecords: courses.campaign.map(() => null),
    extrasRecords: courses.extras.map(() => null),
    campaignMachines: courses.campaign.map(() => null),
    extrasMachines: courses.extras.map(() => null),
    campaignLast: 0,
    extrasLast: 0,
    challenge: null,
    challengeRef: null,
    editor: emptyEditor(),
    sim: null,
    pointer: { x: 0, y: 0, down: false },
    completion: true,
    simTime: 0,
    muted: false,
  };
}
export function integer(n: number, min = 0, max = Infinity) {
  if (!Number.isInteger(n) || n < min || n > max)
    throw Error(`Expected integer ${min}..${max}`);
}
export function challenge(s: OrreryState): Challenge {
  if (!s.challenge) throw Error("No challenge open");
  return s.challenge;
}
export function live(s: OrreryState): SimState {
  if (!s.sim) throw Error("No live run");
  return s.sim;
}
export function part(s: OrreryState, id: number): PartState {
  const p = s.editor.parts.find((p) => p.id === id);
  if (!p) throw Error("Unknown part " + id);
  return p;
}
export function changeParts(
  s: OrreryState,
  parts: readonly PartState[],
): OrreryState {
  validateParts(parts, challenge(s));
  return {
    ...s,
    editor: {
      ...s.editor,
      parts,
      selected: parts.some((p) => p.id === s.editor.selected)
        ? s.editor.selected
        : null,
      cursor: parts.some((p) => p.id === s.editor.cursor?.part)
        ? s.editor.cursor
        : null,
    },
  };
}
export function editPart(
  s: OrreryState,
  id: number,
  patch: Partial<PartState>,
): OrreryState {
  part(s, id);
  return changeParts(
    s,
    s.editor.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  );
}
export function place(
  s: OrreryState,
  kind: PartKind,
  q: number,
  r: number,
  rotation = 0,
  index: number | null = null,
): OrreryState {
  challenge(s);
  integer(rotation, 0, 5);
  if (!C.PARTS.includes(kind)) throw Error("Unknown part");
  integer(q, -C.FIELD_R, C.FIELD_R);
  integer(r, -C.FIELD_R, C.FIELD_R);
  const p: PartState = {
    id: s.editor.nextId,
    kind,
    q,
    r,
    rotation,
    length: 1,
    cells: kind === "track" ? [{ q, r }] : null,
    closed: kind === "track" ? false : null,
    index,
    tape: mechanism(kind) ? [] : null,
  };
  let next = changeParts(s, [...s.editor.parts, p]);
  next = { ...next, editor: { ...next.editor, nextId: p.id + 1 } };
  if (next.sim && mechanism(kind)) {
    let sim: SimState = {
      ...next.sim,
      poses: [...next.sim.poses, restPose(p)],
    };
    if (kind === "wheel")
      C.WHEEL_MOTES.forEach((t, d) => {
        sim = spawn(sim, tip(p, (d + rotation) % 6, 1), t, p.id);
      });
    next = { ...next, sim };
  }
  return next;
}
export function removePart(s: OrreryState, id: number): OrreryState {
  part(s, id);
  let next = changeParts(
    s,
    s.editor.parts.filter((p) => p.id !== id),
  );
  if (next.sim) {
    let sim = remove(
      next.sim,
      next.sim.motes.filter((m) => m.wheel === id).map((m) => m.id),
    );
    sim = {
      ...sim,
      poses: sim.poses.filter((p) => p.part !== id),
      grips: sim.grips.filter((g) => g.part !== id),
    };
    next = { ...next, sim };
  }
  return next;
}
export function movePart(s: OrreryState, id: number, q: number, r: number) {
  const p = part(s, id),
    off = sub({ q, r }, p);
  return editPart(s, id, {
    q,
    r,
    cells: p.cells?.map((h) => add(h, off)) ?? null,
  });
}
export function tape(
  s: OrreryState,
  id: number,
  col: number,
  instruction: TapeCell,
): OrreryState {
  const p = part(s, id);
  if (!p.tape) throw Error("No tape");
  integer(col);
  if (instruction !== null && !C.INSTRUCTIONS.includes(instruction))
    throw Error("Unknown instruction");
  const t = [...p.tape];
  while (t.length <= col) t.push(null);
  t[col] = instruction;
  while (t.length && t[t.length - 1] === null) t.pop();
  return editPart(s, id, { tape: t });
}
export function loadChallenge(s: OrreryState, input: Challenge): OrreryState {
  const c = validateChallenge(input);
  return {
    ...s,
    screen: "editor",
    challenge: {
      ...c,
      reagents: c.reagents.map((m) => ({ ...m, repeat: m.repeat ?? null })),
      products: c.products.map((m) => ({ ...m, repeat: m.repeat ?? null })),
    },
    challengeRef: null,
    editor: emptyEditor(),
    sim: null,
    howtoPage: 0,
  };
}
export function open(s: OrreryState, mode: Mode, index: number): OrreryState {
  integer(index, 0, courses[mode].length - 1);
  return {
    ...loadChallenge(s, courses[mode][index]),
    mode,
    challengeRef: { mode, index },
  };
}
export function screen(s: OrreryState, name: Screen): OrreryState {
  if (!["title", "select", "howto", "editor"].includes(name))
    throw Error("Invalid screen");
  if (name === "editor") {
    challenge(s);
    return { ...s, screen: name };
  }
  let n = s;
  if (s.challengeRef) {
    const { mode, index } = s.challengeRef,
      a = [...s[`${mode}Machines`]];
    a[index] = s.editor.parts;
    n = { ...n, [`${mode}Machines`]: a };
  }
  return {
    ...n,
    screen: name,
    challenge: null,
    challengeRef: null,
    editor: emptyEditor(),
    sim: null,
    menuIndex: name === "title" ? s.titleIndex : 0,
    selectIndex: s[`${s.mode}Last`],
    howtoPage: 0,
  };
}
export function loadSolution(s: OrreryState, solution: Solution): OrreryState {
  challenge(s);
  if (!solution || !Array.isArray(solution.parts))
    throw Error("Solution needs parts");
  let cleared = s;
  for (const p of s.editor.parts) cleared = removePart(cleared, p.id);
  let n = { ...cleared, editor: { ...emptyEditor(), nextId: s.editor.nextId } };
  for (const p of solution.parts) {
    if (
      !s.challenge!.permitted.includes(p.kind) &&
      p.kind !== "rise" &&
      p.kind !== "set"
    )
      throw Error("Part not permitted");
    if (
      p.kind === "track" &&
      (!p.cells?.length || typeof p.closed !== "boolean")
    )
      throw Error("Track needs cells and closed flag");
    if (mechanism(p.kind) && !Array.isArray(p.tape))
      throw Error("Mechanism needs tape");
    const h = p.kind === "track" ? p.cells![0] : { q: p.q!, r: p.r! };
    n = place(n, p.kind, h.q, h.r, p.rotation ?? 0, p.index ?? null);
    const id = n.editor.nextId - 1;
    if (p.kind === "track")
      n = editPart(n, id, { cells: p.cells, closed: p.closed });
    if (mechanism(p.kind)) {
      integer(p.length!, 1, p.kind === "wheel" ? 1 : 3);
      n = editPart(n, id, { length: p.length, tape: [] });
      p.tape!.forEach((v: TapeCell, i: number) => {
        n = tape(n, id, i, v);
      });
    }
  }
  if (n.sim)
    n = {
      ...n,
      sim: {
        ...n.sim,
        poses: n.editor.parts.filter((p) => mechanism(p.kind)).map(restPose),
      },
    };
  return n;
}
export function readSolution(s: OrreryState): Solution {
  challenge(s);
  return {
    parts: s.editor.parts.map((p) =>
      p.kind === "track"
        ? { kind: p.kind, cells: p.cells!, closed: p.closed! }
        : mechanism(p.kind)
          ? {
              kind: p.kind,
              q: p.q,
              r: p.r,
              rotation: p.rotation,
              length: p.length,
              tape: p.tape!,
            }
          : p.kind === "rise" || p.kind === "set"
            ? {
                kind: p.kind,
                q: p.q,
                r: p.r,
                rotation: p.rotation,
                index: p.index!,
              }
            : { kind: p.kind, q: p.q, r: p.r, rotation: p.rotation },
    ),
  };
}
export const baseDebug = {
  version: C.ORRERY_DEBUG_VERSION,
  reset: (s: OrreryState) => ({ ...initial(), muted: s.muted }),
  reconcile: (s: OrreryState) => s,
  setCompletion: (s: OrreryState, completion: boolean) => {
    if (typeof completion !== "boolean") throw Error("Expected boolean");
    return { ...s, completion };
  },
  setScreen: screen,
  setMode: (s: OrreryState, mode: Mode) => {
    if (!courses[mode]) throw Error("Invalid mode");
    return { ...s, mode };
  },
  setMenuIndex: (s: OrreryState, menuIndex: number) => {
    integer(
      menuIndex,
      0,
      s.screen === "title" ? 2 : s.screen === "howto" ? 0 : 2,
    );
    return { ...s, menuIndex };
  },
  setSelectIndex: (s: OrreryState, selectIndex: number) => {
    integer(selectIndex, 0, courses[s.mode].length - 1);
    return { ...s, selectIndex };
  },
  setHowtoPage: (s: OrreryState, howtoPage: number) => {
    integer(howtoPage, 0, C.HOWTO_PAGES - 1);
    return { ...s, howtoPage };
  },
  setUnlockedCount: (s: OrreryState, unlockedCount: number) => {
    integer(unlockedCount, 1, courses.campaign.length);
    return { ...s, unlockedCount };
  },
  setSolved: (s: OrreryState, mode: Mode, index: number, solved: boolean) => {
    integer(index, 0, courses[mode].length - 1);
    return {
      ...s,
      [`${mode}Solved`]: [
        ...new Set([
          ...s[`${mode}Solved`].filter((n) => n !== index),
          ...(solved ? [index] : []),
        ]),
      ].sort((a, b) => a - b),
    };
  },
  setRecord: (
    s: OrreryState,
    mode: Mode,
    index: number,
    metric: "cost" | "cycles" | "area",
    value: number,
  ) => {
    integer(index, 0, courses[mode].length - 1);
    integer(value);
    if (!["cost", "cycles", "area"].includes(metric))
      throw Error("Invalid metric");
    const a = [...s[`${mode}Records`]];
    a[index] = {
      ...(a[index] ?? { cost: 0, cycles: 0, area: 0 }),
      [metric]: value,
    };
    return { ...s, [`${mode}Records`]: a };
  },
  setLast: (s: OrreryState, mode: Mode, index: number) => {
    integer(index, 0, courses[mode].length - 1);
    return { ...s, [`${mode}Last`]: index };
  },
  openChallenge: open,
  loadChallenge,
  referenceSolution: (_s: OrreryState, mode: Mode, index: number) =>
    reference(mode, index),
  clearMachine: (s: OrreryState) => {
    challenge(s);
    let n = s;
    for (const p of s.editor.parts) n = removePart(n, p.id);
    return { ...n, editor: { ...emptyEditor(), nextId: s.editor.nextId } };
  },
  placePart: (
    s: OrreryState,
    k: PartKind,
    q: number,
    r: number,
    rotation: number,
  ) => {
    if (["track", "rise", "set"].includes(k))
      throw Error("Use dedicated placement");
    return place(s, k, q, r, rotation);
  },
  placeRise: (
    s: OrreryState,
    i: number,
    q: number,
    r: number,
    rotation: number,
  ) => place(s, "rise", q, r, rotation, i),
  placeSet: (
    s: OrreryState,
    i: number,
    q: number,
    r: number,
    rotation: number,
  ) => place(s, "set", q, r, rotation, i),
  placeTrack: (s: OrreryState, q: number, r: number) => place(s, "track", q, r),
  extendTrack: (s: OrreryState, id: number, q: number, r: number) => {
    const p = part(s, id);
    if (!p.cells || p.closed) throw Error("Not an open track");
    return editPart(s, id, { cells: [...p.cells, { q, r }] });
  },
  closeTrack: (s: OrreryState, id: number) => {
    if (!part(s, id).cells) throw Error("Not track");
    return editPart(s, id, { closed: true });
  },
  removePart,
  setPartRotation: (s: OrreryState, id: number, rotation: number) => {
    integer(rotation, 0, 5);
    if (part(s, id).kind === "track") throw Error("Track has no rotation");
    return editPart(s, id, { rotation });
  },
  setPartLength: (s: OrreryState, id: number, length: number) => {
    if (!arm(part(s, id).kind)) throw Error("Part has no length");
    integer(length, 1, 3);
    return editPart(s, id, { length });
  },
  movePart,
  setTapeCell: tape,
  loadSolution,
  readSolution,
  setSelected: (s: OrreryState, id: number | null) => {
    if (id !== null) part(s, id);
    return { ...s, editor: { ...s.editor, selected: id } };
  },
  setFocus: (s: OrreryState, focus: "field" | "tape") => {
    if (focus !== "field" && focus !== "tape") throw Error("Invalid focus");
    return { ...s, editor: { ...s.editor, focus } };
  },
  setCursor: (s: OrreryState, id: number | null, col: number) => {
    integer(col);
    if (id !== null && !part(s, id).tape) throw Error("No tape");
    return {
      ...s,
      editor: { ...s.editor, cursor: id === null ? null : { part: id, col } },
    };
  },
  startRun: start,
  stopRun: (s: OrreryState) => {
    live(s);
    return { ...s, sim: null };
  },
  setPaused: (s: OrreryState, paused: boolean) => {
    if (typeof paused !== "boolean") throw Error("Expected boolean");
    const sim = live(s);
    if (!["running", "paused"].includes(sim.status)) throw Error("Run halted");
    return {
      ...s,
      sim: {
        ...sim,
        status: paused ? ("paused" as const) : ("running" as const),
      },
    };
  },
  setSpeed: (s: OrreryState, speed: number) => {
    integer(speed, 0, 3);
    return { ...s, sim: { ...live(s), speed } };
  },
  setCycle: (s: OrreryState, cycle: number) => {
    integer(cycle);
    return { ...s, sim: { ...live(s), cycle } };
  },
  setTally: (s: OrreryState, index: number, n: number) => {
    integer(index, 0, live(s).tallies.length - 1);
    integer(n);
    return {
      ...s,
      sim: {
        ...live(s),
        tallies: live(s).tallies.map((v, i) => (i === index ? n : v)),
      },
    };
  },
  clearMotes: (s: OrreryState) => ({
    ...s,
    sim: { ...live(s), motes: [], grips: [], filaments: [] },
  }),
  spawnMote: (
    s: OrreryState,
    q: number,
    r: number,
    t: (typeof C.MOTES)[number],
  ) => {
    integer(q, -Infinity);
    integer(r, -Infinity);
    if (!C.MOTES.includes(t) || live(s).motes.some((m) => same(m, { q, r })))
      throw Error("Invalid mote");
    return { ...s, sim: spawn(live(s), { q, r }, t) };
  },
  removeMote: (s: OrreryState, id: number) => {
    if (!live(s).motes.some((m) => m.id === id)) throw Error("Unknown mote");
    return { ...s, sim: remove(live(s), [id]) };
  },
  linkMotes: (s: OrreryState, a: number, b: number, weight: number) => {
    const sim = live(s),
      u = sim.motes.find((m) => m.id === a),
      v = sim.motes.find((m) => m.id === b);
    if (
      !u ||
      !v ||
      u.wheel !== null ||
      v.wheel !== null ||
      !adjacent(u, v) ||
      ![1, 3].includes(weight) ||
      sim.filaments.some(
        (f) => (f.a === a && f.b === b) || (f.a === b && f.b === a),
      )
    )
      throw Error("Invalid link");
    return {
      ...s,
      sim: { ...sim, filaments: [...sim.filaments, { a, b, weight }] },
    };
  },
  unlinkMotes: (s: OrreryState, a: number, b: number) => {
    const sim = live(s),
      filaments = sim.filaments.filter(
        (f) => !((f.a === a && f.b === b) || (f.a === b && f.b === a)),
      );
    if (filaments.length === sim.filaments.length) throw Error("No link");
    return { ...s, sim: { ...sim, filaments } };
  },
  setGrip: (s: OrreryState, id: number, spoke: number, mote: number) => {
    const sim = live(s),
      p = part(s, id),
      pose = sim.poses.find((p) => p.part === id),
      m = sim.motes.find((m) => m.id === mote);
    if (
      !pose ||
      !arm(p.kind) ||
      !spokes(p.kind, pose.rotation).includes(spoke) ||
      !m ||
      m.wheel !== null ||
      !same(m, tip(pose.cell, spoke, pose.length))
    )
      throw Error("Invalid grip");
    return {
      ...s,
      sim: {
        ...sim,
        grips: [
          ...sim.grips.filter((g) => g.part !== id || g.spoke !== spoke),
          { part: id, spoke, mote },
        ],
      },
    };
  },
  releaseGrip: (s: OrreryState, id: number, spoke: number) => {
    const p = part(s, id),
      sim = live(s),
      pose = sim.poses.find((p) => p.part === id);
    if (!pose || !arm(p.kind) || !spokes(p.kind, pose.rotation).includes(spoke))
      throw Error("Invalid gripper");
    return {
      ...s,
      sim: {
        ...sim,
        grips: sim.grips.filter((g) => g.part !== id || g.spoke !== spoke),
      },
    };
  },
  setPoseRotation: (s: OrreryState, id: number, rotation: number) => {
    integer(rotation, 0, 5);
    if (!live(s).poses.some((p) => p.part === id)) throw Error("No pose");
    return {
      ...s,
      sim: {
        ...live(s),
        poses: live(s).poses.map((p) =>
          p.part === id ? { ...p, rotation } : p,
        ),
      },
    };
  },
  setPoseLength: (s: OrreryState, id: number, length: number) => {
    integer(length, 1, 3);
    if (!arm(part(s, id).kind)) throw Error("No length");
    return {
      ...s,
      sim: {
        ...live(s),
        poses: live(s).poses.map((p) => (p.part === id ? { ...p, length } : p)),
      },
    };
  },
  setPoseCell: (s: OrreryState, id: number, q: number, r: number) => {
    const sim = live(s),
      p = sim.poses.find((p) => p.part === id);
    if (
      !p ||
      !s.editor.parts.some(
        (t) =>
          t.cells?.some((h) => same(h, p.cell)) &&
          t.cells.some((h) => same(h, { q, r })),
      )
    )
      throw Error("Not mounted");
    return {
      ...s,
      sim: {
        ...sim,
        poses: sim.poses.map((p) =>
          p.part === id ? { ...p, cell: { q, r } } : p,
        ),
      },
    };
  },
};
