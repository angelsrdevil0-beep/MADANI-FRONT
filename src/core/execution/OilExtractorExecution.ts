import { Execution, Game, Player, Unit, UnitType } from "../game/Game";
import { PseudoRandom } from "../PseudoRandom";
import { OilShipExecution } from "./OilShipExecution";
import { TrainStationExecution } from "./TrainStationExecution";

// Fills the extractor's oil storage at a flat rate (geography weighting is a
// later stage) until it hits capacity, then stops producing until it's
// exported. Export has two independent paths per the user's spec ("traded by
// rails OR an oil ship"):
//  - Oil Ship: a direct maritime shipment, mirroring AirportExecution's
//    periodic trade-unit spawn (see maybeSpawnOilShip below).
//  - Domestic rail: the extractor becomes a real TrainStation (same
//    Factory-gated connection machinery Port/City use - no shortcuts there),
//    and once it's confirmed connected to one of the owner's own Ports in
//    the same rail cluster, oil converts to gold directly rather than
//    literally riding a visible Train unit. Domestic delivery has no travel
//    risk (unlike the Oil Ship's foreign trip), so treating it as an
//    instant conversion once connectivity is established is a deliberate
//    simplification, not a shortcut on the connectivity logic itself.
//    Airport is not wired into the rail network in this codebase at all
//    (only City/Port/Factory are), so this stage only supports Port as the
//    rail export destination - Airport-via-rail is a separate, similarly
//    sized follow-up.
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

    if (!this.extractor.hasTrainStation()) {
      this.createStation();
    }

    this.produce();
    this.maybeSpawnOilShip();
    this.maybeExportByRail();
  }

  // Mirrors PortExecution.createStation(): only joins the rail network once
  // a Factory is already nearby (retried every tick until one appears, or
  // - symmetrically - a Factory built later nearby retroactively promotes
  // this extractor via FactoryExecution.createStation()).
  private createStation(): void {
    const nearbyFactory = this.mg.hasUnitNearby(
      this.extractor.tile(),
      this.mg.config().trainStationMaxRange(),
      UnitType.Factory,
    );
    if (nearbyFactory) {
      this.mg.addExecution(new TrainStationExecution(this.extractor));
    }
  }

  private maybeExportByRail(): void {
    if (this.extractor.oil() <= 0) {
      return;
    }
    // Only check every 10 ticks for performance, same as the ship check.
    if ((this.mg.ticks() + this.checkOffset) % 10 !== 0) {
      return;
    }

    const owner = this.extractor.owner();
    const station = this.mg
      .railNetwork()
      .stationManager()
      .findStation(this.extractor);
    const cluster = station?.getCluster();
    if (!cluster) {
      return;
    }
    const ownedPort = [...cluster.stations].some(
      (s) =>
        s.isActive() && s.unit.type() === UnitType.Port && s.unit.owner() === owner,
    );
    if (!ownedPort) {
      return;
    }

    const cargo = Math.min(
      this.extractor.oil(),
      this.mg.config().oilShipCapacity(),
    );
    this.extractor.setOil(this.extractor.oil() - cargo);
    const gold = this.mg.config().oilShipGold(cargo, owner);
    owner.addGold(gold, this.extractor.tile());
    owner.addTradeGold(gold);
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
