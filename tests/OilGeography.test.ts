import { GameMapType } from "../src/core/game/Game";
import { oilYieldMultiplier } from "../src/core/configuration/OilGeography";

describe("oilYieldMultiplier", () => {
  test("is a flat 1 for a map with no calibration data", () => {
    expect(oilYieldMultiplier(GameMapType.Pangaea, 0, 0)).toBe(1);
    expect(oilYieldMultiplier(GameMapType.Pangaea, 9999, 9999)).toBe(1);
  });

  test("scores a tile near Saudi Arabia (Ghawar/Persian Gulf) higher than one far from any oil field, on the World map", () => {
    // World map info.json pixel coordinates for real nation labels.
    const saudiArabia = oilYieldMultiplier(GameMapType.World, 1178, 351);
    const newZealand = oilYieldMultiplier(GameMapType.World, 1890, 775);

    expect(saudiArabia).toBeGreaterThan(newZealand);
    expect(saudiArabia).toBeGreaterThan(2);
  });

  test("scores a tile near the Niger Delta higher than the Sahara interior, on the Africa map", () => {
    // Africa map info.json pixel coordinates.
    const nigeria = oilYieldMultiplier(GameMapType.Africa, 726, 794);
    const algeria = oilYieldMultiplier(GameMapType.Africa, 526, 223);

    expect(nigeria).toBeGreaterThan(algeria);
  });

  test("is deterministic for the same inputs", () => {
    const a = oilYieldMultiplier(GameMapType.MiddleEast, 1141, 797);
    const b = oilYieldMultiplier(GameMapType.MiddleEast, 1141, 797);
    expect(a).toBe(b);
  });

  test("stays within the documented multiplier bounds", () => {
    for (const [px, py] of [
      [0, 0],
      [1178, 351],
      [5000, 5000],
      [-500, -500],
    ]) {
      const m = oilYieldMultiplier(GameMapType.World, px, py);
      expect(m).toBeGreaterThanOrEqual(0.5);
      expect(m).toBeLessThanOrEqual(5);
    }
  });
});
