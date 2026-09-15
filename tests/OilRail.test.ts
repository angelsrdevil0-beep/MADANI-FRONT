import { FactoryExecution } from "../src/core/execution/FactoryExecution";
import { TrainStationExecution } from "../src/core/execution/TrainStationExecution";
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

function findLandTile(game: Game, excluding: TileRef[]): TileRef {
  const skip = new Set(excluding);
  for (let x = 0; x < game.width(); x++) {
    for (let y = 0; y < game.height(); y++) {
      const t = game.ref(x, y);
      if (!skip.has(t) && game.isLand(t) && !game.isImpassable(t)) {
        return t;
      }
    }
  }
  throw new Error("No land tile found for test");
}

describe("OilExtractor domestic rail export", () => {
  beforeEach(async () => {
    game = await setup("half_land_half_ocean", { instantBuild: true }, [
      new PlayerInfo("player", PlayerType.Human, null, "player_id"),
    ]);

    player = game.player("player_id");
    player.addGold(BigInt(1000000));
    game.config().structureMinDist = () => 2;
    // The real min/max range constants (15-110 tiles) don't fit this 16x16
    // test map - override them rather than switch to a giant real map, so
    // the test stays fast and deterministic.
    game.config().trainStationMinRange = () => 0;
    game.config().trainStationMaxRange = () => 20;
    game.config().oilExtractorRate = () => 0;
  });

  test("moves oil into the connected Port's stockpile once connected by rail", () => {
    // Export only fires once the extractor's own tank is full - match its
    // capacity to the seeded oil level rather than leaving it at the
    // (much larger) real default.
    game.config().oilExtractorCapacity = () => 1000;

    const extractorTile = game.ref(2, 2);
    expect(game.isShore(extractorTile)).toBe(false);
    player.conquer(extractorTile);
    constructionExecution(game, player, 2, 2, UnitType.OilExtractor);
    const extractor = player
      .units(UnitType.OilExtractor)
      .find((u) => u.tile() === extractorTile);
    if (extractor === undefined) {
      throw new Error("Oil extractor was not built");
    }
    extractor.setOil(1000);

    const factoryTile = findLandTile(game, [extractorTile]);
    player.conquer(factoryTile);
    const factory = player.buildUnit(UnitType.Factory, factoryTile, {});
    game.addExecution(new FactoryExecution(factory));

    const portTile = game.ref(7, 10);
    expect(game.isShore(portTile)).toBe(true);
    player.conquer(portTile);
    const port = player.buildUnit(UnitType.Port, portTile, {});
    game.addExecution(new TrainStationExecution(port));

    // A few ticks for the station-creation retry loop, then the throttled
    // (every 10 ticks) export check.
    executeTicks(game, 30);

    expect(extractor.oil()).toBeLessThan(1000);
    expect(port.oil()).toBeGreaterThan(0);
    expect(extractor.oil() + port.oil()).toBe(1000);
  });

  test("does not export a partially-filled extractor - only once full", () => {
    game.config().oilExtractorCapacity = () => 1000;

    const extractorTile = game.ref(2, 2);
    player.conquer(extractorTile);
    constructionExecution(game, player, 2, 2, UnitType.OilExtractor);
    const extractor = player
      .units(UnitType.OilExtractor)
      .find((u) => u.tile() === extractorTile);
    if (extractor === undefined) {
      throw new Error("Oil extractor was not built");
    }
    // Below the 1000 capacity - should sit untouched, not trickle to the Port.
    extractor.setOil(500);

    const factoryTile = findLandTile(game, [extractorTile]);
    player.conquer(factoryTile);
    const factory = player.buildUnit(UnitType.Factory, factoryTile, {});
    game.addExecution(new FactoryExecution(factory));

    const portTile = game.ref(7, 10);
    player.conquer(portTile);
    const port = player.buildUnit(UnitType.Port, portTile, {});
    game.addExecution(new TrainStationExecution(port));

    executeTicks(game, 30);

    expect(extractor.oil()).toBe(500);
    expect(port.oil()).toBe(0);
  });

  test("does not export without a nearby Factory (never becomes a station)", () => {
    const extractorTile = game.ref(2, 2);
    player.conquer(extractorTile);
    constructionExecution(game, player, 2, 2, UnitType.OilExtractor);
    const extractor = player
      .units(UnitType.OilExtractor)
      .find((u) => u.tile() === extractorTile);
    if (extractor === undefined) {
      throw new Error("Oil extractor was not built");
    }
    extractor.setOil(1000);

    executeTicks(game, 60);

    expect(extractor.hasTrainStation()).toBe(false);
    expect(extractor.oil()).toBe(1000);
  });

  test("does not export when the rail cluster has no owned Port", () => {
    const extractorTile = game.ref(2, 2);
    player.conquer(extractorTile);
    constructionExecution(game, player, 2, 2, UnitType.OilExtractor);
    const extractor = player
      .units(UnitType.OilExtractor)
      .find((u) => u.tile() === extractorTile);
    if (extractor === undefined) {
      throw new Error("Oil extractor was not built");
    }
    extractor.setOil(1000);

    const factoryTile = findLandTile(game, [extractorTile]);
    player.conquer(factoryTile);
    const factory = player.buildUnit(UnitType.Factory, factoryTile, {});
    game.addExecution(new FactoryExecution(factory));

    executeTicks(game, 30);

    expect(extractor.hasTrainStation()).toBe(true);
    expect(extractor.oil()).toBe(1000);
  });
});
