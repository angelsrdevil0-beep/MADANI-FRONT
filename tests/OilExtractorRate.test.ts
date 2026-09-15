import { GameMapSize, GameMapType } from "../src/core/game/Game";
import { setup } from "./util/Setup";

describe("Config.oilExtractorRate geography integration", () => {
  test("Compact map size normalizes tile coordinates back to Normal-size calibration space", async () => {
    // The terrain actually loaded is unrelated to gameMap/gameMapSize
    // (those are just config metadata) - real World-map pixel coordinates
    // near Saudi Arabia are used to exercise the real OilGeography
    // calibration regardless of the tiny terrain file underneath.
    const normalGame = await setup("half_land_half_ocean", {
      gameMap: GameMapType.World,
      gameMapSize: GameMapSize.Normal,
    });
    const compactGame = await setup("half_land_half_ocean", {
      gameMap: GameMapType.World,
      gameMapSize: GameMapSize.Compact,
    });

    const normalRate = normalGame.config().oilExtractorRate(1200, 600);
    // Compact coordinates are half of Normal - the same real-world point.
    const compactRate = compactGame.config().oilExtractorRate(600, 300);

    expect(compactRate).toBe(normalRate);
  });

  test("geography multiplies the flat base rate rather than replacing it", async () => {
    const game = await setup("half_land_half_ocean", {
      gameMap: GameMapType.Pangaea, // uncalibrated -> flat multiplier of 1
    });

    expect(game.config().oilExtractorRate(0, 0)).toBe(2);
  });
});
