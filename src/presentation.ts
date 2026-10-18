/** Decoded assets and transient effects live here; authoritative game state remains read-only. */
import type { InitApi, RenderApi } from "@clockwyrks/simple-2d";
import { ParticleCanvasPlayer } from "@clockwyrks/particle-runtime/canvas";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import type { OrreryState, PartState, Hex } from "./game";
import * as C from "./constants";
import {
  xy,
  field,
  footprint,
  mechanism,
  cost,
  period,
  add,
  sub,
  rotate,
  target,
  mod,
  validateParts,
} from "./geometry";
import { drawnMotes, drawnPose } from "./simulation";
import { tray, tapeView, menuItemRect, hasNext } from "./editor";
import { courses } from "./content";
const images = new Map<string, CanvasImageSource>();
const systems = new Map<string, ParticleSystem>();
let effects: {
  kind: string;
  x: number;
  y: number;
  age: number;
  player: ParticleCanvasPlayer | null;
}[] = [];
let frameDelta = 0;
export function clearPresentation() {
  effects = [];
}
export async function loadAssets(api: InitApi<OrreryState>) {
  const paths = [
    ...Object.values(C.MOTE_SPRITE_PATHS),
    ...Object.values(C.FILAMENT_SPRITE_PATHS),
    ...Object.values(C.SIGIL_GLYPH_PATHS),
    ...Object.values(C.INSTRUCTION_GLYPH_PATHS),
    ...Object.values(C.HUB_PATHS),
    ...Object.values(C.GRIPPER_PATHS),
    C.WHEEL_HUB_PATH,
    C.FIXTURE_MOUNT_PATH,
    ...Object.values(C.APERTURE_SHEETS).flatMap((p) =>
      Array.from({ length: C.APERTURE_FRAMES }, (_, i) => `${p}/${i}.png`),
    ),
  ];
  await Promise.all(
    paths.map(async (p) => images.set(p, await api.assets.loadImage(p))),
  );
  await Promise.all(
    Object.entries(C.CUE_PATHS).map(([name, path]) =>
      api.audio.load(name, path),
    ),
  );
  await Promise.all(
    Object.entries(C.PARTICLE_PATHS).map(async ([name, path]) =>
      systems.set(
        name,
        JSON.parse(
          await (await api.assets.load(path)).text(),
        ) as ParticleSystem,
      ),
    ),
  );
}
export function effectAt(kind: string, x: number, y: number) {
  effects.push({ kind, x, y, age: 0, player: null });
}
export function effect(kind: string, h: Hex) {
  const { x, y } = xy(h);
  effectAt(kind, x, y);
}
export function presentationDelta(dt: number) {
  frameDelta = dt;
  effects = effects
    .map((e) => ({ ...e, age: e.age + dt }))
    .filter((e) => e.age < 2.5);
}
const palette = {
  gold: "#d8bc83",
  paper: "#ece3cf",
  muted: "#83979d",
  teal: "#7ed1c3",
  line: "#29424b",
  panel: "#0d202b",
};
function text(
  ctx: CanvasRenderingContext2D,
  t: string,
  x: number,
  y: number,
  size = 14,
  color = palette.paper,
  font = "sans-serif",
) {
  ctx.fillStyle = color;
  ctx.font = `${size}px ${font}`;
  ctx.fillText(t, x, y);
}
function line(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  a: number,
  b: number,
  color = palette.line,
  width = 1,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(a, b);
  ctx.stroke();
}
function circle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color = palette.line,
  width = 1,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}
function sprite(
  ctx: CanvasRenderingContext2D,
  path: string,
  x: number,
  y: number,
  w: number,
  h = w,
  angle = 0,
) {
  const img = images.get(path);
  if (!img) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(img, -w / 2, -h / 2);
  ctx.restore();
}
function hex(
  ctx: CanvasRenderingContext2D,
  h: Hex,
  color = palette.line,
  fill?: string,
) {
  const p = xy(h);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = ((i + 0.5) * Math.PI) / 3,
      x = p.x + 27 * Math.cos(a),
      y = p.y + 27 * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
}
function sky(ctx: CanvasRenderingContext2D) {
  const g = ctx.createRadialGradient(780, 270, 10, 650, 300, 850);
  g.addColorStop(0, "#163341");
  g.addColorStop(0.55, "#0b1d29");
  g.addColorStop(1, "#070f1b");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  for (let i = 0; i < 155; i++) {
    const x = (i * 719 + 93) % 1280,
      y = (i * i * 29 + 37) % 720;
    ctx.fillStyle = i % 7 === 0 ? "#d6cbac77" : "#a4c9ca35";
    ctx.fillRect(x, y, i % 11 === 0 ? 2 : 1, 1);
  }
}
function ornament(ctx: CanvasRenderingContext2D, t: number) {
  const x = 880,
    y = 342;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.22);
  for (const r of [92, 155, 219, 264]) {
    circle(ctx, 0, 0, r, "#a78e5845");
    circle(ctx, 0, 0, r + 4, "#c6ac6820");
  }
  for (let i = 0; i < 72; i++) {
    const a = (i * Math.PI) / 36;
    line(
      ctx,
      Math.cos(a) * 254,
      Math.sin(a) * 254,
      Math.cos(a) * (i % 6 === 0 ? 273 : 260),
      Math.sin(a) * (i % 6 === 0 ? 273 : 260),
      "#bea66a77",
    );
  }
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + t * 0.05;
    line(ctx, 0, 0, Math.cos(a) * 210, Math.sin(a) * 210, "#ae8c54", 3);
    line(ctx, 0, -2, Math.cos(a) * 210, Math.sin(a) * 210 - 2, "#dfc38855");
    const px = Math.cos(a) * 210,
      py = Math.sin(a) * 210;
    sprite(ctx, C.FIXTURE_MOUNT_PATH, px, py, C.WHEEL_SPRITE_SIZE);
    sprite(ctx, C.MOTE_SPRITE_PATHS[C.PLANETS[i]], px, py, C.MOTE_SPRITE_SIZE);
  }
  sprite(ctx, C.WHEEL_HUB_PATH, 0, 0, C.WHEEL_SPRITE_SIZE);
  for (let i = 0; i < 3; i++) {
    const a = -t * 0.07 + i * 2.1;
    sprite(
      ctx,
      C.MOTE_SPRITE_PATHS[["nebula", "comet", "aether"][i] as "nebula"],
      Math.cos(a) * 93,
      Math.sin(a) * 93,
      C.MOTE_SPRITE_SIZE,
    );
  }
  ctx.restore();
  text(ctx, "THE CELESTIAL WORKSHOP", 755, 665, 11, palette.muted);
}
function button(
  ctx: CanvasRenderingContext2D,
  s: OrreryState,
  i: number,
  label: string,
) {
  const r = menuItemRect(s, i);
  if (!r) return;
  const selected = (s.screen === "select" ? s.selectIndex : s.menuIndex) === i;
  ctx.fillStyle = selected ? "#bd9e5920" : "#09182466";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  line(
    ctx,
    r.x,
    r.y + r.h,
    r.x + r.w,
    r.y + r.h,
    selected ? palette.gold : palette.line,
  );
  if (selected) {
    line(ctx, r.x, r.y + 7, r.x, r.y + r.h - 7, palette.gold, 3);
    text(ctx, "›", r.x + r.w - 26, r.y + r.h / 2 + 6, 23, palette.gold);
  }
  text(
    ctx,
    label,
    r.x + 19,
    r.y + r.h / 2 + 5,
    14,
    selected ? palette.gold : palette.paper,
  );
}
function drawPart(
  ctx: CanvasRenderingContext2D,
  s: OrreryState,
  p: PartState,
  ghost = false,
) {
  const pos = xy(p),
    selected = s.editor.selected === p.id;
  if (!mechanism(p.kind) && p.kind !== "track") {
    for (const h of footprint(p, s.challenge!))
      hex(
        ctx,
        h,
        ghost
          ? palette.teal
          : selected
            ? palette.gold
            : p.kind === "rise"
              ? "#487d7a"
              : p.kind === "set"
                ? "#8e794f"
                : "#5b5840",
        p.kind === "rise" ? "#416e6c15" : "#a78c3910",
      );
    if (p.kind === "rise" || p.kind === "set") {
      sprite(
        ctx,
        `${C.APERTURE_SHEETS[p.kind]}/${Math.floor(s.simTime / C.APERTURE_FRAME_TIME) % C.APERTURE_FRAMES}.png`,
        pos.x,
        pos.y,
        C.APERTURE_SPRITE_SIZE,
      );
      const m = (
        p.kind === "rise" ? s.challenge!.reagents : s.challenge!.products
      )[p.index!];
      ctx.save();
      ctx.globalAlpha = s.sim?.status === "running" ? 0.15 : 0.55;
      for (const f of m.filaments) {
        const a = xy(add(rotate(f.a, p.rotation), p)),
          b = xy(add(rotate(f.b, p.rotation), p));
        sprite(
          ctx,
          C.FILAMENT_SPRITE_PATHS[f.weight === 3 ? "triune" : "plain"],
          (a.x + b.x) / 2,
          (a.y + b.y) / 2,
          C.FILAMENT_SPRITE_W,
          C.FILAMENT_SPRITE_H,
          Math.atan2(b.y - a.y, b.x - a.x),
        );
      }
      for (const t of m.motes) {
        const h = xy(add(rotate(t, p.rotation), p));
        sprite(ctx, C.MOTE_SPRITE_PATHS[t.type], h.x, h.y, C.MOTE_SPRITE_SIZE);
      }
      ctx.restore();
      text(
        ctx,
        `${p.kind === "rise" ? "IN" : "OUT"} ${p.index! + 1}`,
        pos.x - 18,
        pos.y + 35,
        9,
        p.kind === "rise" ? palette.teal : palette.gold,
      );
    } else
      sprite(
        ctx,
        C.SIGIL_GLYPH_PATHS[p.kind as keyof typeof C.SIGIL_GLYPH_PATHS],
        pos.x,
        pos.y,
        C.SIGIL_GLYPH_SIZE,
      );
  } else if (p.kind === "track") {
    const cells = p.closed ? [...p.cells!, p.cells![0]] : p.cells!;
    for (let i = 1; i < cells.length; i++) {
      const a = xy(cells[i - 1]),
        b = xy(cells[i]);
      line(ctx, a.x, a.y, b.x, b.y, "#947d54", 8);
      line(ctx, a.x, a.y, b.x, b.y, "#16242b", 3);
    }
    for (const h of p.cells!) {
      const a = xy(h);
      circle(ctx, a.x, a.y, 6, selected ? palette.gold : "#847653", 2);
    }
  } else {
    const pose = ghost
        ? { rotation: p.rotation, length: p.length, cell: p }
        : drawnPose(s, p),
      b = xy(pose.cell);
    const offsets =
      p.kind === "biarm"
        ? [0, 3]
        : p.kind === "triarm"
          ? [0, 2, 4]
          : p.kind === "hexarm" || p.kind === "wheel"
            ? [0, 1, 2, 3, 4, 5]
            : [0];
    for (const d of offsets) {
      const angle = ((pose.rotation + d) * Math.PI) / 3,
        x = b.x + Math.cos(angle) * C.HEX_PITCH * pose.length,
        y = b.y + Math.sin(angle) * C.HEX_PITCH * pose.length;
      line(ctx, b.x, b.y, x, y, "#040c14", 10);
      line(ctx, b.x, b.y, x, y, "#90744e", 7);
      line(ctx, b.x, b.y - 1, x, y - 1, "#e0c18a", 2);
      if (p.kind === "wheel")
        sprite(
          ctx,
          C.FIXTURE_MOUNT_PATH,
          x,
          y,
          C.WHEEL_SPRITE_SIZE,
          C.WHEEL_SPRITE_SIZE,
          angle,
        );
      else
        sprite(
          ctx,
          C.GRIPPER_PATHS[
            s.sim?.grips.some(
              (g) =>
                g.part === p.id &&
                g.spoke === mod(Math.round(pose.rotation) + d),
            )
              ? "closed"
              : "open"
          ],
          x,
          y,
          C.GRIPPER_SPRITE_SIZE,
          C.GRIPPER_SPRITE_SIZE,
          angle,
        );
    }
    sprite(
      ctx,
      p.kind === "wheel"
        ? C.WHEEL_HUB_PATH
        : p.kind === "piston"
          ? C.HUB_PATHS.piston
          : C.HUB_PATHS.arm,
      b.x,
      b.y,
      p.kind === "wheel" ? C.WHEEL_SPRITE_SIZE : C.HUB_SPRITE_SIZE,
      undefined,
      (pose.rotation * Math.PI) / 3,
    );
    if (selected) circle(ctx, b.x, b.y, 24, palette.teal);
    if (s.sim?.fault?.parts.includes(p.id))
      circle(ctx, b.x, b.y, 26, "#ef997d", 2);
    text(
      ctx,
      `A${s.editor.parts.filter((p) => p.tape).findIndex((a) => a.id === p.id) + 1}`,
      b.x - 9,
      b.y + 4,
      10,
      "#f8edcf",
    );
  }
}
function editor(ctx: CanvasRenderingContext2D, s: OrreryState) {
  ctx.fillStyle = "#08151fe8";
  ctx.fillRect(0, 0, C.STAGE_W, C.HEADING_H);
  ctx.fillRect(0, C.HEADING_H, C.TRAY_REGION_W, C.STAGE_H);
  ctx.fillRect(
    C.READOUT_X0,
    C.HEADING_H,
    C.STAGE_W - C.READOUT_X0,
    C.TAPE_Y0 - C.HEADING_H,
  );
  ctx.fillRect(
    C.TRAY_REGION_W,
    C.TAPE_Y0,
    C.STAGE_W - C.TRAY_REGION_W,
    C.STAGE_H - C.TAPE_Y0,
  );
  text(ctx, "O R R E R Y", 20, 30, 18, palette.gold, "Georgia");
  line(ctx, 205, 14, 205, 34);
  text(ctx, s.challenge!.name, 244, 30, 18);
  text(ctx, `COST  ${cost(s.editor.parts)}`, 810, 29, 12, palette.gold);
  const missing = tray(s).filter(
    (t) =>
      (t.kind === "rise" || t.kind === "set") &&
      !s.editor.parts.some((p) => p.kind === t.kind && p.index === t.index),
  );
  text(
    ctx,
    s.sim
      ? "LIVE / WORKBENCH LOCKED"
      : missing.length
        ? "PLACE " +
          missing
            .map((t) => `${t.kind.toUpperCase()} ${t.index! + 1}`)
            .join(" · ")
        : "READY / SPACE TO RUN",
    540,
    29,
    10,
    palette.muted,
  );
  text(ctx, "ESC  /  BACK", 1136, 29, 11, palette.muted);
  line(ctx, C.TRAY_REGION_W, C.HEADING_H, C.TRAY_REGION_W, C.STAGE_H);
  line(ctx, C.READOUT_X0, C.HEADING_H, C.READOUT_X0, C.TAPE_Y0);
  line(ctx, C.TRAY_REGION_W, C.TAPE_Y0, C.STAGE_W, C.TAPE_Y0, palette.gold);
  const items = tray(s);
  items.forEach((t, i) => {
    const y = C.TRAY_Y0 + i * C.TRAY_SLOT_H,
      spent =
        (t.kind === "rise" || t.kind === "set") &&
        s.editor.parts.some((p) => p.kind === t.kind && p.index === t.index);
    const hover =
      s.pointer.x < C.TRAY_REGION_W &&
      s.pointer.y >= y &&
      s.pointer.y < y + C.TRAY_SLOT_H;
    ctx.fillStyle = hover
      ? "#bca36520"
      : i % 2 === 0
        ? "#17313c35"
        : "#00000000";
    ctx.fillRect(C.TRAY_X0, y, C.TRAY_W, C.TRAY_SLOT_H - 1);
    text(
      ctx,
      spent ? "✓" : "◇",
      18,
      y + 20,
      14,
      spent ? palette.teal : palette.gold,
    );
    text(
      ctx,
      t.kind.toUpperCase() + (t.index === null ? "" : ` ${t.index + 1}`),
      43,
      y + 20,
      12,
      spent ? "#5c767b" : palette.paper,
    );
    text(ctx, String(C.PART_COSTS[t.kind]), 184, y + 20, 11, palette.muted);
  });
  const helpY = Math.max(428, C.TRAY_Y0 + items.length * C.TRAY_SLOT_H + 22);
  text(ctx, "THE WORKBENCH", 18, helpY, 10, palette.gold);
  [
    "Drag a part onto the field.",
    "Q / E  turn     W / S  reach",
    "X  remove     U / I  undo / redo",
    "",
    "Click a tape, then write:",
    "G  grab       V  drop",
    "A / D  turn   Z / C  pivot",
    "W / S  extend / retract",
    "T / B  advance / recede",
    "R  reset      Y  repeat",
  ].forEach((t, i) => text(ctx, t, 18, helpY + 23 + i * 19, 11, palette.muted));
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    C.TRAY_REGION_W,
    C.HEADING_H,
    C.READOUT_X0 - C.TRAY_REGION_W,
    C.TAPE_Y0 - C.HEADING_H,
  );
  ctx.clip();
  circle(ctx, C.FIELD_CX, C.FIELD_CY, 252, "#ac95622c");
  circle(ctx, C.FIELD_CX, C.FIELD_CY, 257, "#ac95621c");
  for (const h of field) {
    hex(ctx, h, "#32505b88");
    const p = xy(h);
    ctx.fillStyle = "#75929450";
    ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
  }
  text(ctx, "N", C.FIELD_CX - 4, 66, 10, palette.gold);
  text(
    ctx,
    "CELESTIAL FIELD  /  91 SEATS",
    C.TRAY_REGION_W + 25,
    534,
    9,
    palette.muted,
  );
  const hover = target(s.pointer.x, s.pointer.y);
  if (hover && !s.sim) hex(ctx, hover, palette.teal, "#7ed1c310");
  for (const p of [...s.editor.parts].sort(
    (a, b) => Number(mechanism(a.kind)) - Number(mechanism(b.kind)),
  ))
    drawPart(ctx, s, p);
  const d = s.editor.drag;
  if (d && d.kind !== "lay" && d.at) {
    let p: PartState;
    if (d.kind === "place")
      p = {
        id: -1,
        kind: d.part,
        ...d.at,
        rotation: d.rotation,
        length: d.length,
        index: d.index,
        cells: d.part === "track" ? [d.at] : null,
        closed: false,
        tape: null,
      };
    else {
      const old = s.editor.parts.find((p) => p.id === d.part)!;
      p = {
        ...old,
        ...add(old, sub(d.at, d.from)),
        rotation: d.rotation,
        length: d.length,
        cells: old.cells?.map((h) => add(h, sub(d.at!, d.from))) ?? null,
      };
    }
    let legal = true;
    try {
      validateParts(
        [...s.editor.parts.filter((a) => a.id !== p.id), p],
        s.challenge!,
      );
    } catch {
      legal = false;
    }
    ctx.save();
    ctx.globalAlpha = 0.6;
    drawPart(ctx, s, p, true);
    for (const h of footprint(p, s.challenge!))
      hex(ctx, h, legal ? palette.teal : "#ee8f7a");
    ctx.restore();
  }
  const motes = drawnMotes(s);
  for (const f of s.sim?.filaments ?? []) {
    const a = motes.find((m) => m.id === f.a)!,
      b = motes.find((m) => m.id === f.b)!;
    sprite(
      ctx,
      C.FILAMENT_SPRITE_PATHS[f.weight === 3 ? "triune" : "plain"],
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      C.FILAMENT_SPRITE_W,
      C.FILAMENT_SPRITE_H,
      Math.atan2(b.y - a.y, b.x - a.x),
    );
  }
  for (const m of motes) {
    sprite(ctx, C.MOTE_SPRITE_PATHS[m.type], m.x, m.y, C.MOTE_SPRITE_SIZE);
    if (s.sim?.fault?.motes.includes(m.id))
      circle(ctx, m.x, m.y, 24, "#ef997d", 2);
  }
  for (const e of effects) {
    ctx.save();
    ctx.translate(e.x - 100, e.y - 100);
    ctx.scale(200 / ctx.canvas.width, 200 / ctx.canvas.height);
    if (!e.player)
      e.player = new ParticleCanvasPlayer(systems.get(e.kind)!, ctx, {
        clear: false,
        pixelRadius: 14,
      });
    e.player.update(frameDelta);
    ctx.restore();
  }
  ctx.restore();
  text(ctx, "INSTRUMENT STATUS", 1032, 86, 10, palette.gold);
  text(
    ctx,
    s.sim ? s.sim.status.toUpperCase() : "DESIGNING",
    1032,
    118,
    23,
    s.sim?.status === "faulted" ? "#ed9e86" : palette.teal,
    "Georgia",
  );
  line(ctx, 1032, 139, 1255, 139);
  [
    ["CYCLE", String(s.sim?.cycle ?? 0)],
    ["PERIOD", String(period(s.editor.parts))],
    ["SPEED", `${C.SPEEDS[s.sim?.speed ?? C.DEFAULT_SPEED_INDEX]} ×`],
    ["AREA", String(s.sim?.areaHexes.length ?? 0)],
  ].forEach(([label, value], i) => {
    text(ctx, label, 1032, 169 + i * 32, 10, palette.muted);
    text(ctx, value, 1208, 169 + i * 32, 17, palette.paper, "monospace");
  });
  line(ctx, 1032, 287, 1255, 287);
  text(ctx, "DELIVERY MANIFEST", 1032, 312, 10, palette.gold);
  s.challenge!.products.forEach((m, i) => {
    text(
      ctx,
      `${i + 1}  ${m.motes
        .map((t) => t.type)
        .join(" + ")
        .toUpperCase()}`,
      1032,
      337 + i * (s.challenge!.products.length > 2 ? 34 : 52),
      10,
      palette.muted,
    );
    text(
      ctx,
      `${s.sim?.tallies[i] ?? 0} / ${s.challenge!.target}`,
      1032,
      359 + i * (s.challenge!.products.length > 2 ? 34 : 52),
      s.challenge!.products.length > 2 ? 17 : 22,
      palette.paper,
      "Georgia",
    );
  });
  text(ctx, "Space   RUN / PAUSE", 1032, 468, 12, palette.gold);
  text(ctx, "N   STEP A CYCLE", 1032, 493, 11, palette.muted);
  text(ctx, ", / .   CHANGE SPEED", 1032, 516, 11, palette.muted);
  text(
    ctx,
    "M   " + (s.muted ? "SOUND OFF" : "SOUND ON"),
    1032,
    539,
    10,
    palette.muted,
  );
  const view = tapeView(s);
  for (let v = 0; v < C.TAPE_ROWS_VISIBLE; v++) {
    const p = view.rows[view.firstRow + v];
    if (!p) continue;
    const y = C.TAPE_Y0 + v * C.TAPE_ROW_H;
    ctx.fillStyle = v % 2 ? "#142a3355" : "#0d202b";
    ctx.fillRect(C.TRAY_REGION_W, y, C.STAGE_W - C.TRAY_REGION_W, C.TAPE_ROW_H);
    text(
      ctx,
      `A${view.firstRow + v + 1}  ${p.tape!.length}/${view.period}`,
      234,
      y + 19,
      11,
      palette.gold,
    );
    for (let u = 0; u < C.TAPE_COLS_VISIBLE; u++) {
      const col = view.firstCol + u,
        x = C.TRAY_REGION_W + C.TAPE_X0 + u * C.TAPE_CELL_W;
      ctx.strokeStyle = "#2b424a";
      ctx.strokeRect(x, y + 2, C.TAPE_CELL_W, C.TAPE_ROW_H - 4);
      if (s.editor.cursor?.part === p.id && s.editor.cursor.col === col) {
        ctx.fillStyle = "#c7ac6830";
        ctx.fillRect(x, y + 2, 24, 24);
        ctx.strokeStyle = palette.gold;
        ctx.strokeRect(x, y + 2, 24, 24);
      }
      if (s.sim && s.sim.cycle % view.period === col) {
        ctx.fillStyle = "#75d2c522";
        ctx.fillRect(x, y + 2, 24, 24);
      }
      const ins = p.tape![col];
      if (ins)
        sprite(
          ctx,
          C.INSTRUCTION_GLYPH_PATHS[ins],
          x + 12,
          y + 14,
          C.INSTRUCTION_GLYPH_SIZE,
        );
    }
  }
  if (!view.rows.length) {
    text(ctx, "THE TAPES ARE QUIET", 260, 606, 15, palette.gold, "Georgia");
    text(
      ctx,
      "Place an arm to begin composing its motion.",
      260,
      632,
      12,
      palette.muted,
    );
  }
  text(
    ctx,
    "INSTRUCTION TAPE   /   " + s.editor.focus.toUpperCase() + " FOCUS",
    240,
    713,
    9,
    palette.muted,
  );
  if (s.sim?.status === "faulted") {
    ctx.fillStyle = "#481f2277";
    ctx.fillRect(334, 222, 565, 88);
    text(
      ctx,
      `MACHINE HALTED  /  ${s.sim.fault!.kind.toUpperCase()}`,
      360,
      258,
      21,
      "#f4baa0",
      "Georgia",
    );
    text(
      ctx,
      "Escape to return to the workbench.",
      360,
      287,
      13,
      palette.paper,
    );
  }
  if (s.sim?.status === "complete") {
    ctx.fillStyle = "#0b2631bb";
    ctx.fillRect(408, 181, 418, 330);
    line(ctx, 408, 181, 826, 181, palette.gold);
    text(ctx, C.SOLVED_TITLE_TEXT, 438, 224, 23, palette.gold, "Georgia");
    const m = s.sim.metrics!;
    text(
      ctx,
      `COST ${m.cost}     CYCLES ${m.cycles}     AREA ${m.area}`,
      443,
      269,
      13,
      palette.paper,
    );
    text(
      ctx,
      s.challengeRef
        ? `SESSION BEST  ${Object.values(s[`${s.challengeRef.mode}Records`][s.challengeRef.index]!).join(" / ")}`
        : "A little order, written in the stars.",
      443,
      300,
      13,
      palette.teal,
      "Georgia",
    );
    C.SOLVED_ITEMS.slice(hasNext(s) ? 0 : 1).forEach((t, i) =>
      button(ctx, s, i, t),
    );
  }
}
const lessons = [
  [
    "The sky is your workbench",
    "Every challenge gives you reagents and asks for constellations.",
    "Motes are celestial bodies. Filaments join them into rigid shapes.",
    "The four essences are nebula, comet, nova and meteor.",
    "Six planets climb from Saturn to Sol; mercury is their catalyst.",
    "Umbra and lumen are opposites. Aether unites the essences.",
  ],
  [
    "Give the heavens a mechanism",
    "Rises bring reagents in. Sets receive the exact product, unheld.",
    "Arms grab and carry; the wheel holds six permanent fixtures.",
    "Tracks carry bases. Bind and manifold join; triune joins nova.",
    "Sunder breaks a link. Wane makes dust; mirror copies an essence.",
    "Ascend and conjoin raise planets. Eclipse separates dust.",
    "Confluence makes aether; dispersion divides it. Void consumes.",
  ],
  [
    "Compose a loop",
    "Click an arm’s tape. Every tape shares the longest tape’s period.",
    "G grab · V drop · A / D rotate · Z / C pivot a constellation",
    "W / S extend or retract · T / B move along a track",
    "Delete blanks a cell. Backspace removes the previous instruction.",
    "R writes a return to the rest pose. Y repeats the tape so far.",
    "Arrow keys move the cursor. Blank cells wait while holding.",
  ],
  [
    "Set it in motion",
    "Place every rise and set, then press Space to run or pause.",
    "N advances one cycle. Comma and period change the speed.",
    "Motes must never touch: even a near miss during a turn can collide.",
    "A fault freezes the machine and marks the bodies involved.",
    "Read the fault banner, then press Escape to adjust your design.",
  ],
  [
    "A machine worth keeping",
    "Deliver each product six times to complete a challenge.",
    "Cost counts your parts. Cycles count time. Area counts touched hexes.",
    "Lower is better. Your best of each metric is remembered separately.",
    "Campaign opens the next challenge; Extras are always available.",
    "Your machines stay on their workbenches for this session.",
  ],
];
export function render(s: OrreryState, api: RenderApi) {
  const ctx = api.ctx;
  sky(ctx);
  if (s.screen === "editor") {
    editor(ctx, s);
    return;
  }
  if (s.screen === "title") {
    ornament(ctx, s.simTime);
    text(
      ctx,
      "A CELESTIAL MACHINE-BUILDING PUZZLE",
      112,
      166,
      11,
      palette.gold,
    );
    text(ctx, C.TITLE_TEXT, 105, 266, 91, palette.paper, "Georgia");
    line(ctx, 112, 294, 440, 294, palette.gold);
    text(ctx, C.TAGLINE_TEXT, 112, 327, 15, palette.gold);
    C.TITLE_ITEMS.forEach((t, i) => button(ctx, s, i, t));
    text(
      ctx,
      "Arrange. Compose. Set the sky in motion.",
      112,
      605,
      16,
      palette.muted,
      "Georgia",
    );
    text(
      ctx,
      "↑ ↓  CHOOSE     ENTER  BEGIN     M  SOUND",
      112,
      668,
      10,
      palette.muted,
    );
    return;
  }
  text(ctx, "O R R E R Y", 110, 69, 23, palette.gold, "Georgia");
  text(
    ctx,
    s.screen === "select"
      ? s.mode === "campaign"
        ? "The celestial course"
        : "The cabinet of curiosities"
      : "The art of celestial mechanics",
    110,
    117,
    32,
    palette.paper,
    "Georgia",
  );
  text(ctx, "ESC  /  RETURN", 1060, 69, 11, palette.muted);
  if (s.screen === "select") {
    courses[s.mode].forEach((c, i) => {
      const solved = s[`${s.mode}Solved`].includes(i),
        locked = s.mode === "campaign" && i >= s.unlockedCount;
      button(ctx, s, i, `${String(i + 1).padStart(2, "0")}     ${c.name}`);
      const r = menuItemRect(s, i)!;
      const rec = s[`${s.mode}Records`][i];
      text(
        ctx,
        locked ? "LOCKED" : solved ? "COMPLETE" : "OPEN",
        1040,
        r.y + 25,
        10,
        locked ? palette.muted : palette.teal,
      );
      if (solved && rec)
        text(
          ctx,
          `COST ${rec.cost}   CYCLES ${rec.cycles}   AREA ${rec.area}`,
          650,
          r.y + 25,
          11,
          palette.gold,
        );
    });
    text(
      ctx,
      s.mode === "campaign"
        ? "An apprenticeship in motion, one instrument at a time."
        : "Ten independent studies. Every workbench is open.",
      110,
      665,
      15,
      palette.muted,
      "Georgia",
    );
  } else {
    const l = lessons[s.howtoPage];
    text(
      ctx,
      `0${s.howtoPage + 1} / 0${C.HOWTO_PAGES}`,
      110,
      184,
      14,
      palette.teal,
    );
    text(ctx, l[0], 110, 232, 27, palette.gold, "Georgia");
    l.slice(1).forEach((t, i) =>
      text(ctx, t, 110, 285 + i * 39, 17, palette.paper),
    );
    C.MOTES.forEach((m, i) =>
      sprite(
        ctx,
        C.MOTE_SPRITE_PATHS[m],
        125 + i * 68,
        560,
        C.MOTE_SPRITE_SIZE,
      ),
    );
    button(ctx, s, 0, "RETURN TO THE OBSERVATORY");
    text(ctx, "← / →   TURN THE PAGE", 890, 653, 12, palette.muted);
  }
}
