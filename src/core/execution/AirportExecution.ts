import { Execution, Game, Unit, UnitType } from "../game/Game";
import { PseudoRandom } from "../PseudoRandom";
import { AirportPlaneExecution } from "./AirportPlaneExecution";

// Mirrors PortExecution: periodically spawns a free trade unit toward a
// weighted-random trading partner. Airports skip the water-component
// reachability check ports need, since planes fly over everything and
// airport-to-airport trade doesn't care about geography.
export class AirportExecution implements Execution {
  private active = true;
  private mg: Game;
  private airport: Unit;
  private random: PseudoRandom;
  private checkOffset: number;
  private tradePlaneSpawnRejections = 0;

  constructor(airport: Unit) {
    this.airport = airport;
  }

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    this.random = new PseudoRandom(mg.ticks());
    this.checkOffset = mg.ticks() % 10;
  }

  tick(ticks: number): void {
    if (this.mg === null || this.random === null || this.checkOffset === null) {
      throw new Error("Not initialized");
    }

    if (!this.airport.isActive()) {
      this.active = false;
      return;
    }

    if (this.airport.isUnderConstruction()) {
      return;
    }

    // Only check every 10 ticks for performance.
    if ((this.mg.ticks() + this.checkOffset) % 10 !== 0) {
      return;
    }

    if (!this.shouldSpawnTradePlane()) {
      return;
    }

    const airports = this.tradingAirports();

    if (airports.length === 0) {
      return;
    }

    const dst = this.random.randElement(airports);
    this.mg.addExecution(
      new AirportPlaneExecution(this.airport.owner(), this.airport, dst),
    );
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  shouldSpawnTradePlane(): boolean {
    const numTradePlanes = this.mg.unitCount(UnitType.CommercialAircraft);
    for (let i = 0; i < this.airport!.level(); i++) {
      const spawnRate = this.mg
        .config()
        .tradeShipSpawnRate(this.tradePlaneSpawnRejections, numTradePlanes);
      if (this.random.chance(spawnRate)) {
        this.tradePlaneSpawnRejections = 0;
        return true;
      }
      this.tradePlaneSpawnRejections++;
    }
    return false;
  }

  // It's a probability list, so if an element appears twice it's because it's
  // twice more likely to be picked later. See PortExecution.tradingPorts()
  // for the ship equivalent — this drops the water-component filter since
  // planes aren't limited by connected bodies of water.
  tradingAirports(): Unit[] {
    const airports = this.mg
      .players()
      .filter(
        (p) => p !== this.airport!.owner() && p.canTrade(this.airport!.owner()),
      )
      .flatMap((p) => p.units(UnitType.Airport))
      .sort(
        (a1, a2) =>
          this.mg.manhattanDist(this.airport!.tile(), a1.tile()) -
          this.mg.manhattanDist(this.airport!.tile(), a2.tile()),
      );

    const weightedAirports: Unit[] = [];

    for (const [i, otherAirport] of airports.entries()) {
      const expanded = new Array(otherAirport.level()).fill(otherAirport);
      weightedAirports.push(...expanded);
      const tooClose =
        this.mg.manhattanDist(this.airport!.tile(), otherAirport.tile()) <
        this.mg.config().tradeShipShortRangeDebuff();
      const closeBonus =
        i < this.mg.config().proximityBonusPortsNb(airports.length);
      if (!tooClose && closeBonus) {
        // If the airport is close, but not too close, add it again
        // to increase the chances of trading with it.
        weightedAirports.push(...expanded);
      }
      if (!tooClose && this.airport!.owner().isFriendly(otherAirport.owner())) {
        weightedAirports.push(...expanded);
      }
    }
    return weightedAirports;
  }
}
