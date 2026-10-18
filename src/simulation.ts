/** Pure cycle planning is shared by the sampled collision sweep and visual interpolation. Boundaries apply ordered sigil waves before deliveries and replenishment. */
import type {
  OrreryState,
  SimState,
  Hex,
  MoteState,
  PartState,
  Pose,
  FaultKind,
  MoteType,
} from "./game";
import * as C from "./constants";
import {
  add,
  sub,
  rotate,
  same,
  key,
  xy,
  tip,
  spokes,
  mechanism,
  period,
  cost,
  footprint,
  mod,
} from "./geometry";
export function component(sim: SimState, id: number): number[] {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of sim.filaments)
      if (ids.has(f.a) !== ids.has(f.b)) {
        ids.add(f.a);
        ids.add(f.b);
        changed = true;
      }
  }
  return [...ids];
}
export function remove(sim: SimState, ids: readonly number[]): SimState {
  return {
    ...sim,
    motes: sim.motes.filter((m) => !ids.includes(m.id)),
    filaments: sim.filaments.filter(
      (f) => !ids.includes(f.a) && !ids.includes(f.b),
    ),
    grips: sim.grips.filter((g) => !ids.includes(g.mote)),
  };
}
export function spawn(
  sim: SimState,
  h: Hex,
  type: MoteType,
  wheel: number | null = null,
): SimState {
  return {
    ...sim,
    nextMoteId: sim.nextMoteId + 1,
    motes: [...sim.motes, { ...h, type, id: sim.nextMoteId, wheel }],
  };
}
export const restPose = (p: PartState): Pose => ({
  part: p.id,
  rotation: p.rotation,
  length: p.length,
  cell: { q: p.q, r: p.r },
});
function bank(s: OrreryState, sim: SimState): SimState {
  const cells = [...sim.areaHexes, ...sim.motes];
  for (const p of sim.poses) {
    const part = s.editor.parts.find((a) => a.id === p.part)!;
    cells.push(
      ...spokes(part.kind, p.rotation).map((d) => tip(p.cell, d, p.length)),
    );
  }
  return {
    ...sim,
    areaHexes: [
      ...new Map(cells.map((h) => [key(h), { q: h.q, r: h.r }])).values(),
    ],
  };
}
export function boundary(s: OrreryState, initial: SimState): SimState {
  let sim = initial;
  const ch = s.challenge!;
  const at = (h: Hex) => sim.motes.find((m) => same(m, h));
  const loose = (m: MoteState | undefined) =>
    !!m &&
    m.wheel === null &&
    !sim.filaments.some((f) => f.a === m.id || f.b === m.id) &&
    !sim.grips.some((g) => g.mote === m.id);
  const real = (m: MoteState | undefined) =>
    m && m.wheel === null ? m : undefined;
  const change = (id: number, type: MoteType) => {
    sim = {
      ...sim,
      motes: sim.motes.map((m) => (m.id === id ? { ...m, type } : m)),
    };
  };
  const ordered = [...s.editor.parts].sort((a, b) => a.r - b.r || a.q - b.q);
  const waves = [
    [
      "wane",
      "mirror",
      "ascend",
      "conjoin",
      "eclipse",
      "confluence",
      "dispersion",
    ],
    ["bind", "manifold", "triune"],
    ["sunder"],
    ["void"],
  ];
  for (const wave of waves)
    for (const p of ordered.filter((p) => wave.includes(p.kind))) {
      const hs = footprint(p, ch),
        ms = hs.map(at),
        a = real(ms[0]),
        b = real(ms[1]);
      const consume = (ids: number[]) => {
        sim = remove(sim, ids);
      };
      const put = (i: number, t: MoteType) => {
        sim = spawn(sim, hs[i], t);
      };
      const rung = (m: MoteState | undefined) =>
        m ? C.PLANETS.indexOf(m.type as (typeof C.PLANETS)[number]) : -1;
      const essence = (m: MoteState | undefined) =>
        !!m && (C.ESSENCES as readonly string[]).includes(m.type);
      const bind = (
        u: MoteState | undefined,
        v: MoteState | undefined,
        w: number,
      ) => {
        if (
          u &&
          v &&
          !sim.filaments.some(
            (f) =>
              (f.a === u.id && f.b === v.id) || (f.a === v.id && f.b === u.id),
          )
        )
          sim = {
            ...sim,
            filaments: [...sim.filaments, { a: u.id, b: v.id, weight: w }],
          };
      };
      switch (p.kind) {
        case "wane":
          if (essence(a)) change(a!.id, "dust");
          break;
        case "mirror":
          if (essence(ms[0]) && b?.type === "dust") change(b.id, ms[0]!.type);
          break;
        case "ascend":
          if (
            loose(a) &&
            a!.type === "mercury" &&
            b &&
            rung(b) >= 0 &&
            rung(b) < 5
          ) {
            consume([a!.id]);
            change(b.id, C.PLANETS[rung(b) + 1]);
          }
          break;
        case "conjoin":
          if (
            loose(a) &&
            loose(b) &&
            a!.type === b!.type &&
            rung(a) >= 0 &&
            rung(a) < 5 &&
            !ms[2]
          ) {
            consume([a!.id, b!.id]);
            put(2, C.PLANETS[rung(a) + 1]);
          }
          break;
        case "eclipse":
          if (
            loose(a) &&
            loose(b) &&
            a!.type === "dust" &&
            b!.type === "dust" &&
            !ms[2] &&
            !ms[3]
          ) {
            consume([a!.id, b!.id]);
            put(2, "umbra");
            put(3, "lumen");
          }
          break;
        case "confluence":
          if (
            !ms[0] &&
            ms.slice(1).every(loose) &&
            C.ESSENCES.every((t) => ms.slice(1).some((m) => m!.type === t))
          ) {
            consume(ms.slice(1).map((m) => m!.id));
            put(0, "aether");
          }
          break;
        case "dispersion":
          if (
            loose(a) &&
            a!.type === "aether" &&
            ms.slice(1).every((m) => !m)
          ) {
            consume([a!.id]);
            C.ESSENCES.forEach((t, i) => put(i + 1, t));
          }
          break;
        case "bind":
          bind(a, b, 1);
          break;
        case "triune":
          if (a?.type === "nova" && b?.type === "nova") bind(a, b, 3);
          break;
        case "manifold":
          ms.slice(1).forEach((m) => bind(a, real(m), 1));
          break;
        case "sunder":
          if (a && b)
            sim = {
              ...sim,
              filaments: sim.filaments.filter(
                (f) =>
                  !(
                    (f.a === a.id && f.b === b.id) ||
                    (f.b === a.id && f.a === b.id)
                  ),
              ),
            };
          break;
        case "void":
          if (loose(a)) consume([a!.id]);
          break;
      }
    }
  for (const p of ordered.filter((p) => p.kind === "set")) {
    const m = ch.products[p.index!],
      transform = (h: Hex) => add(rotate(h, p.rotation), p),
      first = at(transform(m.motes[0]));
    if (!first || first.wheel !== null) continue;
    const ids = component(sim, first.id);
    if (sim.grips.some((g) => ids.includes(g.mote))) continue;
    const count = m.repeat ? ids.length / m.motes.length : 1;
    if (
      !Number.isInteger(count) ||
      (m.repeat && count < C.REPEAT_MIN) ||
      ids.length !== m.motes.length * count
    )
      continue;
    const expected: { h: Hex; type: MoteType }[] = [],
      links: { a: Hex; b: Hex; weight: number }[] = [];
    for (let i = 0; i < count; i++) {
      const off = m.repeat
        ? { q: m.repeat.vector.q * i, r: m.repeat.vector.r * i }
        : { q: 0, r: 0 };
      expected.push(
        ...m.motes.map((t) => ({ h: transform(add(t, off)), type: t.type })),
      );
      links.push(
        ...m.filaments.map((f) => ({
          a: transform(add(f.a, off)),
          b: transform(add(f.b, off)),
          weight: f.weight,
        })),
      );
      if (m.repeat && i < count - 1)
        links.push({
          a: transform(add(m.repeat.link.a, off)),
          b: transform(add(m.repeat.link.b, off)),
          weight: m.repeat.link.weight,
        });
    }
    if (
      !expected.every((e) => {
        const t = at(e.h);
        return t && ids.includes(t.id) && t.type === e.type;
      }) ||
      sim.filaments.filter((f) => ids.includes(f.a)).length !== links.length ||
      !links.every((l) => {
        const a = at(l.a),
          b = at(l.b);
        return (
          a &&
          b &&
          sim.filaments.some(
            (f) =>
              f.weight === l.weight &&
              ((f.a === a.id && f.b === b.id) ||
                (f.a === b.id && f.b === a.id)),
          )
        );
      })
    )
      continue;
    sim = remove(sim, ids);
    sim = {
      ...sim,
      tallies: sim.tallies.map((n, i) => (i === p.index ? n + count : n)),
    };
  }
  for (const p of ordered.filter((p) => p.kind === "rise")) {
    const m = ch.reagents[p.index!],
      transform = (h: Hex) => add(rotate(h, p.rotation), p);
    if (m.motes.some((h) => at(transform(h)))) continue;
    for (const t of m.motes) sim = spawn(sim, transform(t), t.type);
    for (const f of m.filaments)
      sim = {
        ...sim,
        filaments: [
          ...sim.filaments,
          {
            a: at(transform(f.a))!.id,
            b: at(transform(f.b))!.id,
            weight: f.weight,
          },
        ],
      };
  }
  sim = bank(s, sim);
  if (
    s.completion &&
    s.editor.parts.some((p) => p.kind === "set") &&
    sim.tallies.every((n) => n >= ch.target)
  )
    sim = {
      ...sim,
      status: "complete",
      fraction: 0,
      metrics: {
        cost: cost(s.editor.parts),
        cycles: sim.cycle + 1,
        area: sim.areaHexes.length,
      },
    };
  return sim;
}
export function start(s: OrreryState): OrreryState {
  if (!s.challenge) throw Error("No challenge");
  let sim: SimState = {
    status: "running",
    cycle: 0,
    fraction: 0,
    speed: C.DEFAULT_SPEED_INDEX,
    motes: [],
    nextMoteId: 1,
    filaments: [],
    poses: s.editor.parts.filter((p) => mechanism(p.kind)).map(restPose),
    grips: [],
    tallies: s.challenge.products.map(() => 0),
    areaHexes: s.editor.parts.flatMap((p) => footprint(p, s.challenge!)),
    fault: null,
    metrics: null,
  };
  for (const p of s.editor.parts.filter((p) => p.kind === "wheel"))
    C.WHEEL_MOTES.forEach((t, d) => {
      sim = spawn(sim, tip(p, mod(d + p.rotation), 1), t, p.id);
    });
  return { ...s, sim: boundary(s, sim) };
}
type Motion =
  | { kind: "still" }
  | { kind: "rotate"; center: Hex; direction: number }
  | { kind: "slide"; vector: Hex };
const still: Motion = { kind: "still" };
export interface CyclePlan {
  sim: SimState;
  poses: Pose[];
  motions: Map<number, Motion>;
  fault: { kind: FaultKind; parts: number[]; motes: number[] } | null;
}
export function plan(s: OrreryState): CyclePlan {
  let sim = s.sim!;
  const motions = new Map<number, Motion>(),
    poses: Pose[] = [];
  let fault: CyclePlan["fault"] = null;
  const P = period(s.editor.parts),
    ins = (p: PartState) => p.tape?.[sim.cycle % P] ?? null;
  for (const p of s.editor.parts.filter((p) => mechanism(p.kind))) {
    const pose = sim.poses.find((a) => a.part === p.id) ?? restPose(p),
      i = ins(p);
    let next = pose,
      m: Motion = still,
      err: FaultKind | null = null;
    if (i && p.kind === "wheel" && !["rotate-cw", "rotate-ccw"].includes(i))
      err = "impossible";
    else if (i === "extend" || i === "retract") {
      if (p.kind !== "piston") err = "impossible";
      else if (i === "extend" && pose.length === C.ARM_MAX_LEN)
        err = "overextended";
      else if (i === "retract" && pose.length === C.ARM_MIN_LEN)
        err = "overretracted";
      else {
        const n = i === "extend" ? 1 : -1;
        next = { ...pose, length: pose.length + n };
        m = {
          kind: "slide",
          vector: sub(tip(pose.cell, pose.rotation, n), pose.cell),
        };
      }
    } else if (i === "advance" || i === "recede") {
      const track = s.editor.parts.find(
        (t) => t.kind === "track" && t.cells!.some((h) => same(h, pose.cell)),
      );
      if (!track) err = "unmounted";
      else {
        const n =
          track.cells!.findIndex((h) => same(h, pose.cell)) +
          (i === "advance" ? 1 : -1);
        if (!track.closed && (n < 0 || n >= track.cells!.length))
          err = "track-end";
        else {
          const cell =
            track.cells![(n + track.cells!.length) % track.cells!.length];
          next = { ...pose, cell };
          m = { kind: "slide", vector: sub(cell, pose.cell) };
        }
      }
    } else if (i === "rotate-cw" || i === "rotate-ccw") {
      const direction = i === "rotate-cw" ? 1 : -1;
      next = { ...pose, rotation: mod(pose.rotation + direction) };
      m = { kind: "rotate", center: pose.cell, direction };
    }
    if (err && !fault) fault = { kind: err, parts: [p.id], motes: [] };
    poses.push(next);
    motions.set(-p.id, m);
  }
  if (fault) return { sim, poses, motions, fault };
  sim = {
    ...sim,
    grips: sim.grips.filter(
      (g) => ins(s.editor.parts.find((p) => p.id === g.part)!) !== "drop",
    ),
  };
  for (const p of s.editor.parts.filter((p) => ins(p) === "grab")) {
    const pose = sim.poses.find((a) => a.part === p.id)!;
    for (const spoke of spokes(p.kind, pose.rotation)) {
      const h = tip(pose.cell, spoke, pose.length),
        m = sim.motes.find((m) => same(m, h) && m.wheel === null);
      if (m && !sim.grips.some((g) => g.part === p.id && g.spoke === spoke))
        sim = {
          ...sim,
          grips: [...sim.grips, { part: p.id, spoke, mote: m.id }],
        };
    }
  }
  for (const mote of sim.motes) {
    if (mote.wheel !== null) {
      motions.set(mote.id, motions.get(-mote.wheel) ?? still);
      continue;
    }
    const ids = component(sim, mote.id),
      grips = sim.grips.filter((g) => ids.includes(g.mote));
    let selected: Motion | undefined;
    for (const g of grips) {
      const p = s.editor.parts.find((p) => p.id === g.part)!,
        i = ins(p);
      let m = motions.get(-g.part) ?? still;
      if (i === "pivot-cw" || i === "pivot-ccw")
        m = {
          kind: "rotate",
          center: {
            q: sim.motes.find((m) => m.id === g.mote)!.q,
            r: sim.motes.find((m) => m.id === g.mote)!.r,
          },
          direction: i === "pivot-cw" ? 1 : -1,
        };
      if (selected && JSON.stringify(selected) !== JSON.stringify(m)) {
        fault = {
          kind: "torn",
          parts: s.editor.parts
            .filter((p) => grips.some((g) => g.part === p.id))
            .map((p) => p.id),
          motes: ids.sort((a, b) => a - b),
        };
      }
      selected = m;
    }
    motions.set(mote.id, selected ?? still);
  }
  return { sim, poses, motions, fault };
}
function hexAt(h: Hex, m: Motion, t: number): Hex {
  if (m.kind === "still") return h;
  if (m.kind === "slide")
    return { q: h.q + m.vector.q * t, r: h.r + m.vector.r * t };
  if (t === 1) return add(rotate(sub(h, m.center), m.direction), m.center);
  const a = xy(h),
    b = xy(m.center),
    ang = ((m.direction * Math.PI) / 3) * t,
    x = b.x + (a.x - b.x) * Math.cos(ang) - (a.y - b.y) * Math.sin(ang),
    y = b.y + (a.x - b.x) * Math.sin(ang) + (a.y - b.y) * Math.cos(ang);
  const r = (y - C.FIELD_CY) / ((C.HEX_PITCH * Math.sqrt(3)) / 2);
  return { q: (x - C.FIELD_CX) / C.HEX_PITCH - r / 2, r };
}
export function drawnMotes(s: OrreryState) {
  if (!s.sim) return [];
  const p = plan(s);
  return s.sim.motes.map((m) => ({
    ...m,
    ...xy(hexAt(m, p.motions.get(m.id) ?? still, s.sim!.fraction)),
  }));
}
export function drawnPose(s: OrreryState, p: PartState): Pose {
  const pose = s.sim?.poses.find((a) => a.part === p.id) ?? restPose(p);
  if (!s.sim) return pose;
  const i = p.tape?.[s.sim.cycle % period(s.editor.parts)],
    t = s.sim.fraction;
  const planned = plan(s).poses.find((a) => a.part === p.id) ?? pose;
  return {
    ...pose,
    rotation:
      pose.rotation + (i === "rotate-cw" ? t : i === "rotate-ccw" ? -t : 0),
    length: pose.length + (planned.length - pose.length) * t,
    cell: {
      q: pose.cell.q + (planned.cell.q - pose.cell.q) * t,
      r: pose.cell.r + (planned.cell.r - pose.cell.r) * t,
    },
  };
}
export function advance(s: OrreryState, cycles: number): OrreryState {
  let sim = s.sim!;
  let left = cycles;
  while (left > 1e-10 && sim.status === "running") {
    const p = plan({ ...s, sim });
    if (p.fault) {
      sim = { ...sim, status: "faulted", fraction: 0, fault: p.fault };
      break;
    }
    const end = Math.min(1, sim.fraction + left);
    let collision = false;
    for (let k = 1; k <= C.COLLISION_SAMPLES; k++) {
      const t = k / C.COLLISION_SAMPLES;
      if (t <= sim.fraction + 1e-10 || t > end + 1e-10) continue;
      const positions = sim.motes.map((m) =>
          xy(hexAt(m, p.motions.get(m.id) ?? still, t)),
        ),
        ids = new Set<number>();
      for (let a = 0; a < positions.length; a++)
        for (let b = a + 1; b < positions.length; b++)
          if (
            Math.hypot(
              positions[a].x - positions[b].x,
              positions[a].y - positions[b].y,
            ) <
            2 * C.MOTE_COLLIDE_R
          ) {
            ids.add(sim.motes[a].id);
            ids.add(sim.motes[b].id);
          }
      if (ids.size) {
        sim = {
          ...p.sim,
          status: "faulted",
          fraction: t,
          fault: {
            kind: "collision",
            parts: [],
            motes: [...ids].sort((a, b) => a - b),
          },
        };
        collision = true;
        break;
      }
    }
    if (collision) break;
    left -= end - sim.fraction;
    if (end >= 1 - 1e-10) {
      sim = {
        ...p.sim,
        poses: p.poses,
        motes: sim.motes.map((m) => ({
          ...m,
          ...hexAt(m, p.motions.get(m.id) ?? still, 1),
        })),
        grips: p.sim.grips.map((g) => {
          const part = s.editor.parts.find((p) => p.id === g.part)!,
            i = part.tape?.[sim.cycle % period(s.editor.parts)];
          return {
            ...g,
            spoke: mod(
              g.spoke + (i === "rotate-cw" ? 1 : i === "rotate-ccw" ? -1 : 0),
            ),
          };
        }),
        fraction: 0,
      };
      sim = boundary(s, sim);
      if (sim.status === "running") sim = { ...sim, cycle: sim.cycle + 1 };
    } else sim = { ...p.sim, fraction: end };
  }
  let next = { ...s, sim };
  if (
    sim.status === "complete" &&
    s.sim?.status !== "complete" &&
    s.challengeRef
  ) {
    const { mode, index } = s.challengeRef,
      records = [...s[`${mode}Records`]],
      old = records[index],
      m = sim.metrics!;
    records[index] = old
      ? {
          cost: Math.min(old.cost, m.cost),
          cycles: Math.min(old.cycles, m.cycles),
          area: Math.min(old.area, m.area),
        }
      : m;
    next = {
      ...next,
      [`${mode}Records`]: records,
      [`${mode}Solved`]: [...new Set([...s[`${mode}Solved`], index])].sort(
        (a, b) => a - b,
      ),
      [`${mode}Last`]: index,
      menuIndex: 0,
      unlockedCount:
        mode === "campaign"
          ? Math.min(
              s.campaignRecords.length,
              Math.max(s.unlockedCount, index + 2),
            )
          : s.unlockedCount,
    };
  }
  return next;
}
