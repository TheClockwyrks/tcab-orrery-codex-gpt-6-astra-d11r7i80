/** Pointer gestures and keyboard verbs are value transitions. A whole drag or track lay commits one machine snapshot to history. */
import type { OrreryState, PartKind, TapeCell } from "./game";
import * as C from "./constants";
import { courses } from "./content";
import {
  target,
  footprint,
  same,
  mechanism,
  mod,
  arm,
  sub,
  add,
  adjacent,
  period,
} from "./geometry";
import {
  place,
  editPart,
  part,
  removePart,
  tape,
  open,
  screen,
  emptyEditor,
  changeParts,
} from "./model";
import { start, advance } from "./simulation";
export const pendingCues = new Set<string>();
export const tray = (
  s: OrreryState,
): { kind: PartKind; index: number | null }[] =>
  s.challenge
    ? [
        ...C.PARTS.filter((k) => s.challenge!.permitted.includes(k)).map(
          (kind) => ({ kind, index: null }),
        ),
        ...s.challenge.reagents.map((_, index) => ({
          kind: "rise" as const,
          index,
        })),
        ...s.challenge.products.map((_, index) => ({
          kind: "set" as const,
          index,
        })),
      ]
    : [];
export function history(
  before: OrreryState,
  after: OrreryState,
  parts = before.editor.parts,
): OrreryState {
  if (JSON.stringify(parts) === JSON.stringify(after.editor.parts))
    return after;
  return {
    ...after,
    editor: { ...after.editor, undo: [...before.editor.undo, parts], redo: [] },
  };
}
export function menuCount(s: OrreryState) {
  return s.screen === "title"
    ? 3
    : s.screen === "howto"
      ? 1
      : s.screen === "select"
        ? courses[s.mode].length
        : s.sim?.status === "complete"
          ? hasNext(s)
            ? 3
            : 2
          : 0;
}
export const hasNext = (s: OrreryState) =>
  !!s.challengeRef &&
  s.challengeRef.index + 1 < courses[s.challengeRef.mode].length;
export function menuItemRect(s: OrreryState, i: number) {
  if (!Number.isInteger(i) || i < 0 || i >= menuCount(s)) return null;
  if (s.screen === "title") return { x: 110, y: 380 + i * 58, w: 330, h: 46 };
  if (s.screen === "select") {
    const height = Math.min(46, 480 / courses[s.mode].length);
    return { x: 110, y: 160 + i * height, w: 1060, h: height - 4 };
  }
  if (s.screen === "howto") return { x: 110, y: 624, w: 280, h: 44 };
  return { x: 442, y: 336 + i * 52, w: 350, h: 44 };
}
export function enter(s: OrreryState, index: number): OrreryState {
  let n = screen(s, "select");
  n = open(n, s.mode, index);
  const parts = s[`${s.mode}Machines`][index] ?? [];
  return {
    ...n,
    [`${s.mode}Last`]: index,
    editor: {
      ...emptyEditor(),
      parts,
      nextId: Math.max(0, ...parts.map((p) => p.id)) + 1,
    },
  };
}
export function confirm(s: OrreryState): OrreryState {
  if (s.screen === "title") {
    const n = { ...s, titleIndex: s.menuIndex };
    return s.menuIndex === 2
      ? screen(n, "howto")
      : screen(
          { ...n, mode: s.menuIndex === 0 ? "campaign" : "extras" },
          "select",
        );
  }
  if (s.screen === "howto") return screen(s, "title");
  if (s.screen === "select")
    return s.mode === "campaign" && s.selectIndex >= s.unlockedCount
      ? s
      : enter(s, s.selectIndex);
  if (s.sim?.status === "complete") {
    const i = s.menuIndex + (hasNext(s) ? 0 : 1);
    return i === 0
      ? enter(s, s.challengeRef!.index + 1)
      : i === 1
        ? { ...s, sim: null }
        : screen(s, "select");
  }
  return s;
}
export function pointer(
  s: OrreryState,
  type: "down" | "move" | "up",
  x = s.pointer.x,
  y = s.pointer.y,
): OrreryState {
  let n: OrreryState = {
    ...s,
    pointer: {
      x,
      y,
      down: type === "down" ? true : type === "up" ? false : s.pointer.down,
    },
  };
  const count = menuCount(n);
  if (count) {
    let hit = -1;
    for (let i = 0; i < count; i++) {
      const r = menuItemRect(n, i)!;
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) hit = i;
    }
    if (hit >= 0)
      n =
        s.screen === "select"
          ? { ...n, selectIndex: hit }
          : { ...n, menuIndex: hit };
    if (type === "down") n = { ...n, menuPress: hit };
    if (type === "up") {
      if (hit >= 0 && s.menuPress === hit) n = confirm(n);
      n = { ...n, menuPress: null };
    }
    return n;
  }
  if (s.screen !== "editor") return n;
  const h = target(x, y),
    ed = n.editor;
  if (type === "down") {
    n = {
      ...n,
      editor: {
        ...ed,
        focus: x >= C.TRAY_REGION_W && y >= C.TAPE_Y0 ? "tape" : "field",
      },
    };
    if (n.sim) return n;
    if (x < C.TRAY_REGION_W && x >= C.TRAY_X0 && x < C.TRAY_X0 + C.TRAY_W) {
      const item = tray(n)[Math.floor((y - C.TRAY_Y0) / C.TRAY_SLOT_H)];
      if (
        item &&
        !n.editor.parts.some(
          (p) =>
            (item.kind === "rise" || item.kind === "set") &&
            p.kind === item.kind &&
            p.index === item.index,
        )
      )
        n = {
          ...n,
          editor: {
            ...n.editor,
            drag: {
              kind: "place",
              part: item.kind,
              index: item.index,
              rotation: 0,
              length: 1,
              at: null,
              before: ed.parts,
            },
          },
        };
    } else if (
      y >= C.TAPE_Y0 &&
      y < C.TAPE_Y0 + C.TAPE_ROWS_VISIBLE * C.TAPE_ROW_H &&
      x >= C.TRAY_REGION_W &&
      x < C.STAGE_W
    ) {
      if (
        x >= C.TRAY_REGION_W + C.TAPE_LABEL_W &&
        x < C.TRAY_REGION_W + C.TAPE_X0
      )
        return n;
      const rows = ed.parts.filter((p) => p.tape),
        firstRow = Math.max(
          0,
          rows.findIndex((p) => p.id === ed.cursor?.part) -
            (C.TAPE_ROWS_VISIBLE - 1),
        ),
        row = rows[firstRow + Math.floor((y - C.TAPE_Y0) / C.TAPE_ROW_H)];
      if (row) {
        const col =
          x < C.TRAY_REGION_W + C.TAPE_X0
            ? 0
            : Math.max(0, (ed.cursor?.col ?? 0) - (C.TAPE_COLS_VISIBLE - 1)) +
              Math.floor((x - C.TRAY_REGION_W - C.TAPE_X0) / C.TAPE_CELL_W);
        n = {
          ...n,
          editor: {
            ...n.editor,
            cursor: { part: row.id, col: Math.max(0, col) },
          },
        };
      }
    } else if (x >= C.TRAY_REGION_W && x < C.READOUT_X0 && y >= C.HEADING_H) {
      const p = h
        ? [...ed.parts]
            .sort(
              (a, b) =>
                Number(mechanism(b.kind)) - Number(mechanism(a.kind)) ||
                Number(b.kind === "track") - Number(a.kind === "track"),
            )
            .find((p) => footprint(p, n.challenge!).some((a) => same(a, h)))
        : null;
      n = {
        ...n,
        editor: {
          ...n.editor,
          selected: p?.id ?? null,
          cursor: p?.tape ? { part: p.id, col: 0 } : ed.cursor,
          drag:
            p && h
              ? p.kind === "track" &&
                !p.closed &&
                (same(h, p.cells![0]) || same(h, p.cells![p.cells!.length - 1]))
                ? {
                    kind: "lay",
                    part: p.id,
                    end:
                      p.cells!.length > 1 && same(h, p.cells![0])
                        ? "first"
                        : "last",
                    before: ed.parts,
                  }
                : {
                    kind: "move",
                    part: p.id,
                    from: h,
                    at: h,
                    rotation: p.rotation,
                    length: p.length,
                    before: ed.parts,
                  }
              : null,
        },
      };
    }
  }
  if (type === "move" && ed.drag) {
    const d = ed.drag;
    if (d.kind !== "lay")
      n = { ...n, editor: { ...n.editor, drag: { ...d, at: h } } };
    else if (h) {
      const p = part(n, d.part),
        cells = [...p.cells!];
      if (d.end === "first") cells.reverse();
      const last = cells[cells.length - 1];
      try {
        if (cells.length > 1 && same(h, cells[cells.length - 2])) cells.pop();
        else if (cells.length > 2 && same(h, cells[0]) && adjacent(last, h)) {
          n = editPart(n, p.id, { closed: true });
          n = history(
            s,
            { ...n, editor: { ...n.editor, drag: null } },
            d.before,
          );
          return n;
        } else if (adjacent(last, h) && !cells.some((a) => same(a, h)))
          cells.push(h);
        if (d.end === "first") cells.reverse();
        n = editPart(n, p.id, { cells, q: cells[0].q, r: cells[0].r });
      } catch {
        /* Illegal extensions leave the path intact. */
      }
    }
  }
  if (type === "up" && ed.drag) {
    const d = ed.drag;
    try {
      if (d.kind === "place" && h) {
        n = place(n, d.part, h.q, h.r, d.rotation, d.index);
        const id = n.editor.nextId - 1;
        n = editPart(n, id, { length: d.length });
        n = {
          ...n,
          editor: {
            ...n.editor,
            selected: id,
            cursor: mechanism(d.part) ? { part: id, col: 0 } : ed.cursor,
          },
        };
        pendingCues.add(C.CUES.place);
      } else if (d.kind === "move") {
        const p = part(n, d.part),
          off = h ? sub(h, d.from) : { q: 0, r: 0 };
        try {
          n = editPart(n, p.id, {
            q: p.q + off.q,
            r: p.r + off.r,
            rotation: d.rotation,
            length: d.length,
            cells: p.cells?.map((h) => add(h, off)) ?? null,
          });
          if (!same(off, { q: 0, r: 0 })) pendingCues.add(C.CUES.place);
        } catch {
          n = editPart(n, p.id, { rotation: d.rotation, length: d.length });
        }
      }
    } catch {
      n = { ...n, editor: { ...n.editor, parts: d.before } };
    }
    n = history(s, { ...n, editor: { ...n.editor, drag: null } }, d.before);
  }
  return n;
}
export function action(s: OrreryState, a: string): OrreryState {
  if (s.screen !== "editor" || s.sim?.status === "complete") {
    if (a === "back")
      return s.screen === "title"
        ? s
        : s.screen === "editor"
          ? { ...s, sim: null }
          : screen(s, "title");
    if (a === "confirm") return confirm(s);
    if (a === "up" || a === "down") {
      const k = a === "down" ? 1 : -1,
        count = menuCount(s);
      return s.screen === "select"
        ? { ...s, selectIndex: (s.selectIndex + k + count) % count }
        : { ...s, menuIndex: (s.menuIndex + k + count) % count };
    }
    if (s.screen === "howto" && (a === "left" || a === "right"))
      return {
        ...s,
        howtoPage: Math.max(
          0,
          Math.min(C.HOWTO_PAGES - 1, s.howtoPage + (a === "right" ? 1 : -1)),
        ),
      };
    return s;
  }
  const ed = s.editor;
  if (ed.drag) {
    if (ed.drag.kind === "lay") return s;
    const d = ed.drag,
      k = d.kind === "place" ? d.part : part(s, d.part).kind;
    return {
      ...s,
      editor: {
        ...ed,
        drag: {
          ...d,
          rotation:
            k === "track"
              ? 0
              : mod(
                  d.rotation +
                    (a === "part-cw" ? 1 : a === "part-ccw" ? -1 : 0),
                ),
          length: arm(k)
            ? Math.max(
                C.ARM_MIN_LEN,
                Math.min(
                  C.ARM_MAX_LEN,
                  d.length +
                    (a === "part-grow" ? 1 : a === "part-shrink" ? -1 : 0),
                ),
              )
            : 1,
        },
      },
    };
  }
  if (a === "back") return s.sim ? { ...s, sim: null } : screen(s, "select");
  if (a === "play" || a === "step") {
    if (!s.sim) {
      const ready = tray(s)
        .filter((t) => t.kind === "rise" || t.kind === "set")
        .every((t) =>
          ed.parts.some((p) => p.kind === t.kind && p.index === t.index),
        );
      if (!ready) return s;
      pendingCues.add(C.CUES.start);
      const n = start(s);
      return a === "step" ? { ...n, sim: { ...n.sim!, status: "paused" } } : n;
    }
    if (!["running", "paused"].includes(s.sim.status)) return s;
    if (a === "play")
      return {
        ...s,
        sim: {
          ...s.sim,
          status: s.sim.status === "running" ? "paused" : "running",
        },
      };
    const n = advance(
      { ...s, sim: { ...s.sim, status: "running" } },
      1 - s.sim.fraction,
    );
    return n.sim!.status === "running"
      ? { ...n, sim: { ...n.sim!, status: "paused" } }
      : n;
  }
  if (s.sim) {
    if (
      ["running", "paused"].includes(s.sim.status) &&
      (a === "speed-up" || a === "speed-down")
    )
      return {
        ...s,
        sim: {
          ...s.sim,
          speed: Math.max(
            0,
            Math.min(
              C.SPEEDS.length - 1,
              s.sim.speed + (a === "speed-up" ? 1 : -1),
            ),
          ),
        },
      };
    return s;
  }
  if (a === "undo" || a === "redo") {
    const from = a === "undo" ? ed.undo : ed.redo,
      to = a === "undo" ? ed.redo : ed.undo;
    if (!from.length) return s;
    const n = changeParts(s, from[from.length - 1]);
    return {
      ...n,
      editor: {
        ...n.editor,
        [a === "undo" ? "undo" : "redo"]: from.slice(0, -1),
        [a === "undo" ? "redo" : "undo"]: [...to, ed.parts],
      },
    };
  }
  let n = s;
  try {
    if (ed.focus === "field" && ed.selected !== null) {
      const p = part(s, ed.selected);
      if (a === "part-delete") {
        n = removePart(s, p.id);
        pendingCues.add(C.CUES.erase);
      }
      if (p.kind !== "track" && (a === "part-cw" || a === "part-ccw"))
        n = editPart(s, p.id, {
          rotation: mod(p.rotation + (a === "part-cw" ? 1 : -1)),
        });
      if (arm(p.kind) && (a === "part-grow" || a === "part-shrink"))
        n = editPart(s, p.id, {
          length: Math.max(
            C.ARM_MIN_LEN,
            Math.min(C.ARM_MAX_LEN, p.length + (a === "part-grow" ? 1 : -1)),
          ),
        });
    }
    if (ed.focus === "tape" && ed.cursor) {
      const cur = ed.cursor,
        p = part(s, cur.part),
        rows = ed.parts.filter((p) => p.tape);
      let col = cur.col,
        id = cur.part;
      if (a === "left") col = Math.max(0, col - 1);
      if (a === "right") col++;
      if (a === "up" || a === "down")
        id =
          rows[
            (rows.findIndex((p) => p.id === id) +
              (a === "down" ? 1 : -1) +
              rows.length) %
              rows.length
          ].id;
      const ins = a.slice(4) as TapeCell;
      if (a.startsWith("ins-") && C.INSTRUCTIONS.includes(ins!)) {
        n = tape(n, id, col, ins);
        col++;
      }
      if (a === "ins-blank") n = tape(n, id, col, null);
      if (a === "ins-erase" && col > 0) n = tape(n, id, --col, null);
      let expansion: readonly TapeCell[] = [];
      if (a === "ins-repeat")
        expansion = Array.from({ length: col }, (_, i) => p.tape![i] ?? null);
      if (a === "ins-reset") {
        let rot = 0,
          len = p.length;
        const track = ed.parts.find(
          (t) => t.kind === "track" && t.cells!.some((h) => same(h, p)),
        );
        const rest = track?.cells!.findIndex((h) => same(h, p)) ?? 0;
        let cell = rest;
        for (const i of p.tape!.slice(0, col)) {
          if (i === "rotate-cw") rot++;
          if (i === "rotate-ccw") rot--;
          if (i === "extend") len = Math.min(C.ARM_MAX_LEN, len + 1);
          if (i === "retract") len = Math.max(C.ARM_MIN_LEN, len - 1);
          if (track && (i === "advance" || i === "recede")) {
            const next = cell + (i === "advance" ? 1 : -1),
              count = track.cells!.length;
            cell = track.closed
              ? (next + count) % count
              : Math.max(0, Math.min(count - 1, next));
          }
        }
        const d = mod(-rot);
        const count = track?.cells!.length ?? 1;
        const forward = track?.closed
          ? (rest - cell + count) % count
          : rest - cell;
        const backward = track?.closed
          ? (cell - rest + count) % count
          : cell - rest;
        const trackIns: TapeCell = track?.closed
          ? forward <= backward
            ? "advance"
            : "recede"
          : cell < rest
            ? "advance"
            : "recede";
        const distance = track?.closed
          ? Math.min(forward, backward)
          : Math.abs(rest - cell);
        expansion = [
          ...(p.kind === "wheel" ? [] : ["drop" as const]),
          ...Array.from({ length: Math.abs(len - p.length) }, () =>
            len > p.length ? ("retract" as const) : ("extend" as const),
          ),
          ...Array.from({ length: Math.min(d, 6 - d) }, () =>
            d <= 3 ? ("rotate-cw" as const) : ("rotate-ccw" as const),
          ),
          ...Array.from(
            { length: p.kind === "wheel" ? 0 : distance },
            () => trackIns,
          ),
        ];
      }
      for (const i of expansion) n = tape(n, id, col++, i);
      n = { ...n, editor: { ...n.editor, cursor: { part: id, col } } };
    }
  } catch {
    return s;
  }
  return history(s, n);
}
export const tapeView = (s: OrreryState) => {
  const rows = s.editor.parts.filter((p) => p.tape);
  return {
    rows,
    firstRow: Math.max(
      0,
      rows.findIndex((p) => p.id === s.editor.cursor?.part) -
        (C.TAPE_ROWS_VISIBLE - 1),
    ),
    firstCol: Math.max(
      0,
      (s.editor.cursor?.col ?? 0) - (C.TAPE_COLS_VISIBLE - 1),
    ),
    period: period(s.editor.parts),
  };
};
