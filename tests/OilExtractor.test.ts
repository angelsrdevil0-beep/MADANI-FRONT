import { Game, Player, PlayerInfo, PlayerType, UnitType } from "../src/core/game/Game";
import { manhattanDistFN } from "../src/core/game/GameMap";
import { setup } from "./util/Setup";
import { constructionExecution, executeTicks } from "./util/utils";

let game: Game;
let player: Player;

describe("OilExtractor", () => {
  beforeEach(async () => {
    game = await setup("half_land_half_ocean", { instantBuild: true }, [
      new PlayerInfo("player", PlayerType.Human, null, "player_id"),
    ]);

    player = game.player("player_id");
    player.addGold(BigInt(1000000));
    game.config().structureMinDist = () => 10;
  });

  test("can be built on plain owned land", () => {
    player.conquer(game.ref(7, 10));
    const spawn = player.canBuild(UnitType.OilExtractor, game.ref(7, 10));
    expect(spawn).not.toBe(false);
  });

  test("can be built on water close to the player's own shore", () => {
    player.conquer(game.ref(7, 10));
    const shoreTile = game.ref(7, 10);
    expect(game.isShore(shoreTile)).toBe(true);

    const nearbyWater = Array.from(
      game.bfs(shoreTile, manhattanDistFN(shoreTile, 3)),
    ).find((t) => game.isWater(t));
    if (nearbyWater === undefined) {
      throw new Error("No nearby water tile found for test");
    }

    const spawn = player.canBuild(UnitType.OilExtractor, nearbyWater);
    expect(spawn).not.toBe(false);
  });

  test("cannot be built on water far from any owned shore", () => {
    // Zero range collapses the BFS to the candidate tile itself, which is
    // water (not shore) - so any water tile is "far" under this config,
    // regardless of the test map's actual layout/size.
    game.config().oilExtractorWaterRange = () => 0;

    player.conquer(game.ref(7, 10));
    const shoreTile = game.ref(7, 10);
    const nearbyWater = Array.from(
      game.bfs(shoreTile, manhattanDistFN(shoreTile, 3)),
    ).find((t) => game.isWater(t));
    if (nearbyWater === undefined) {
      throw new Error("No nearby water tile found for test");
    }

    const spawn = player.canBuild(UnitType.OilExtractor, nearbyWater);
    expect(spawn).toBe(false);
  });

  test("accumulates oil each tick and stops at capacity", () => {
    game.config().oilExtractorCapacity = () => 20;
    game.config().oilExtractorRate = () => 5;

    player.conquer(game.ref(7, 10));
    constructionExecution(game, player, 7, 10, UnitType.OilExtractor);

    const extractor = player
      .units(UnitType.OilExtractor)
      .find((u) => u.tile() === game.ref(7, 10));
    if (extractor === undefined) {
      throw new Error("Oil extractor was not built");
    }

    // constructionExecution() already advanced a few ticks getting the
    // structure built (instantBuild means extraction starts immediately),
    // so measure growth from here rather than assuming a zero baseline.
    const baseline = extractor.oil();
    expect(baseline).toBeGreaterThan(0);
    expect(baseline).toBeLessThan(20);

    executeTicks(game, 1);
    expect(extractor.oil()).toBe(Math.min(20, baseline + 5));

    executeTicks(game, 10);
    expect(extractor.oil()).toBe(20);
  });

  test("is upgradable, and a higher level fills the same-size tank faster", () => {
    expect(game.config().unitInfo(UnitType.OilExtractor).upgradable).toBe(
      true,
    );

    game.config().oilExtractorCapacity = () => 1000;
    game.config().oilExtractorRate = () => 5;

    player.conquer(game.ref(7, 10));
    constructionExecution(game, player, 7, 10, UnitType.OilExtractor);

    const extractor = player
      .units(UnitType.OilExtractor)
      .find((u) => u.tile() === game.ref(7, 10));
    if (extractor === undefined) {
      throw new Error("Oil extractor was not built");
    }
    extractor.setOil(0);
    expect(extractor.level()).toBe(1);

    executeTicks(game, 1);
    const level1Gain = extractor.oil();
    expect(level1Gain).toBe(5);

    extractor.setOil(0);
    extractor.increaseLevel();
    extractor.increaseLevel();
    extractor.increaseLevel();
    expect(extractor.level()).toBe(4);

    executeTicks(game, 1);
    // 4x the rate, same tank size - not a bigger tank, a faster fill.
    expect(extractor.oil()).toBe(level1Gain * 4);
    expect(game.config().oilExtractorCapacity()).toBe(1000);
  });
});
