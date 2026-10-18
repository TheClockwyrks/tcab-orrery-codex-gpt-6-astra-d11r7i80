import rawExtras from "./extras.json";
import references from "./references.json";
import campaignReferences from "./campaign-references.json";
import type { Challenge, Molecule, MoteType, PartKind, TapeCell } from "./game";
import { CONSTELLATION_TARGET } from "./constants";
export const single = (type: MoteType): Molecule => ({
  motes: [{ q: 0, r: 0, type }],
  filaments: [],
  repeat: null,
});
export const extras: Challenge[] = rawExtras.map((c) => ({
  ...c,
  reagents: c.reagents.map((m) => ({ ...m, repeat: null })),
  products: c.products.map((m) => ({
    ...m,
    repeat: "repeat" in m ? m.repeat : null,
  })),
})) as Challenge[];
const named = (index: number, name: string): Challenge => ({
  ...extras[index],
  name,
});
const pair = (a: MoteType, b: MoteType): Molecule => ({
  motes: [
    { q: 0, r: 0, type: a },
    { q: 1, r: 0, type: b },
  ],
  filaments: [{ a: { q: 0, r: 0 }, b: { q: 1, r: 0 }, weight: 1 }],
  repeat: null,
});
const star: Molecule = {
  motes: [
    { q: 0, r: 0, type: "dust" },
    { q: 1, r: 0, type: "dust" },
    { q: -1, r: 1, type: "dust" },
    { q: 0, r: -1, type: "dust" },
  ],
  filaments: [
    { a: { q: 0, r: 0 }, b: { q: 1, r: 0 }, weight: 1 },
    { a: { q: 0, r: 0 }, b: { q: -1, r: 1 }, weight: 1 },
    { a: { q: 0, r: 0 }, b: { q: 0, r: -1 }, weight: 1 },
  ],
  repeat: null,
};
export const campaign: Challenge[] = [
  named(0, "The First Orbit"),
  {
    name: "Ashes of a Comet",
    reagents: [single("comet")],
    products: [single("dust")],
    permitted: ["arm", "wane"],
    target: CONSTELLATION_TARGET,
  },
  named(1, "A Bond Between Moons"),
  named(8, "Three Threads of Fire"),
  named(5, "The Joining of Worlds"),
  named(4, "A Silver Ladder"),
  {
    name: "Unweaving the Sky",
    reagents: [pair("dust", "sol")],
    products: [single("dust"), single("sol")],
    permitted: ["arm", "sunder"],
    target: CONSTELLATION_TARGET,
  },
  named(6, "A Study in Opposites"),
  named(3, "The Borrowed Flame"),
  named(7, "The Fifth Essence"),
  {
    name: "The Four Winds",
    reagents: [single("aether")],
    products: ["nebula", "comet", "nova", "meteor"].map((t) =>
      single(t as MoteType),
    ),
    permitted: ["arm", "dispersion"],
    target: CONSTELLATION_TARGET,
  },
  {
    name: "A Small Constellation",
    reagents: [single("dust")],
    products: [star],
    permitted: ["arm", "manifold"],
    target: CONSTELLATION_TARGET,
  },
  {
    name: "Many Hands of Heaven",
    reagents: [single("sol")],
    products: [single("sol")],
    permitted: ["arm", "biarm", "triarm", "hexarm"],
    target: CONSTELLATION_TARGET,
  },
  {
    name: "The Wandering Observatory",
    reagents: [single("luna")],
    products: [single("luna")],
    permitted: ["arm", "piston", "track"],
    target: CONSTELLATION_TARGET,
  },
  {
    name: "What the Night Keeps",
    reagents: [pair("dust", "sol")],
    products: [single("sol")],
    permitted: ["arm", "sunder", "void"],
    target: CONSTELLATION_TARGET,
  },
  {
    name: "The Great Instrument",
    reagents: [pair("comet", "sol")],
    products: [pair("dust", "sol")],
    permitted: ["arm", "piston", "track", "wane", "bind", "sunder"],
    target: CONSTELLATION_TARGET,
  },
];
export const courses = { campaign, extras };
export interface SolutionPart {
  kind: PartKind;
  q?: number;
  r?: number;
  rotation?: number;
  length?: number;
  tape?: readonly TapeCell[];
  index?: number;
  cells?: readonly { q: number; r: number }[];
  closed?: boolean;
}
export interface Solution {
  parts: readonly SolutionPart[];
}
export const shuttle: TapeCell[] = [
  "grab",
  "rotate-cw",
  "rotate-cw",
  "rotate-cw",
  "drop",
  "rotate-ccw",
  "rotate-ccw",
  "rotate-ccw",
];
export function reference(
  mode: "campaign" | "extras",
  index: number,
): Solution {
  const c = courses[mode][index];
  if (!c) throw Error("Challenge index out of bounds");
  return structuredClone(
    (mode === "campaign" ? campaignReferences : references)[index],
  ) as Solution;
}
