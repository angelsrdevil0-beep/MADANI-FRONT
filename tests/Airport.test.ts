import { AirportExecution } from "../src/core/execution/AirportExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { setup } from "./util/Setup";
import { executeTicks } from "./util/utils";

let game: Game;
let player: Player;
let other: Player;

describe("Airport", () => {
  beforeEach(async () => {
    game = await setup("half_land_half_ocean", { instantBuild: true }, [
      new PlayerInfo("player", PlayerType.Human, null, "player_id"),
      new PlayerInfo("other", PlayerType.Human, null, "other_id"),
    ]);

    player = game.player("player_id");
    player.addGold(BigInt(1000000));
    other = game.player("other_id");

    game.config().structureMinDist = () => 10;
  });

  test("Airport does not require water adjacency, unlike Port", () => {
    // (7, 10) is a Port-eligible (shoreline) tile in this map; Airport
    // should build there too since it's plain land, no shore requirement.
    player.conquer(game.ref(7, 10));
    const spawn = player.canBuild(UnitType.Airport, game.ref(7, 10));
    expect(spawn).not.toBe(false);
  });

  test("Destination airports chances scale with level", () => {
    game.config().proximityBonusPortsNb = () => 0;
    game.config().tradeShipShortRangeDebuff = () => 0;

    player.conquer(game.ref(7, 10));
    const spawn = player.canBuild(UnitType.Airport, game.ref(7, 10));
    if (spawn === false) {
      throw new Error("Unable to build airport for test");
    }
    const airport = player.buildUnit(UnitType.Airport, spawn, {});
    const execution = new AirportExecution(airport);
    execution.init(game, 0);
    execution.tick(0);

    other.conquer(game.ref(0, 0));
    const otherAirport = other.buildUnit(UnitType.Airport, game.ref(0, 0), {});
    otherAirport.increaseLevel();
    otherAirport.increaseLevel();

    const airports = execution.tradingAirports();

    expect(airports.length).toBe(3);
  });

  test("Trade plane proximity bonus", () => {
    game.config().proximityBonusPortsNb = () => 10;
    game.config().tradeShipShortRangeDebuff = () => 0;

    player.conquer(game.ref(7, 10));
    const spawn = player.canBuild(UnitType.Airport, game.ref(7, 10));
    if (spawn === false) {
      throw new Error("Unable to build airport for test");
    }
    const airport = player.buildUnit(UnitType.Airport, spawn, {});
    const execution = new AirportExecution(airport);
    execution.init(game, 0);
    execution.tick(0);

    other.conquer(game.ref(0, 0));
    other.buildUnit(UnitType.Airport, game.ref(0, 0), {});

    const airports = execution.tradingAirports();

    expect(airports.length).toBe(2);
  });

  test("shouldSpawnTradePlane recomputes spawn rate per level with updated rejection count", () => {
    player.conquer(game.ref(7, 10));
    const airport = player.buildUnit(UnitType.Airport, game.ref(7, 10), {});
    airport.increaseLevel(); // level 2
    const execution = new AirportExecution(airport);
    execution.init(game, 0);

    const rejections: number[] = [];
    game.config().tradeShipSpawnRate = (r) => (rejections.push(r), 1000000);
    expect(execution.shouldSpawnTradePlane()).toBe(false);
    expect(rejections).toEqual([0, 1]);

    game.config().tradeShipSpawnRate = (r) => (rejections.push(r), 1);
    expect(execution.shouldSpawnTradePlane()).toBe(true);
    expect(rejections).toEqual([0, 1, 2]);

    game.config().tradeShipSpawnRate = (r) => (rejections.push(r), 1000000);
    expect(execution.shouldSpawnTradePlane()).toBe(false);
    expect(rejections).toEqual([0, 1, 2, 0, 1]);
  });

  test("A trade plane flies between two airports and pays gold on both ends", () => {
    game.config().proximityBonusPortsNb = () => 0;
    game.config().tradeShipShortRangeDebuff = () => 0;
    // Force the very next check to spawn a plane.
    game.config().tradeShipSpawnRate = () => 1;

    player.conquer(game.ref(7, 10));
    const spawn = player.canBuild(UnitType.Airport, game.ref(7, 10));
    if (spawn === false) {
      throw new Error("Unable to build airport for test");
    }
    const srcAirport = player.buildUnit(UnitType.Airport, spawn, {});
    game.addExecution(new AirportExecution(srcAirport));

    other.conquer(game.ref(0, 0));
    other.buildUnit(UnitType.Airport, game.ref(0, 0), {});

    const goldBefore = player.gold();
    const otherGoldBefore = other.gold();

    // AirportExecution only checks every 10 ticks; give it plenty of ticks
    // for a plane to spawn and fly the short distance between the two
    // airports on this small test map.
    executeTicks(game, 200);

    expect(player.gold()).toBeGreaterThan(goldBefore);
    expect(other.gold()).toBeGreaterThan(otherGoldBefore);
  });
});
