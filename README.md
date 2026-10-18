# Orrery

A celestial machine-building puzzle for the browser. Arrange brass arms and engraved sigils on a hex field, compose looping instruction tapes, and deliver six copies of every requested constellation without a collision.

The game includes a sixteen-challenge Campaign, ten independent Extras, session records for cost / cycles / area, a five-page guide, and a direct-manipulation editor with unlimited undo and redo. Each challenge ships a verified reference machine accessible through the engine's debug API. References are intentionally not exposed as an in-game solve button.

## Run locally

```sh
npm ci
npm run dev
```

Open the local URL Vite prints. No service, account, or external asset host is needed.

## Production

```sh
npm ci
npm run build
npm run preview
```

The complete static site is written to `dist/`. Serve that directory at a site root or under a sub-path. Asset URLs are relative to the page. The committed `public/assets` link exposes the produced `assets/` directory to Vite's static-file bundling; the build never invokes an asset-generation tool.

## Controls

- **Menus:** arrows to choose, Enter to confirm, Escape to return; pointer and touch work too.
- **Placement:** drag a part from the tray onto a hex. Drag an existing part to move it. Drag a track's open endpoint to extend or shorten its path.
- **Field focus:** Q / E rotate; W / S change arm reach; X removes the selected part.
- **Tape focus:** click a row or cell. G grabs, V drops, A / D rotate, Z / C pivot, W / S extend or retract, T / B advance or recede. Delete blanks a cell; Backspace blanks the preceding cell. R writes a reset; Y repeats the prefix. Arrow keys move the cursor.
- **History:** U undoes, I redoes.
- **Run:** Space starts or pauses, N steps one cycle, comma / period change speed, Escape stops the run and returns to editing.
- **Sound:** M toggles mute. Backtick toggles the engine's diagnostic overlay.

All progress and machines last for the current session. Reloading begins a new apprenticeship.

## Verification

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

Tests exercise every shipped reference machine, the collision sweep, frame partition independence, transformations, completion gates, editor history, validation, and the actual Simple 2D engine over a native canvas. Browser verification also exercises pointer placement, keyboard tape entry, audio loading, production assets, and sub-path hosting.

## Source and assets

`src/game.ts` declares the immutable state and binds the game to Simple 2D. Geometry, simulation, editor transitions, document validation, content, and presentation live in adjacent modules. The simulation samples the prescribed motion paths independently of rendering. The engine owns input, time, asset loading, audio, and diagnostics.

All sprites were produced with `draw` and `draw-sheet`; effects with `particle-2d`; cues with `sfx-synth`; and the 32-second music bed with `music`. The PNGs, particle systems, WAVs, MIDI score, and production logs are committed in `assets/`. The game plays particle systems through `@clockwyrks/particle-runtime/canvas`.

`showcase/` contains captured frames and an engine-recorded, continuous editor-to-completion replay.
