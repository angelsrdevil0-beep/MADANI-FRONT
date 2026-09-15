# Handoff — OpenFrontIO custom fork

**Read this first if you're a new chat session picking this up.** This file
is kept up to date as work progresses specifically so a conversation running
low on context can hand off cleanly to a fresh one. Update it whenever
something material changes — don't let it go stale.

## Where things are

- Repo root: `C:\Users\Bardia\Desktop\CLAUDE\OpenFrontIO-main`
- Git: real repo, `git log --oneline` to see history. As of this writing:
  - `c05309f` — initial unmodified import of upstream OpenFrontIO
  - `d8a722b` — Phase 1: Airport structure + Commercial Aircraft trade plane
  - `63c84bf` — this HANDOFF.md
  - `c54168c` — Stage 0: removed the descoped fighter-jet/carrier scaffolding
  - `a92a279` — HANDOFF.md update
  - `86b04cc` — Stage 1: Commercial Aircraft now renders on the map
  - `dbc2d49` — HANDOFF.md update
  - `d355f5e` — Stage 2: Oil Extractor core data model
  - `d2317ad` — HANDOFF.md update
  - `9909d4c` — Stage 3: Oil Ship + export economy
  - `c2d4870` — HANDOFF.md update
  - `26848ab` — Stage 4: domestic rail export
  - `af3a9b4` — HANDOFF.md update
  - `2b10872` — Stage 5: geography-weighted oil yield
  - `02cb46f` — HANDOFF.md update
  - `f890c76` — Stage 6: client wiring (build menu, sprites, storage bar)
  - `0b0aba4` — HANDOFF.md update
  - `e0410c9` — Post-Stage-6 fixes: shape bug, rail redesign, Oil HUD
  - `1aef1cf` — HANDOFF.md update
  - `2f86174` — Pre-Stage-7 bugfix pass: export timing/spam, water-only
    Oil Ship pathing, bot AI Airport/OilExtractor support
  - `65a3225` — HANDOFF.md update
  - `70bf199` — Stage 7: OilExtractor leveling (stacking), StructureLevelPass
    render fix, full verification
  - `30f1a5c` — HANDOFF.md update
  - `c71d16b` — Fix: phantom half-filled health bar on Oil Extractor
    (BarPass.ts)
- Project docs: `CLAUDE.md` (upstream's own architecture notes — read this
  too, it's accurate and short) and the plan file this session wrote at
  `C:\Users\Bardia\.claude\plans\dreamy-napping-feather.md` (the original
  Airport/Fighter-Jet/Carrier plan — **partially superseded**, see below).

## User's setup / constraints worth knowing

- Windows machine, PowerShell/Git-Bash available. `npm run inst` (not
  `npm install`) to install deps — `--ignore-scripts`, so native modules
  (e.g. `canvas`) never get their binary built. Don't try to build it.
- Dev server: `npm run dev`, serves on **:9000** not 5173.
- Browser-pane automation quirk (confirmed, not a code bug): this game's
  build-placement UI needs a continuous `mousemove` over the canvas to
  compute a "ghost preview" before a click will confirm placement. The
  Claude Browser pane's synthetic clicks don't reliably trigger that char —
  confirmed by testing the exact same click sequence against an untouched,
  pre-existing structure (City) and getting the same failure. Automated
  Vitest tests are the reliable verification path for build/economy logic;
  don't burn time trying to get a visual placement to work in-browser.
- The user is pacing usage carefully — they explicitly asked for phased
  work with time estimates so they don't blow through session budget. Keep
  phases small and give a time estimate before starting each one.

## What's actually done

**Phase 1 — Airport + Commercial Aircraft (commit `d8a722b`)**: a land
structure (no water needed, unlike Port) that auto-spawns a free trade
plane which flies a straight line (new `StraightLinePath` helper, ignores
terrain) to a weighted-random partner airport and pays gold to both sides
on arrival. Mirrors Port + TradeShip almost exactly. Tested end-to-end in
`tests/Airport.test.ts` with the real simulation (not mocks) — build two
airports, run ticks, assert gold increases on both ends. Full suite passes
except pre-existing unrelated flakiness (confirmed against baseline).

**Phase 1's known gap is closed (commit `86b04cc`)**: Commercial Aircraft
now renders. `resources/atlases/unit-atlas.png` (UnitPass's mobile-sprite
atlas, 13×13px cells) got a 13th column — a small grayscale airplane
silhouette, colorized per-player via the shader's existing 3-band
gray-replacement (see `UnitPass.ts`'s doc comment). It renders in the
"missile" z-order bucket (above structures) rather than the ground/sea
bucket boats use, since it's the only mobile unit that flies over land and
needs to show above city/factory/airport icons, not hidden under them.

The two atlas tools (icon-atlas.png's and unit-atlas.png's) are now one
file, `scripts/extendSpriteAtlas.cjs` (`node scripts/extendSpriteAtlas.cjs
<icon|unit>`) — having two separate one-off `.cjs` scripts pushed
eslint's default-project file-count cap (8) over the limit. Both atlas
targets were verified byte-identical to their prior separately-generated
output before committing.

**Stage 2 — Oil core data model + Oil Extractor (commit `d355f5e`)**: new
`UnitType.OilExtractor`, a land/near-shore structure mirroring Port's
shore-adjacency idiom but generalized. Core additions:

- Generic `oil()`/`setOil()` on `Unit` (mirrors `troops()`/`setTroops()`) —
  a genuinely new per-unit numeric resource, plumbed through `UnitImpl.ts`
  and `GameUpdates.ts`'s `UnitUpdate` (worker→main-thread only, no Zod
  schema needed — that layer isn't networked).
- Placement (`PlayerImpl.oilExtractorSpawn()`): plain owned land reuses
  `landBasedStructureSpawn`; water is allowed only within
  `Config.oilExtractorWaterRange()` (15 tiles) of the player's **own**
  shore — a BFS-radius check mirroring `portSpawn`'s, but validating the
  clicked water tile itself instead of snapping onto land.
- `OilExtractorExecution.ts` (new file): each tick, fills `oil` toward
  `Config.oilExtractorCapacity()` (5,000) at `Config.oilExtractorRate()`
  (2/tick flat — no geography weighting yet, that's Stage 5), then stops.
  Wired into `ConstructionExecution.ts` alongside Port/Airport/etc.
- `Config.unitInfo()` entry: cost curve mirrors DefensePost's shape (not
  upgradable — capacity scales by building more extractors, per the
  user's spec, not by leveling one up).
- `tests/OilExtractor.test.ts`: land placement, water-near-own-shore
  placement (allowed), water-far-from-shore placement (rejected, via a
  zero-range config override rather than hunting for map-specific
  coordinates), and end-to-end oil accumulation via the real
  `ConstructionExecution` path, asserting it caps at capacity.

No client wiring yet (icon/build-menu/i18n/sprite/storage-bar UI) — that's
Stage 6, deliberately kept separate. Not yet exported/tradeable — that's
Stage 3 (Oil Ship) and Stage 4 (domestic rail).

Verified: `npx tsc --noEmit` clean, `npm run lint` clean, new tests pass,
full suite has the same 6 pre-existing unrelated client-test failures
(`CosmeticsPaymentsMigration.test.ts`, `InventoryModal.test.ts` — jsdom
navigation/timeout flakiness) confirmed present on baseline via
`git stash` before these changes existed.

**Stage 3 — Oil Ship + export economy (commit `9909d4c`)**: new
`UnitType.OilShip`, the first working oil→gold conversion path. Design
clarification made while implementing (not previously nailed down in the
spec): the user's "traded by rails OR an oil ship" is two **independent**
export paths, not sequential — Oil Ship is a direct extractor-to-extractor
shipment (this stage), separate from the domestic-rail-to-Port/Airport
path (Stage 4), not "rail feeds a ship."

- `OilShipExecution.ts` (new file): near-verbatim mirror of
  `AirportPlaneExecution.ts` — same straight-line travel
  (`straightLinePath`, ignores terrain, same simplification rationale as
  the trade plane: no naval pathfinder needed), same capture/inactive
  destination guards, same "pay gold to both ends on arrival" structure.
  Differs in one place: cargo is a real carried quantity, not a
  distance-computed abstraction, so it's deducted from the source
  extractor's `oil()` at departure and stored on the ship's own `oil()`
  field (reusing the Stage 2 field) rather than tracked as a private
  class member. **Not refunded if the trip fails** (capture/embargo
  mid-flight) — cargo is simply lost, a deliberate simplification.
- `OilExtractorExecution.ts`: gained a periodic spawn check mirroring
  `AirportExecution`'s (`shouldSpawnOilShip()`/`tradingExtractors()`,
  reusing the existing `tradeShipSpawnRate`/`tradeShipSaturation`/
  `tradeShipShortRangeDebuff`/`proximityBonusPortsNb` config curves rather
  than inventing oil-specific ones — Stage 7 balance pass can split them
  out later if needed). **Gated on water contact**
  (`isWater(tile) || isShore(tile))`: a landlocked extractor never spawns
  ships and just accumulates oil until Stage 4's rail exists. Note
  production keeps running between shipments, so a busy trade route sees
  a steady trickle of small shipments, not one-and-done — confirmed via
  test debugging, not a bug.
- `Config.ts`: `oilShipCapacity()` (1,000, smaller than the extractor's
  5,000 cap per spec) and `oilShipGold(cargo, player)` (flat 40
  gold/unit/side placeholder, mirrors `tradeShipGold`'s public-wrapper
  pattern so it can apply the private `goldMultiplierFor` cheat/host
  multiplier).
- `PlayerImpl.oilShipSpawn()`: mirrors `airportTradeSpawn`/
  `tradeShipSpawn` — just checks the tile has the player's own
  OilExtractor.
- `tests/OilShip.test.ts`: landlocked extractor never spawns a ship
  (200 ticks, confirmed zero); a water-adjacent extractor departs with
  cargo (oil drops immediately, before arrival), travels, and pays gold
  to both sides — capacity/production pinned equal+paused in that test so
  exactly one shipment happens, avoiding a race against ongoing
  production when asserting the ship count hits zero again.

Still not wired to rail (Stage 4) or the client (Stage 6).

Verified the same way as Stage 2: `npx tsc --noEmit` clean, `npm run
lint` clean, new tests pass, full suite's only failures are pre-existing
flaky `tests/client/*` files (`CosmeticsPaymentsMigration.test.ts`,
`InventoryModal.test.ts`, and this run also `Auth.steam.test.ts`) —
confirmed unrelated to these changes: none of those files touch
core-sim code, and `Auth.steam.test.ts` passes standalone both with and
without these changes, only flaking under full-suite parallel load
(a pre-existing timing race, not a regression).

**Stage 4 — Domestic rail integration (commit `26848ab`)**: extractors can
now export inland, closing the gap for extractors with no water access.

Key research finding that shaped the design (worth knowing before
touching rail code again): joining the rail network is **not** just
proximity — `PortExecution.createStation()` only creates a
`TrainStationExecution` for a Port if a Factory is *already built nearby*
at that moment (retried every tick via `!unit.hasTrainStation()` until
one appears), and symmetrically `FactoryExecution.createStation()`
retroactively promotes nearby existing City/Port/(now)OilExtractor units
when a Factory is built later. Both directions had to be covered for
OilExtractor. This is a real, enforced gameplay constraint (factories
anchor the rail network), not a UI-only hint — the misleading part is
that the *client-side ghost-rail-preview* gating comment in
`RailNetworkImpl.computeGhostRailPaths()` reads like it's just a preview
nicety, but `PortExecution` enforces the same rule in the actual
core-sim spawn path.

- `OilExtractorExecution.ts`: gained `createStation()` (verbatim mirror
  of `PortExecution.createStation()`) and `maybeExportByRail()`. The
  latter looks up the extractor's own `TrainStation` via
  `mg.railNetwork().stationManager().findStation(unit)`, checks its
  `Cluster` for any station that's an active, owner-owned `UnitType.Port`
  — and if found, drains a chunk of oil (same `oilShipCapacity()` size
  cap, same `oilShipGold()` payout formula as the Oil Ship, reused rather
  than adding new balance constants) straight to gold, paid only to the
  extractor's own owner (domestic, no foreign-partner split needed).
  **No literal Train unit is spawned for oil** — see the design note atop
  the file for why (avoids duplicating `TrainExecution.ts`'s ~300 lines
  of car-spawning/motion-plan/multi-hop-stop logic for a domestic,
  zero-risk transfer where the literal journey isn't gameplay-load-bearing
  the way the Oil Ship's foreign trip is).
- `FactoryExecution.ts` / `RailNetworkImpl.connectToNearbyStations()`:
  both hardcoded `[City, Port, Factory]` type-filter arrays gained
  `UnitType.OilExtractor`, so extractors are discoverable as rail
  neighbors in both build orders (Factory-first or extractor-first).
- **Airport is not supported as a rail export destination** — it isn't
  wired into the rail network anywhere in this codebase (no
  `TrainStationExecution` path for it at all), so adding that is a
  separate, similarly-sized follow-up, not a small addition to this
  stage. Only Port works as the rail destination right now.
- `tests/OilRail.test.ts` (3 tests, small `half_land_half_ocean` map):
  overrides `trainStationMinRange`/`trainStationMaxRange` down from the
  real 15-110 tile constants (too big for the 16x16 test map — same
  test-only-config-override approach used throughout these stages, not a
  behavior change) to verify export-once-connected-to-an-owned-Port,
  never-connects-without-a-nearby-Factory, and
  connected-but-no-owned-Port-still-doesn't-export.
- Also updated: `RailroadSpatialGrid`/`overlappingRailroads`/
  `computeGhostRailPaths` (client build-menu ghost-rail preview) were
  deliberately **left untouched** — they only affect the UI preview, and
  are Stage 6 client-wiring scope like everything else visual.

Verified the same way as prior stages: `tsc --noEmit` clean, lint clean,
all 39 Oil/rail/trade-related tests pass (including the pre-existing
`TradeTrainGolden`/`TradeTrainScenarios` snapshot tests — unchanged,
confirming no regression to the existing train economy). Full suite:
only pre-existing `tests/client/*` flakiness, and this time it was
visibly a *rotating* set of unrelated files failing between runs
(`CosmeticsPaymentsMigration`/`InventoryModal`/`Auth.steam` on one run,
`MainInitialize`/`InventoryModal` on the next) — a timing/resource race
under full parallel load, not a regression from these changes.

**Stage 5 — Geography-weighted oil yield (commit `2b10872`)**: closes the
last open item from the original design decisions — extraction rate now
varies by real-world oil geography instead of being flat everywhere.

Key research finding: `map-generator/assets/maps/<id>/info.json`'s
`nations[].coordinates` (pixel positions of nation labels) are consumed
**directly, unscaled**, as tile coordinates by
`NationCreation.ts` (`new Cell(n.coordinates[0], n.coordinates[1])`) —
confirmed by reading `TerrainMapLoader.ts`, whose `GameMapSize.Compact`
path explicitly **halves** those same coordinates before use, meaning
"Normal" size is 1:1 with info.json as-is. This made the calibration
straightforward: pick 3 real nations from a map's own info.json, pair
each with its real-world lat/lon (general knowledge), solve the 3x3
affine system once (`solve3x3`/Cramer's rule) to get a pixel→lat/lon
transform for that map, then score any tile by proximity (in that
lat/lon space) to a hand-compiled table of real major oil
fields/regions.

- `src/core/configuration/OilGeography.ts` (new file): `OIL_FIELDS`
  table (Ghawar/Persian Gulf, Rumaila, Zakum, West Siberian Basin,
  Permian Basin, Gulf of Mexico, Orinoco Belt, Niger Delta, North Sea,
  Tengiz — weighted roughly by real output, not survey-accurate) +
  `MAP_CALIBRATION` (3-anchor affine per map) + `oilYieldMultiplier()`,
  clamped to [0.5, 5]×.
- **Calibrated maps**: World, Middle East, Mena, Africa — the ones
  covering the regions the user named (Persian Gulf, plus Africa for the
  Niger Delta). Every other map (abstract, small-arena, non-Earth like
  Mars/Luna/Sol, etc.) falls back to a flat 1× multiplier, unchanged
  from before this stage. **Extending coverage to another map is just
  adding one more `MAP_CALIBRATION` entry** — 3 anchors pulled from that
  map's own info.json, no other code changes needed.
- **Determinism care, worth remembering for any future core-sim math**:
  `src/core` must produce bit-identical results on every client (hash
  comparison). `Math.exp`/`Math.cos`/etc. are only spec'd as
  "implementation approximated" (can differ per JS engine) — see
  `DetMath.ts`'s own doc comment, which the codebase already uses
  elsewhere (`Config.tradeShipGold`). This module uses `DetMath.exp()`
  instead of `Math.exp()`, and deliberately drops the usual
  `cos(lat)`-scaled longitude distance correction (a minor accuracy
  trade, fine since every calibrated map/field is far from the poles)
  to avoid `Math.cos` entirely rather than hand-rolling a deterministic
  cosine for this. `Math.sqrt`/`Math.min`/`Math.max`/`Math.floor` are
  IEEE-754-required to be exact, so those stayed as-is.
- `Config.oilExtractorRate()` signature changed from zero-arg to
  `(px, py)` — multiplies a flat base rate (still 2/tick) by
  `oilYieldMultiplier()`. Normalizes for `GameMapSize.Compact`'s
  coordinate-halving internally (doubles px/py back before calibration
  lookup) so callers never need to think about map size.
  `OilExtractorExecution.produce()` passes `mg.x(tile)`/`mg.y(tile)`.
  Existing tests that stubbed the old zero-arg signature
  (`game.config().oilExtractorRate = () => 5`) needed no changes — JS
  ignores extra call-site arguments.
- Tests: `tests/OilGeography.test.ts` (5, pure-function: flat baseline
  for uncalibrated maps, Ghawar-proximity scores higher than a
  far-away point on both World and Africa maps, deterministic,
  stays in bounds) + `tests/OilExtractorRate.test.ts` (2: Compact-size
  normalization produces the same rate as the equivalent Normal-size
  point, and geography multiplies rather than replaces the base rate).

Verified the same way as every prior stage: `tsc --noEmit` clean, lint
clean, all 16 Oil-related tests pass, full suite's only failure is the
same recurring `tests/client/InventoryModal.test.ts` flakiness seen in
every stage so far (still unrelated - never touched that file).

**Stage 6 — Client wiring (commit `f890c76`)**: Oil Extractor is now
selectable, placeable, and visible in-game; Oil Ship renders once
spawned. This landed heavier than the original 30-45 min estimate (final
scope closer to that estimate once the real touch list was mapped, but
research to find that list took real time) — see the research notes
below if this pattern needs repeating for a future unit.

Key research findings, worth knowing before touching client rendering
again:

- **There are three separate places a new unit type has to be
  registered on the client**, not one: (1) `src/client/render/types/
  UnitType.ts` — the render layer's own mirrored string-constant copies
  (`UT_*`) of `UnitType`, plus derived sets (`STRUCTURE_TYPES`) and the
  `ALL_UNIT_TYPES` list — **and these must also be re-exported from
  `src/client/render/types/index.ts`'s barrel**, easy to miss (caused a
  `tsc` failure here); (2) the per-pass atlas-column order arrays
  (`StructurePass.STRUCTURE_ORDER` / `UnitPass.UNIT_ORDER`) that
  actually determine sprite position; (3) `HotbarIcons.ts` +
  `BuildMenu.ts`'s separate SVG-based HUD icon system — structures get
  rendered on the map via the icon-atlas.png (StructurePass), a
  completely different asset from the build-menu's own SVG icon.
- **`StructureLevelPass.ts` (level-number digits) and `PointLightPass.ts`
  (glow) don't cover Airport either** — a pre-existing Phase-1 gap, not
  something this stage needed to fix. OilExtractor doesn't need either
  since it isn't upgradable, so this was a non-issue in the end, but
  worth knowing if Airport's own gap ever gets fixed.
- **The storage-fill indicator turned out easy**, contrary to HANDOFF's
  prior uncertainty: `BarPass.ts`'s `computeStructureProgress()` already
  handles construction/deletion/missile-readiness as a generic "progress
  bar below structures" concept — adding Oil's storage fill was one
  `if` branch, once `oil` was plumbed through `UnitState`
  (`render/types/Renderer.ts`) and `UnitView.ts`'s two
  UnitUpdate→UnitState converters (`unitStateFromUpdate`/
  `applyUpdateInPlace`). Unlike health/missile bars (hidden when
  "nothing interesting"), the oil bar always shows whenever there's any
  oil, so it doubles as a live "how full is my tank" readout.
- Adding a required field to `UnitState` breaks every test file that
  builds a literal `UnitState` object (7 files here) — TypeScript catches
  all of them at once via `tsc --noEmit`, so this is mechanical
  (add the field to each fixture) rather than risky, just noisy.
- The in-game radial/build-menu UI is canvas-rendered and not exposed via
  the accessibility tree or light DOM the way `run-openfront` skill notes
  suggested for other components — `document.querySelector("build-menu")`
  **does** exist but renders into a `shadowRoot`, and stays empty until
  the real open flow runs. The reliable way to open it from automation
  turned out to be simulating the actual user gesture (**ctrl+left-click
  on owned territory** dispatches `ShowBuildMenuEvent`), not DOM/event-bus
  poking. Confirmed working end-to-end this way: the build menu opened
  with all 12 items including Oil Extractor, correct icon, description,
  and cost (150K).
- Sprite atlas surgery reused Stage 1's `scripts/extendSpriteAtlas.cjs`
  unchanged in mechanism — just swapped in two new `draw*` functions
  (removed the old Airport/Commercial-Aircraft ones since they'd
  otherwise be unused-and-lint-flagged dead code; their history is in
  git, referenced by the script's own comment now). Verified the two
  atlas PNGs' new columns have the expected non-transparent pixel data
  by decoding them directly in Node (not just "the script printed
  success") before trusting them.
- One over-addition caught by tests: I added a `help_modal.build_oil_
  extractor_desc` key "for consistency" with other structures, without
  actually wiring a call site for it — `tests/TranslationSystem.test.ts`
  correctly flagged it as unused and it was removed. Lesson: only add
  i18n keys that have a real `translateText()` call site.

Verified: `tsc --noEmit` clean, lint clean, full suite passes except the
same recurring `tests/client/InventoryModal.test.ts` flakiness seen every
stage (unrelated - never touched). Live-verified in the browser (see
above) rather than just trusting the automated checks, since this was
UI-facing work.

**Post-Stage-6 fixes (commit `e0410c9`)**: the user tested Stage 6 in a
real game and reported four things — one real rendering bug, one missing
registration spot, one deliberate mechanic they didn't like, and one
missing feature. All four addressed in one pass:

1. **Airport/OilExtractor rendered as a triangle, and Airport looked
   "half-cut" while under construction.** Root cause:
   `structure.frag.glsl`'s `shapeSDF()` hardcodes a shape per atlas
   column with exactly 6 explicit branches (City/Port/Factory/
   DefensePost/SAM/Silo); the *last* branch (Missile Silo's triangle)
   doubles as the unconditional fallback for anything with a higher
   atlas index. Airport (column 6, added Phase 1) and Oil Extractor
   (column 7, added Stage 6) both silently fell into that triangle
   branch — nobody had added their own circle case. The "half-cut
   during construction" report was the same bug wearing a different
   hat: the white icon glyph is clipped against `sdf` (the shape mask),
   so a triangle-shaped mask chops off whatever part of a
   roughly-circular icon sticks outside a triangle. One fix (two new
   explicit circle branches) resolved both symptoms. **Lesson for next
   time a structure atlas column is added: `shapeSDF()` in
   `structure.frag.glsl` needs an explicit branch too — the fallthrough
   silently "succeeds" (renders *something*) so tests and `tsc` won't
   catch a missing one.**
2. **Oil Extractor was missing from the bottom hotbar.** Found a THIRD
   separate place new buildable units must be registered:
   `UnitDisplay.ts` (the hotbar strip) keeps its own explicit per-type
   fields/render calls, independent of both `BuildMenu.ts`'s
   `buildTable` and the render layer's `UnitType.ts` — missed in Stage
   6's already-long list of touch points.
3. **Rail export redesigned.** The user disliked oil converting straight
   to gold the instant it reached a rail-connected Port ("it started
   giving me money every seconds"). Changed to: oil now accumulates in
   the Port's own stockpile (reusing the generic `Unit.oil()` field),
   and the Port itself periodically exports that stockpile as one big,
   visibly-wider-hulled Oil Ship shipment to a foreign trading Port
   (`PortExecution.maybeSpawnOilShip`, reusing `tradingPorts()`'s
   existing weighted-partner logic) — bigger cargo cap (3,000 vs the
   direct-from-extractor ship's 1,000) and a redrawn sprite spanning
   most of the 13×13 unit-atlas cell instead of the original compact
   one. `OilShipExecution` now takes an explicit `cargoCapacity` so
   both origins (Stage 3's direct coastal-extractor ship, this new
   Port-collected one) share the one implementation.
4. **New Oil currency indicator** in the player HUD
   (`ControlPanel.ts`) — black droplet icon, "L" (liters) suffix, sum of
   `oil()` across every owned OilExtractor + Port, shown once the player
   has built at least one extractor.

Verified: `tsc`/lint clean, full suite green (only the recurring
unrelated `InventoryModal.test.ts` flakiness), and the two new atlas
sprite edits (bigger Oil Ship) were pixel-verified by decoding the PNG
directly, same as every prior atlas change this project. Could **not**
get a clean live screenshot of the circle-shape fix this round — the
Browser pane stayed at a narrow (~457px) width for the whole session
despite `resize_window` calls (the WebGL canvas doesn't appear to
respond to a runtime viewport change without a reload), which also hid
the desktop-layout hotbar. Did confirm via the DOM that the hotbar's
Oil Extractor entry renders (`find("oil")` located it) and via the
ctrl+click grid build menu (real Lit DOM, unaffected by the narrow
pane) that nothing regressed. **If picking this up again and a visual
check matters, try a fresh session/reload before fighting the pane
width.**

`scripts/extendSpriteAtlas.cjs` gained a second capability while making
the sprite bigger: `editColumn()` redraws an *existing* atlas column in
place (clears it, redraws, keeps the file's dimensions) as opposed to
`extendAtlas()` which always appends a new one — needed here since the
Oil Ship column already existed from Stage 6 and re-running the old
"unit" target would have appended a stray, unused 15th column instead
of revising the 14th. Invoked via a new third CLI mode,
`unit-redraw-oilship`.

**Pre-Stage-7 bugfix pass (commit `2f86174`)**: the user
tested the oil economy again after Stage 6/post-fixes and reported three
problems, all fixed in one pass before proceeding to Stage 7:

1. **Oil exported continuously instead of "fill first, then export."**
   Root cause: `OilExtractorExecution.maybeExportByRail()` triggered on
   `oil() > 0` (any oil at all) every ~10 ticks, and both
   `PortExecution.maybeSpawnOilShip()` and the extractor's own direct-ship
   spawn used the same probabilistic `tradeShipSpawnRate()` "pity timer"
   TradeShip uses — which ramps to a near-100% chance within a few
   rejections, so once oil started flowing it spawned a new Oil Ship on
   almost every check. Fixed by: (a) extractors now only export via rail
   once `oil() >= oilExtractorCapacity()` (full), and when they do, the
   *entire* tank moves to the Port in one shot (capped by the Port's
   remaining room) instead of a bounded per-check chunk; (b) the direct
   extractor-to-extractor Oil Ship path gained the same "must be full"
   gate; (c) both that path and the Port's own Oil Ship spawn switched
   from the probabilistic pity-timer to a flat cadence — new
   `Config.oilShipSpawnIntervalTicks()` (default 50 ticks = 5s, matching
   the user's own "every 5 seconds" spec). The Port itself still ships
   out whenever it has *any* oil (not gated on being full) — only the
   extractor's own tank has the "fill first" rule; the Port is a
   pass-through collector, not a second tank to top off.
2. **Oil Ships could cross land.** `OilShipExecution` had copied
   `AirportPlaneExecution`'s `straightLinePath` (deliberately
   terrain-ignoring, correct for a plane) instead of `TradeShipExecution`'s
   `WaterPathFinder`-based routing. Rewritten to mirror `TradeShipExecution`
   exactly (same stagger/memoized pathfinder, same `PathStatus.NEXT/
   COMPLETE/NOT_FOUND` per-tick stepping, same motion-plan recording). Also
   added water-component reachability filtering to
   `OilExtractorExecution.tradingExtractors()` (mirroring
   `PortExecution.tradingPorts()`'s existing pattern) so a destination is
   only offered if it's actually reachable by water from the source,
   rather than just "is water/shore adjacent" with no connectivity check.
3. **Bots never build Airport or OilExtractor at all** — this is why solo
   airports never got a trade partner and bots never touched oil.
   `NationStructureBehavior.ts` (the bot AI's structure planner) had a
   hardcoded ratio table, build-order list, and value-function switch that
   simply never mentioned either type — not a bug in the oil/airport code
   itself, a missing integration. Added: ratio entries (0.5 per city for
   both, a first-pass guess — tune later if bots over/under-build them),
   both added to `buildOrder` (right after Port/Factory, before military
   structures), and new `airportValue()` (mirrors `portValue()` — spacing
   only, land-only via the existing generic land-tile path since Airport
   needs no coastal check) and `oilExtractorValue()` (spacing +
   `Config.oilExtractorRate()`-weighted preference for real-world-yield
   tiles, land-only for bots — a bot never uses the water-near-shore
   placement option a human can, to avoid duplicating Port's
   shore-adjacency search for a bot-only path; flagged as a possible
   follow-up, not done here). Also added both types to
   `samLauncherValue()`'s protected-structure list so bot SAMs consider
   covering them.

Verified: `tsc --noEmit` clean, lint clean. Updated two existing tests
whose setup assumed the old behavior (`tests/OilRail.test.ts`'s "moves oil
into stockpile" test now sets a matching extractor capacity so its seeded
oil level counts as "full"; `tests/OilShip.test.ts` now sets
`oilShipSpawnIntervalTicks` to 1 in its shared `beforeEach` so ship-spawn
tests don't need to wait out the real 5s cadence) and added new ones: a
"does not export a partially-filled extractor" test, a "ship only ever
moves over water" test (tracks every tile the ship occupies mid-transit
and asserts each is water), and five new `NationStructureBehavior` unit
tests covering the new value functions and ratio entries. Full suite:
6154 passed, only the same pre-existing unrelated `InventoryModal.test.ts`
jsdom timeout flakiness (5 tests, every prior stage has hit this, never
touched that file). `tests/NationGoldPerMinute.test.ts`'s 20-minute
nation-economy snapshot needed updating (`npx vitest run
tests/NationGoldPerMinute.test.ts -u`) — bots participating in the
oil/airport economy for the first time roughly doubled shipsArrived
(1489→3209) and raised tradeGold (371.6M→614.6M) map-wide, which is the
fix working as intended, not a regression; re-review that snapshot diff
again if it swings by a similar order of magnitude after any future
change to bot structure ratios.

Not yet done: no live in-browser verification this round (this was a
core-sim bugfix pass, not UI-facing — see the Browser-pane automation
quirk note above for why automated tests are the reliable path here
anyway). If picking this up again, a real multiplayer/bot game would be
the way to visually confirm bots now build airports/extractors and ships
hug the coastline.

**Stage 7 — stacking/leveling + full verification (commit `70bf199`)**:
the user asked for two things before finishing Stage 7: make
Airport and OilExtractor "stackable" (their words) — either build several
side by side, or upgrade one in place — and make sure the bot AI actually
uses that. Plus the originally-planned Stage 7 verification pass.

Key finding: **Airport already fully supported this.** It's had
`upgradable: true` in `Config.unitInfo()` since Phase 1, and
`AirportExecution.shouldSpawnTradePlane()`/`tradingAirports()` already
loop `airport.level()` times (mirroring `PortExecution` exactly) — a
level-5 Airport already got 5x the trade-plane spawn attempts and 5x the
destination-selection weight. It just... never got exercised, since
nothing before this stage ever leveled one up. So Airport needed no core
changes.

**OilExtractor did need the core change**, since it was deliberately built
non-upgradable in Stage 2 (see the original design decision above — "not
upgradable... capacity scales by building more extractors"). The user's
own framing settled the ambiguity: building several extractors side by
side and leveling up one extractor are meant to be two **different**
scaling strategies, not the same thing achieved two ways — "5 next to each
producing 5x oil in a long time" (more separate tanks = more total oil
over time, already true, no change needed) vs. "5 on each other that
produce 1x oil in 1/5x time" (one tank, same size, filled 5x faster).
Implemented literally: `Config.ts`'s `OilExtractor` entry gained
`upgradable: true` (its existing cost curve — `costWrapper` keyed on
`unitsOwned(OilExtractor)` — already applies to upgrades for free, same
mechanism Port/City/Factory/Airport/SAM/Silo all already use, confirmed by
reading `PlayerImpl.upgradeUnit()`/`costWrapper`), and
`OilExtractorExecution.produce()` now multiplies the geography-weighted
base rate by `this.extractor.level()` while `oilExtractorCapacity()`
stays flat regardless of level — same tank, faster fill, not a bigger
tank. No level cap exists anywhere in this codebase for any upgradable
type (upgrades are gated purely by cost, which is itself capped per-type,
e.g. OilExtractor tops out at 800k gold/upgrade) — OilExtractor doesn't
introduce one either, consistent with how Port/City already work.

**Bot AI needed no new code at all**, just the config flag. Once
`unitInfo(type).upgradable` is true, `NationStructureBehavior.
maybeSpawnStructure()`'s existing generic upgrade-consideration path
(`getTotalStructureDensity() > threshold && unitInfo(type).upgradable` →
`maybeUpgradeStructure()`) already applies to any type in `buildOrder` —
and both Airport and OilExtractor were already added to `buildOrder` in
the pre-Stage-7 bugfix pass above. So bots now upgrade both exactly the
same generic way they've always upgraded Port/City/Factory/SAM/Silo, with
no per-type-special-casing required.

**One real rendering bug found and fixed along the way**:
`StructureLevelPass.ts` (draws the level-number digits above a leveled
structure) has its own hardcoded copy of the atlas column order
(`STRUCTURE_ORDER`), separate from `StructurePass.ts`'s canonical one —
and its copy was never updated when Airport/OilExtractor were added to
the real atlas in Phase 1/Stage 6. Looking a type up in
`typeToAtlasCol` for either of them silently returned `undefined`,
defaulting (`?? 0`) to atlas column 0 — City's column — so a leveled
Airport or OilExtractor would have rendered its level digits in the wrong
place/shape once anyone actually leveled one up. Since Airport has been
upgradable since Phase 1, this bug already existed; it just had never
been triggered because nothing before now ever called
`increaseLevel()` on one. Fixed by adding `UT_AIRPORT`/`UT_OIL_EXTRACTOR`
to `StructureLevelPass.ts`'s `STRUCTURE_ORDER`, in the same position
`StructurePass.ts` uses. (Checked `PointLightPass.ts` — its "glow" list
is a deliberate per-type opt-in, not an atlas-order array, and most
structure types including DefensePost/SAM/MissileSilo already have no
glow by design, so Airport/OilExtractor lacking one isn't a bug, just
unstyled — left alone as a cosmetic non-issue, not a follow-up.)

Verified: `tsc --noEmit` clean, lint clean. Added a test asserting
`OilExtractor` is upgradable and that going from level 1 to level 4
quadruples the per-tick fill rate while `oilExtractorCapacity()` stays
unchanged. Full suite run twice (once after the stacking changes, once
as the final Stage 7 verification pass): both times only the same
pre-existing unrelated `InventoryModal.test.ts` flakiness. The
`NationGoldPerMinute` 20-minute snapshot needed updating **again**
(bots now also upgrading Airport/OilExtractor pushed shipsArrived
3209→3473 and tradeGold 614.6M→644.6M — a much smaller jump than the
pre-Stage-7 pass's, consistent with "existing bot economy plus leveling
an already-built structure" being a smaller effect than "bots building
an entirely new structure type for the first time").

Not done, flagged as optional follow-ups rather than blockers: no live
in-browser confirmation that a leveled Airport/OilExtractor actually
shows the right level digits on the map (same browser-automation
limitation as every other stage — the fix was verified by reading
`StructurePass.ts`'s canonical order and matching it exactly, not by
screenshot); `oilExtractorValue()` (bot tile-scoring for OilExtractor)
still only considers land placement, so a bot will never build one on
water-near-shore the way a human player can — flagged back in the
pre-Stage-7 pass too, still not done.

**Bug fix — phantom health bar on Oil Extractor (commit `c71d16b`)**: the
user reported a second bar always sitting above the Oil Extractor icon,
stuck at half-filled, present in every state (building/extracting/full)
- distinct from the intended oil-fill bar (which renders below the icon
and correctly reflects real fill level). Root cause, found by reading
`BarPass.ts` (no live repro was needed to *find* it, though one was done
afterward to confirm): `Renderer.updateUnits()` calls
`barPass.updateBars(units, this.lastStructures, gameTick)`, and both
arguments actually receive the **same full unit map** -
`Renderer.updateStructures()` sets `this.lastStructures = units` with no
filtering, so "mobileUnits" in `BarPass`'s own signature is a misnomer,
not an enforced split. This was harmless as long as Warship was the only
unit type with a non-null `health` (the loop's only real guard was
`health !== null`) - but OilExtractor has carried its own `maxHealth: 500`
since Stage 2 (for PvP destructibility, unrelated to this bar), making it
the second type this loop ever sees structures come through. Worse, the
loop's max-health divisor was hardcoded to `this.warshipMaxHealth` (1000)
for every unit regardless of actual type, so a fresh, fully-healthy
Oil Extractor (500/500) read as `500/1000` - exactly 0.5, forever,
regardless of its real state. Fixed with one line: `if
(STRUCTURE_TYPES.has(unit.unitType)) continue;` at the top of the loop -
health bars are only ever meant to hover over mobile units (the class's
own header comment already said "above warships"), and structures'
damage state (if any structure ever needs to show one) belongs on the
progress-bar slot below them instead, not this one. This also
future-proofs the bar against any other structure type gaining a
`maxHealth` later.

Live-verified: started a real Solo game via the Claude Browser pane
(headless Playwright was tried first as a more reliable driver per the
`run-openfront` skill, but its Chromium download is geo-blocked on this
network - reverted that install attempt cleanly, `git status` confirms no
stray package.json/lock changes). Two things worth remembering for next
time this is needed: (1) the `single-player-modal` Lit element's
properties (`bots`, `instantBuild`, `infiniteGold`, `selectedDifficulty`,
`nations`, etc.) are directly settable from page JS before clicking Start
- `selectedDifficulty` is a **string enum** (`"Easy"`, not `0`); passing a
raw number throws `Unexpected value: 0` deep in an `assertNever` and
silently wedges game startup. (2) The documented ctrl+click-to-open-
build-menu gesture needs a **real `keydown`/`keyup` KeyboardEvent with
`code: "ControlLeft"`** dispatched on `window` - `InputHandler.ts` tracks
modifier state via its own `activeKeys` Set populated by real keyboard
listeners, not the mouse event's `ctrlKey` flag, so `computer`'s
`modifiers: "ctrl"` click parameter alone does not open it (confirmed:
the click went through fine, the menu just never left `.hidden`). Wrapping
a plain click in `window.dispatchEvent(new KeyboardEvent("keydown", {code:
"ControlLeft", ...}))` / `"keyup"` opened it reliably. Built two Oil
Extractors this way and confirmed via `myPlayer().units()` ground truth
(oil/health/tile fields) that they existed and were producing; the user
watched the fix land live via Vite HMR in their own tab and confirmed
"it works" before this round's automated verification even finished.

Verified: `tsc --noEmit` clean, lint clean, full suite green (6156
passed) except the same pre-existing unrelated `InventoryModal.test.ts`
flakiness. No dedicated unit test added for `BarPass.ts` - like every
other GL render pass in this codebase (`StructurePass`,
`StructureLevelPass`, `PointLightPass`, none of which have test files
either), it needs a constructed `WebGL2RenderingContext` and is
verified live instead, consistent with prior stages' approach to render
bugs (e.g. the shapeSDF triangle/circle fix).

## Known issues (found while testing in-browser, not yet fixed)

- User also saw an IDM ("download mp3") popup while clicking around the
  dev-server UI. Almost certainly IDM's browser download-monitor
  misfiring on the game's normal Howler.js audio-asset requests, not a
  code bug — no action taken.
- The dev build fires a request to a third-party domain
  (`introjava.com`, blocked by CORS in this dev environment so no data
  actually leaves) — surfaced in the console during this round's
  testing. Looks like an ad/monetization-stub call from the closed-source
  API layer (not in this repo), not something introduced by any Oil
  stage. Flagging in case it's unexpected; harmless as observed (request
  never succeeds).

## What got explicitly descoped

The original plan (see the plan file above) called for a 3-tier fighter-jet
roster (Air Fighter / Stealth Fighter / Ground Attacker), an Aircraft
Carrier, and an Air Missile projectile, styled on a real OpenFrontIO fork
called **OpenBattle** (openbattle.ir — no public source repo; its balance
numbers were extracted directly from its shipped JS bundle, which is fair
game since OpenFront runs its simulation client-side and that data is
already served to every player's browser — see this session's transcript
around the OpenBattle investigation if you need the method again).

**The user decided against all of that.** Airport + Commercial Aircraft is
enough; no fighters, no carrier.

### Cleanup task — DONE (commit `c54168c`)

Removed from `Game.ts`/`Config.ts`/`PlayerImpl.ts`: the 5 dropped
`UnitType` enum members, their `BuildableAttacks`/`AirCombatUnits`/
`PatrolUnits` group entries, their `UnitParamsMap` entries, their
`unitInfo()` cases, their `canSpawnUnitType` placeholder cases. Verified
via `npx tsc --noEmit` (clean — compiler's `assertNever` exhaustiveness
check would have flagged any stray reference) and the full test suite
(same pre-existing unrelated flakiness as before, nothing new broken).
`UnitType.Airport`/`.CommercialAircraft` untouched.

## New request — Oil System (not started)

User's own words, verbatim:

> its a new currency and will be traded to coins automatically. New
> buildings: oil extractor, each oil extractor extracts oil and has a
> maximum space by adding more extractors you can save more oil the oil
> gets traded by rails or a oil ship. new ships: an oil ship has a smaller
> storage and takes the oil and takes it to the trading country and
> converts it to oil [sic — almost certainly means "gold"]. oil extracting
> system has to be effective by real world data like the persian gulf
> venezuela us and the real world things that have more oil give more oil
> to us. oil extractor can be placed on soil or water but by placing it in
> water should not be so far than land.

Read literally, this is: Oil is a new resource with **capped local
storage per extractor** (a genuinely new mechanic — nothing in this
codebase currently caps a resource and blocks production when full), grown
by placing more extractors. Oil converts to gold specifically **at the
destination when exported** via a rail network or a new "Oil Ship" (a
smaller-capacity TradeShip analogue), i.e. it mirrors the Port/TradeShip
export-economy pattern, not a passive domestic tax. Extraction yield should
be geographically weighted toward real-world oil-rich regions (Persian
Gulf, Venezuela's Orinoco Belt, US Permian Basin/Gulf of Mexico, presumably
also Russia/Siberia, North Sea, Nigeria — the user only named three
examples). Placement: land anywhere, or water within some limited distance
of the coast (mirrors Port's shore-adjacency concept, generalized to a
short range instead of exactly-on-shore).

### Design decisions — CONFIRMED by user, build to these

1. **Oil→gold: export-only.** Oil sitting at an extractor is worthless
   until it reaches a trading partner via ship or (domestic) rail. Mirrors
   Port/TradeShip exactly — no domestic trickle-conversion.
2. **Oil Ships are auto-spawned**, like TradeShip/Commercial Aircraft.
   Fully passive — an extractor periodically sends a full load to a
   weighted-random trading partner. No player-facing selection/movement
   controller needed.
3. **Rail is domestic-only.** Oil rides the *existing* rail network
   (Factory/Port/City + Train) from an extractor to your own nearest
   Airport/Port, which then exports it normally. No cross-border rail
   behavior — this significantly de-risks the feature, since it reuses the
   rail network as-is rather than inventing foreign-territory train travel.
4. **Overflow**: extractor just stops producing when its storage cap is
   full (simplest option, not explicitly asked but going with it — flag if
   this needs revisiting).
5. **Geography: "data-driven from real coordinates" — chosen, but read
   this carveout.** Checked `map-generator/assets/maps/*/info.json`: maps
   carry **pixel coordinates for nation labels only** (e.g. Africa map:
   `"Saudi Arabia": [1757, 381]`), **no lat/lon metadata anywhere** in this
   codebase. There's no existing geo-projection to hook into.

   The plan to still make this genuinely "data-driven" rather than
   hand-wavy: **bootstrap a per-map pixel→lat/lon affine transform** from
   2–3 of a map's own nation-coordinate anchors (real lat/lon for e.g.
   Riyadh, Baghdad, Lagos — general knowledge, no external data needed),
   then score each tile's oil yield by proximity to a small hand-compiled
   table of real major oil fields/regions (Ghawar/Persian Gulf ~25.4°N
   49.6°E, Permian Basin ~31.8°N 102.5°W, Orinoco Belt ~8.5°N 62°W, West
   Siberian Basin, North Sea, Niger Delta ~5°N 6°E, etc.), weighted by
   real-world output. This is a genuine calibration from real coordinates,
   just not a true GIS projection — every map's crop/projection differs
   slightly, so treat yield as "geographically informed," not
   survey-accurate. **Calibrate per-map, starting with the maps where it
   actually matters** (World + Middle East/regional maps covering the
   named regions); flat baseline everywhere else (abstract/non-Earth maps,
   small arena maps).

## Reusable architecture notes (from Phase 1's research — still valid)

- Structure economy pair (Port+TradeShip) → mirrored for Airport+
  CommercialAircraft in `src/core/execution/AirportExecution.ts` /
  `AirportPlaneExecution.ts`. **This is the template for OilExtractor +
  OilShip** — read those two files first, they're short and already show
  every pattern needed (weighted trading-partner selection, periodic spawn
  check, gold-on-arrival).
- `PlayerImpl.canSpawnUnitType()` (`src/core/game/PlayerImpl.ts`) is the
  single switch that gates where every unit type can be built; it uses
  `assertNever` in its default case, so the compiler forces a case for
  every `UnitType` — use compiler errors as your checklist when adding
  OilExtractor/OilShip.
- `Config.unitInfo()` (`src/core/configuration/Config.ts`) is where
  cost/maxHealth/constructionDuration live per unit type.
- Client wiring for a new buildable follows one path every time: icon
  (`resources/images/`, `src/client/hud/HotbarIcons.ts`) → build menu entry
  (`src/client/hud/layers/BuildMenu.ts`) → i18n
  (`resources/lang/en.json`'s `unit_type.*`/`build_menu.desc.*`/
  `user_setting.build_*` — **must stay alphabetically sorted**, there's a
  `tests/EnJsonSorted.test.ts` that enforces it) → keybind
  (`src/core/game/UserSettings.ts` default + `src/client/InputHandler.ts`'s
  `resolveBuildKeybind` table + `src/client/UserSettingModal.ts` UI block)
  → sprite (`StructurePass.ts`'s icon atlas for a structure, `UnitPass.ts`'s
  unit atlas for a mobile unit).
- `tests/util/Setup.ts`'s `setup()` + `tests/util/utils.ts`'s
  `executeTicks()` are the test harness; write tests against the real
  simulation, not mocks (per `CLAUDE.md`).
- Sprite atlases (`resources/atlases/*.png`) have no generator script in
  this checkout. `scripts/extendSpriteAtlas.cjs` is a hand-rolled pure-Node
  PNG chunk encoder/decoder (no native deps), proven for both the
  fixed-64×64-grid icon atlas and the fixed-13×13-grid unit atlas — run
  `node scripts/extendSpriteAtlas.cjs <icon|unit>` and edit the relevant
  `draw*` function at the bottom for a new sprite/icon. (Turns out
  unit-atlas.png's columns are a **uniform 13×13 grid**, not the
  variable-size-per-type layout the doc comment implies — the smaller
  stated sizes like "5×5" are just how much of the 13×13 cell each sprite
  actually draws into, not a different cell size. Simpler than Phase 1's
  handoff note assumed.)

## Staged plan (each stage = roughly one focused chat turn/session)

Update the checkbox and add a one-line note as each lands. Estimates are
rough effort sizing, not wall-clock guarantees.

- [x] **0. Cleanup** — done, commit `c54168c`.
- [x] **1. Render Commercial Aircraft** — done, commit `86b04cc`.
- [x] **2. Oil core data model + Oil Extractor** — done, commit `d355f5e`.
- [x] **3. Oil Ship + export economy** — done, commit `9909d4c`.
- [x] **4. Domestic rail integration** — done, commit `26848ab`.
- [x] **5. Geography-based yield weighting** — done, commit `2b10872`.
- [x] **6. Client wiring** — done, commit `f890c76`.
- [x] **6.5. Pre-Stage-7 bugfix pass** (export timing/spam, water-only Oil
      Ship pathing, bot AI Airport/OilExtractor support) — done, commit
      `2f86174`.
- [x] **7. Tests + balance pass + full verification** — done, commit
      `70bf199`. Also folded in the user's "make Airport/OilExtractor
      stackable (leveling)" request, since it landed right before this
      stage: `tsc --noEmit` clean, lint clean, full suite green (6156
      passed) except the same pre-existing unrelated
      `InventoryModal.test.ts` flakiness every stage has hit. See the
      Stage 7 section above for what "stackable" turned into concretely.
- [x] **8. Bot AI oil economy** — turned out to already be covered:
      bots building Airport/OilExtractor was fixed in the pre-Stage-7
      pass (`2f86174`), and bots *upgrading* them (this stage's stacking
      work) needed no bot-specific code at all — the existing generic
      upgrade-consideration path in `NationStructureBehavior.
      maybeSpawnStructure()` already applies to any `upgradable` type in
      `buildOrder`. Nothing further planned here unless the user asks for
      something more specific (e.g. tuning how aggressively bots upgrade
      vs. build new).

Total: roughly 8-10 stages. Given the user is pacing usage deliberately,
**confirm before starting each stage** rather than chaining them
automatically, and update the checkboxes/notes above as you go.
