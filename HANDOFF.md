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

**Known gap**: Commercial Aircraft doesn't render on the map yet. Airport
(a *structure*) does render — its icon was hand-added as a 7th column to
`resources/atlases/icon-atlas.png` using a new standalone tool,
`scripts/extendIconAtlas.cjs` (pure Node zlib PNG chunk surgery — no native
deps, since the real `generate-sprite-atlases.mjs` generator isn't in this
checkout). Commercial Aircraft is a *mobile unit* and needs the same
surgery on `resources/atlases/unit-atlas.png` instead — a harder target
because its columns are **variable-size** (5×5 to 13×13 px, see the doc
comment at the top of `src/client/render/gl/passes/UnitPass.ts`), unlike
the icon atlas's uniform 64×64 grid. `scripts/extendIconAtlas.cjs` is not
directly reusable as-is for this — needs adapting (or write a sibling
`extendUnitAtlas.cjs`). This is the very next thing to finish.

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
  this checkout. `scripts/extendIconAtlas.cjs` is a hand-rolled pure-Node
  PNG chunk encoder/decoder (no native deps) proven to work for the
  fixed-64×64-grid icon atlas — reuse its `decodePng`/`encodePng`/
  `addColumn` helpers for a `unit-atlas.png` variant, just handle variable
  per-column sizes instead of a fixed grid.

## Staged plan (each stage = roughly one focused chat turn/session)

Update the checkbox and add a one-line note as each lands. Estimates are
rough effort sizing, not wall-clock guarantees.

- [x] **0. Cleanup** — done, commit `c54168c`.
- [ ] **1. Render Commercial Aircraft** (~20-30 min) — finish Phase 1's
      known gap: extend `unit-atlas.png` (variable-size columns, harder
      than the icon atlas) with a plane sprite, wire it into `UnitPass.ts`.
- [ ] **2. Oil core data model + Oil Extractor** (~45-60 min) — new
      `UnitType.OilExtractor`, the storage-cap mechanic (new to this
      codebase — a resource that fills and blocks production at capacity),
      placement rule (land, or water within a short range of shore —
      generalizes Port's shore-adjacency), flat-rate extraction to start
      (no geography yet).
- [ ] **3. Oil Ship + export economy** (~45-60 min) — new
      `UnitType.OilShip`, auto-spawned, smaller capacity than Commercial
      Aircraft, drains the source extractor's storage per trip, pays gold
      on delivery. Mirrors `AirportPlaneExecution.ts` closely.
- [ ] **4. Domestic rail integration** (~60-90 min, most uncertain
      estimate — haven't read `TrainStation.ts`/`RailNetworkImpl.ts` yet)
      — extractors feed oil into the existing domestic rail network toward
      the nearest Airport/Port for export.
- [ ] **5. Geography-based yield weighting** (~45-75 min) — per-map
      affine calibration + real oil-region table, scoped to the maps where
      it matters; flat elsewhere. See the geography section above.
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
