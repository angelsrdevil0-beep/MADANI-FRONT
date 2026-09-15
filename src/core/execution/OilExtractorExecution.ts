import { Execution, Game, Player, Unit, UnitType } from "../game/Game";
import { PseudoRandom } from "../PseudoRandom";
import { OilShipExecution } from "./OilShipExecution";

// Fills the extractor's oil storage at a flat rate (geography weighting is a
// later stage) until it hits capacity, then stops producing until it's
// exported. Export has two independent paths per the user's spec ("traded by
// rails OR an oil ship"): this class handles the direct Oil Ship path,
// mirroring AirportExecution's periodic trade-unit spawn; domestic rail
// (for extractors with no water access) is a separate, later stage.
export class OilExtractorExecution implements Execution {
  private active = true;
  private mg: Game;
  private random: PseudoRandom;
  private checkOffset: number;
  private oilShipSpawnRejections = 0;

  constructor(private extractor: Unit) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    this.random = new PseudoRandom(mg.ticks());
    this.checkOffset = mg.ticks() % 10;
  }

  tick(ticks: number): void {
    if (!this.extractor.isActive()) {
      this.active = false;
      return;
    }

    if (this.extractor.isUnderConstruction()) {
      return;
    }

    this.produce();
    this.maybeSpawnOilShip();
  }

  private produce(): void {
    const capacity = this.mg.config().oilExtractorCapacity();
    if (this.extractor.oil() >= capacity) {
      return;
    }
    const rate = this.mg.config().oilExtractorRate();
    this.extractor.setOil(Math.min(capacity, this.extractor.oil() + rate));
  }

  // Only extractors with water contact can launch a ship - a landlocked
  // extractor has to wait for the domestic-rail export path instead.
  private hasWaterAccess(): boolean {
    return (
      this.mg.isWater(this.extractor.tile()) ||
      this.mg.isShore(this.extractor.tile())
    );
  }

  private maybeSpawnOilShip(): void {
    if (this.extractor.oil() <= 0 || !this.hasWaterAccess()) {
      return;
    }

    // Only check every 10 ticks for performance, mirrors AirportExecution.
    if ((this.mg.ticks() + this.checkOffset) % 10 !== 0) {
      return;
    }

    if (!this.shouldSpawnOilShip()) {
      return;
    }

    const extractors = this.tradingExtractors();
    if (extractors.length === 0) {
      return;
    }

    const dst = this.random.randElement(extractors);
    this.mg.addExecution(
      new OilShipExecution(this.extractor.owner(), this.extractor, dst),
    );
  }

  shouldSpawnOilShip(): boolean {
    const numOilShips = this.mg.unitCount(UnitType.OilShip);
    const spawnRate = this.mg
      .config()
      .tradeShipSpawnRate(this.oilShipSpawnRejections, numOilShips);
    if (this.random.chance(spawnRate)) {
      this.oilShipSpawnRejections = 0;
      return true;
    }
    this.oilShipSpawnRejections++;
    return false;
  }

  // Other players' water-adjacent OilExtractors, weighted like
  // AirportExecution.tradingAirports() (proximity + friendliness bonuses).
  tradingExtractors(): Unit[] {
    const self = this.extractor;
    const owner: Player = self.owner();
    const extractors = this.mg
      .players()
      .filter((p) => p !== owner && p.canTrade(owner))
      .flatMap((p) => p.units(UnitType.OilExtractor))
      .filter(
        (u) => this.mg.isWater(u.tile()) || this.mg.isShore(u.tile()),
      )
      .sort(
        (a, b) =>
          this.mg.manhattanDist(self.tile(), a.tile()) -
          this.mg.manhattanDist(self.tile(), b.tile()),
      );

    const weighted: Unit[] = [];
    for (const [i, other] of extractors.entries()) {
      weighted.push(other);
      const tooClose =
        this.mg.manhattanDist(self.tile(), other.tile()) <
        this.mg.config().tradeShipShortRangeDebuff();
      const closeBonus =
        i < this.mg.config().proximityBonusPortsNb(extractors.length);
      if (!tooClose && closeBonus) {
        weighted.push(other);
      }
      if (!tooClose && owner.isFriendly(other.owner())) {
        weighted.push(other);
      }
    }
    return weighted;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
