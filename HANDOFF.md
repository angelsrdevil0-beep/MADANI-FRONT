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

## Known issues (found while testing in-browser, not yet fixed)

- **Bots never build Airports**, so no Commercial Aircraft trade ever
  happens between/with bots — only human-built airports trade. Confirmed
  in `src/core/execution/nation/NationStructureBehavior.ts`: its
  structure-type list includes `UnitType.Port` but not `UnitType.Airport`.
  Pre-existing gap from Phase 1, not something any Oil stage touched.
  Will very likely also apply to `UnitType.OilExtractor` once bots are
  in play — relevant to Stage 8 (optional bot AI economy) and worth
  fixing for Airport too if the user wants bot trade to actually work.
- User also saw an IDM ("download mp3") popup while clicking around the
  dev-server UI. Almost certainly IDM's browser download-monitor
  misfiring on the game's normal Howler.js audio-asset requests, not a
  code bug — no action taken.

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
- [ ] **6. Client wiring** (~30-45 min) — icons, build menu, i18n
      (remember `tests/EnJsonSorted.test.ts` enforces alphabetical order),
      keybind, and a storage-level indicator UI (no existing "fill bar"
      pattern to copy exactly — check if the health-bar rendering is
      adaptable before inventing something new).
- [ ] **7. Tests + balance pass + full verification** (~20-30 min) —
      `npx tsc --noEmit`, `npm run lint`, `npm test`, dev-server sanity
      check, update this file's "What's actually done".
- [ ] **8. (optional, low priority, only if asked)** bot AI oil economy.

Total: roughly 8-10 stages. Given the user is pacing usage deliberately,
**confirm before starting each stage** rather than chaining them
automatically, and update the checkboxes/notes above as you go.
