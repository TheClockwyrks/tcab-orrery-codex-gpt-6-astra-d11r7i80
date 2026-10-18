import type { Challenge, Molecule, Hex } from "./game";
import * as C from "./constants";
import {
  same,
  adjacent,
  add,
  sub,
  rotate,
  field,
  onField,
  key,
} from "./geometry";
function whole(n: number) {
  if (!Number.isInteger(n)) throw Error("Coordinates must be whole numbers");
}
function coordinate(h: Hex) {
  if (!h) throw Error("Missing hex");
  whole(h.q);
  whole(h.r);
}
function pattern(input: Molecule, product: boolean): Molecule {
  if (
    !input ||
    !Array.isArray(input.motes) ||
    !input.motes.length ||
    !Array.isArray(input.filaments)
  )
    throw Error("Molecule needs motes and filaments");
  const m = { ...input, repeat: input.repeat ?? null },
    cells = new Set<string>(),
    pairs = new Set<string>();
  for (const h of m.motes) {
    coordinate(h);
    if (!C.MOTES.includes(h.type)) throw Error("Unknown mote type");
    if (cells.has(key(h))) throw Error("Duplicate mote hex");
    cells.add(key(h));
  }
  for (const f of m.filaments) {
    coordinate(f.a);
    coordinate(f.b);
    if (
      ![1, 3].includes(f.weight) ||
      !adjacent(f.a, f.b) ||
      !cells.has(key(f.a)) ||
      !cells.has(key(f.b))
    )
      throw Error("Invalid filament endpoints or weight");
    const k = [key(f.a), key(f.b)].sort().join("/");
    if (pairs.has(k)) throw Error("Duplicate filament");
    pairs.add(k);
  }
  const connected = new Set([key(m.motes[0])]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of m.filaments)
      if (connected.has(key(f.a)) !== connected.has(key(f.b))) {
        connected.add(key(f.a));
        connected.add(key(f.b));
        changed = true;
      }
  }
  if (connected.size !== cells.size) throw Error("Molecule must be connected");
  let points: Hex[] = [...m.motes];
  if (m.repeat) {
    if (!product) throw Error("Reagents cannot repeat");
    const { vector, link } = m.repeat;
    coordinate(vector);
    coordinate(link.a);
    coordinate(link.b);
    if (
      same(vector, { q: 0, r: 0 }) ||
      !cells.has(key(link.a)) ||
      !cells.has(key(sub(link.b, vector))) ||
      !adjacent(link.a, link.b) ||
      ![1, 3].includes(link.weight)
    )
      throw Error("Invalid repeat link");
    const next = m.motes.map((h) => add(h, vector));
    if (next.some((h) => cells.has(key(h))))
      throw Error("Repeated patterns overlap");
    points = [...points, ...next];
  }
  if (
    !field.some((anchor) =>
      C.DIRS.some((_, rotation) =>
        points.every((h) => onField(add(rotate(h, rotation), anchor))),
      ),
    )
  )
    throw Error("Pattern does not fit field");
  return m;
}
export function validateChallenge(c: Challenge): Challenge {
  if (
    !c ||
    typeof c.name !== "string" ||
    !c.name.length ||
    c.name.length > C.NAME_MAX
  )
    throw Error("Invalid challenge name");
  if (!Number.isInteger(c.target) || c.target < 1)
    throw Error("Invalid target");
  if (
    !Array.isArray(c.reagents) ||
    !c.reagents.length ||
    !Array.isArray(c.products) ||
    !c.products.length ||
    !Array.isArray(c.permitted) ||
    !c.permitted.length ||
    c.permitted.length + c.reagents.length + c.products.length > C.TRAY_MAX
  )
    throw Error("Invalid challenge tray");
  if (
    new Set(c.permitted).size !== c.permitted.length ||
    c.permitted.some((k) => !C.PARTS.includes(k) || k === "rise" || k === "set")
  )
    throw Error("Invalid permitted kind");
  return structuredClone({
    ...c,
    reagents: c.reagents.map((m) => pattern(m, false)),
    products: c.products.map((m) => pattern(m, true)),
  });
}
