/** Axial geometry and placement legality shared by the editor, simulator, and document validation. */
import * as C from "./constants";
import type { Hex, PartState, PartKind, Challenge } from "./game";
export const mod = (n: number) => ((n % 6) + 6) % 6;
export const same = (a: Hex, b: Hex) => a.q === b.q && a.r === b.r;
export const key = (a: Hex) => `${a.q},${a.r}`;
export const add = (a: Hex, b: Hex): Hex => ({ q: a.q + b.q, r: a.r + b.r });
export const sub = (a: Hex, b: Hex): Hex => ({ q: a.q - b.q, r: a.r - b.r });
export function rotate(h: Hex, n: number): Hex {
  let { q, r } = h;
  for (let i = 0; i < mod(n); i++) [q, r] = [-r, q + r];
  return { q, r };
}
export const xy = (h: Hex) => ({
  x: C.FIELD_CX + C.HEX_PITCH * (h.q + h.r / 2),
  y: C.FIELD_CY + ((C.HEX_PITCH * Math.sqrt(3)) / 2) * h.r,
});
export const onField = (h: Hex) =>
  Math.max(Math.abs(h.q), Math.abs(h.r), Math.abs(h.q + h.r)) <= C.FIELD_R;
export const adjacent = (a: Hex, b: Hex) =>
  C.DIRS.some(([q, r]) => a.q + q === b.q && a.r + r === b.r);
export const field: Hex[] = [];
for (let r = -C.FIELD_R; r <= C.FIELD_R; r++)
  for (let q = -C.FIELD_R; q <= C.FIELD_R; q++)
    if (onField({ q, r })) field.push({ q, r });
export function target(x: number, y: number): Hex | null {
  let best: Hex | null = null,
    d = C.HEX_HIT_R ** 2 + 1e-8;
  for (const h of field) {
    const p = xy(h),
      e = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (e < d - 1e-8) {
      d = e;
      best = h;
    }
  }
  return best;
}
export const mechanism = (k: PartKind) =>
  ["arm", "biarm", "triarm", "hexarm", "piston", "wheel"].includes(k);
export const arm = (k: PartKind) => mechanism(k) && k !== "wheel";
export const spokes = (k: PartKind, r: number) =>
  (k === "hexarm" || k === "wheel"
    ? [0, 1, 2, 3, 4, 5]
    : k === "biarm"
      ? [0, 3]
      : k === "triarm"
        ? [0, 2, 4]
        : [0]
  ).map((d) => mod(d + r));
export const tip = (cell: Hex, d: number, length: number): Hex => ({
  q: cell.q + C.DIRS[mod(d)][0] * length,
  r: cell.r + C.DIRS[mod(d)][1] * length,
});
export const localFoot: Partial<Record<PartKind, number[][]>> = {
  bind: [
    [0, 0],
    [1, 0],
  ],
  triune: [
    [0, 0],
    [1, 0],
  ],
  sunder: [
    [0, 0],
    [1, 0],
  ],
  mirror: [
    [0, 0],
    [1, 0],
  ],
  ascend: [
    [0, 0],
    [1, 0],
  ],
  manifold: [
    [0, 0],
    [1, 0],
    [-1, 1],
    [0, -1],
  ],
  conjoin: [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
  eclipse: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, -1],
  ],
  confluence: [
    [0, 0],
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ],
  dispersion: [
    [0, 0],
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ],
  void: [[0, 0], ...C.DIRS.map((x) => [...x])],
};
export function footprint(p: PartState, ch: Challenge): Hex[] {
  if (p.kind === "track") return [...p.cells!];
  let points: Hex[] = (localFoot[p.kind] ?? [[0, 0]]).map(([q, r]) => ({
    q,
    r,
  }));
  if (p.kind === "rise" || p.kind === "set") {
    const m = (p.kind === "rise" ? ch.reagents : ch.products)[p.index!];
    if (!m) throw Error("Unknown pattern index");
    points = m.motes.map(({ q, r }) => ({ q, r }));
    if (m.repeat) points.push(...m.motes.map((h) => add(h, m.repeat!.vector)));
  }
  return points.map((h) => add(rotate(h, p.rotation), p));
}
export function validateParts(
  parts: readonly PartState[],
  ch: Challenge,
): void {
  const sig = new Set<string>(),
    tracks = new Set<string>(),
    bases = new Set<string>(),
    rings = new Set<string>(),
    ports = new Set<string>();
  for (const p of parts) {
    if (
      !C.PARTS.includes(p.kind) ||
      !Number.isInteger(p.q) ||
      !Number.isInteger(p.r) ||
      !Number.isInteger(p.rotation) ||
      p.rotation < 0 ||
      p.rotation >= C.DIRS.length
    )
      throw Error("Invalid part pose");
    if (
      !Number.isInteger(p.length) ||
      p.length < C.ARM_MIN_LEN ||
      p.length > (arm(p.kind) ? C.ARM_MAX_LEN : 1)
    )
      throw Error("Invalid part length");
    if (
      p.kind === "track" &&
      (!p.cells?.length ||
        p.rotation !== 0 ||
        p.cells.some((h) => !Number.isInteger(h.q) || !Number.isInteger(h.r)))
    )
      throw Error("Rule 6: invalid track cells");
    if (
      (p.kind === "rise" || p.kind === "set") &&
      (!Number.isInteger(p.index) || p.index! < 0)
    )
      throw Error("Invalid pattern index");
    const f = footprint(p, ch);
    if (f.some((h) => !onField(h))) throw Error("Rule 1: outside field");
    if (p.kind === "track") {
      for (const h of f) {
        if (tracks.has(key(h))) throw Error("Rule 3: track overlap");
        tracks.add(key(h));
      }
      if (
        f.slice(1).some((h, i) => !adjacent(h, f[i])) ||
        (p.closed && (f.length < 3 || !adjacent(f[0], f[f.length - 1])))
      )
        throw Error("Rule 6: invalid path");
    } else if (mechanism(p.kind)) {
      if (bases.has(key(p))) throw Error("Rule 4: shared base");
      bases.add(key(p));
      if (p.kind === "wheel")
        for (const d of C.DIRS) {
          const h = key(add(p, { q: d[0], r: d[1] }));
          if (rings.has(h)) throw Error("Rule 4: shared ring");
          rings.add(h);
        }
    } else {
      for (const h of f) {
        if (sig.has(key(h))) throw Error("Rule 2: sigil overlap");
        sig.add(key(h));
      }
      if (p.kind === "rise" || p.kind === "set") {
        const k = p.kind + p.index;
        if (ports.has(k)) throw Error("Rule 5: duplicate aperture");
        ports.add(k);
      }
    }
  }
  for (const k of tracks) if (sig.has(k)) throw Error("Rule 2: track on sigil");
}
export const cost = (parts: readonly PartState[]) =>
  parts.reduce(
    (a, p) =>
      a + C.PART_COSTS[p.kind] * (p.kind === "track" ? p.cells!.length : 1),
    0,
  );
export const period = (parts: readonly PartState[]) =>
  Math.max(1, ...parts.map((p) => p.tape?.length ?? 0));
