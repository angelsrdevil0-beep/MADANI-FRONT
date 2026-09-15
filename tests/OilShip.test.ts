import { PortExecution } from "../src/core/execution/PortExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { TileRef } from "../src/core/game/GameMap";
import { setup } from "./util/Setup";
import { constructionExecution, executeTicks } from "./util/utils";

let game: Game;
let player: Player;
let other: Player;

function findShoreTile(game: Game, excluding: TileRef): TileRef {
  for (let x = 0; x < game.width(); x++) {
    for (let y = 0; y < game.height(); y++) {
      const t = game.ref(x, y);
      if (t !== excluding && game.isShore(t)) {
        return t;
      }
    }
  }
  throw new Error("No second shore tile found for test");
}

describe("OilShip", () => {
  beforeEach(async () => {
    game = await setup("half_land_half_ocean", { instantBuild: true }, [
      new PlayerInfo("player", PlayerType.Human, null, "player_id"),
      new PlayerInfo("other", PlayerType.Human, null, "other_id"),
    ]);

    player = game.player("player_id");
    player.addGold(BigInt(1000000));
    other = game.player("other_id");
    other.addGold(BigInt(1000000));
    game.config().structureMinDist = () => 10;
    game.config().proximityBonusPortsNb = () => 0;
    game.config().tradeShipShortRangeDebuff = () => 0;
    game.config().tradeShipSpawnRate = () => 1;
  });

  test("does not spawn an oil ship from a landlocked extractor", () => {
    // (2, 2) is well inland on this map, no water contact.
    const inlandTile = game.ref(2, 2);
    expect(game.isShore(inlandTile)).toBe(false);
    expect(game.isWater(inlandTile)).toBe(false);

    player.conquer(inlandTile);
    constructionExecution(game, player, 2, 2, UnitType.OilExtractor);

    const shoreTile = findShoreTile(game, inlandTile);
    other.conquer(shoreTile);
    other.buildUnit(UnitType.OilExtractor, shoreTile, {});

    executeTicks(game, 200);

    expect(game.unitCount(UnitType.OilShip)).toBe(0);
  });

  test("an oil ship departs with cargo, travels, and pays gold on both ends", () => {
    // Extractor and ship capacity equal, and production paused after the
    // tank is topped off: one trip fully drains the source and nothing
    // refills it, so exactly one ship ever departs - keeps the assertions
    // unambiguous instead of racing against ongoing production.
    game.config().oilExtractorCapacity = () => 1000;
    game.config().oilShipCapacity = () => 1000;

    const srcTile = game.ref(7, 10);
    expect(game.isShore(srcTile)).toBe(true);
    player.conquer(srcTile);
    constructionExecution(game, player, 7, 10, UnitType.OilExtractor);

    const srcExtractor = player
      .units(UnitType.OilExtractor)
      .find((u) => u.tile() === srcTile);
    if (srcExtractor === undefined) {
      throw new Error("Source oil extractor was not built");
    }
    // Skip waiting for the flat 2/tick accumulation - give it a full tank.
    srcExtractor.setOil(game.config().oilExtractorCapacity());
    game.config().oilExtractorRate = () => 0;
    const oilBeforeDeparture = srcExtractor.oil();

    const dstTile = findShoreTile(game, srcTile);
    other.conquer(dstTile);
    other.buildUnit(UnitType.OilExtractor, dstTile, {});

    const goldBefore = player.gold();
    const otherGoldBefore = other.gold();

    // One throttled check (every 10 ticks) should be enough to depart.
    executeTicks(game, 10);
    expect(srcExtractor.oil()).toBeLessThan(oilBeforeDeparture);
    expect(game.unitCount(UnitType.OilShip)).toBe(1);

    // Give it plenty of ticks to cross this small test map.
    executeTicks(game, 190);

    expect(player.gold()).toBeGreaterThan(goldBefore);
    expect(other.gold()).toBeGreaterThan(otherGoldBefore);
    expect(game.unitCount(UnitType.OilShip)).toBe(0);
  });

  test("a Port exports its rail-collected oil stockpile as a bigger Oil Ship", () => {
    game.config().portOilShipCapacity = () => 3000;

    const srcTile = game.ref(7, 10);
    player.conquer(srcTile);
    const port = player.buildUnit(UnitType.Port, srcTile, {});
    game.addExecution(new PortExecution(port));
    // Skip the rail-collection mechanics - set the stockpile directly, as
    // if several extractors had already fed it via
    // OilExtractorExecution.maybeExportByRail.
    port.setOil(3000);

    const dstTile = findShoreTile(game, srcTile);
    other.conquer(dstTile);
    other.buildUnit(UnitType.Port, dstTile, {});

    const goldBefore = player.gold();
    const otherGoldBefore = other.gold();

    executeTicks(game, 20);
    expect(port.oil()).toBeLessThan(3000);
    expect(game.unitCount(UnitType.OilShip)).toBe(1);
    const ship = game.units(UnitType.OilShip)[0];
    // The port's shipment is a full 3000-capacity load, noticeably bigger
    // than the 1000-capacity direct-from-extractor Oil Ship.
    expect(ship.oil()).toBe(3000);

    executeTicks(game, 180);
    expect(player.gold()).toBeGreaterThan(goldBefore);
    expect(other.gold()).toBeGreaterThan(otherGoldBefore);
  });
});
