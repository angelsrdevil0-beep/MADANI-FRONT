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
//    the same rail cluster, oil transfers into that Port's own stockpile
//    rather than literally riding a visible Train unit - domestic delivery
//    has no travel risk (unlike the Oil Ship's foreign trip), so treating
//    the hop itself as instant once connectivity is established is a
//    deliberate simplification, not a shortcut on the connectivity logic.
//    The Port then exports its accumulated stockpile itself (see
//    PortExecution.maybeSpawnOilShip) as a bigger, consolidated shipment -
//    oil is never converted to gold at the extractor's own rail check.
//    Airport is not wired into the rail network in this codebase at all
//    (only City/Port/Factory are), so this stage only supports Port as the
//    rail export destination - Airport-via-rail is a separate, similarly
//    sized follow-up.
export class OilExtractorExecution implements Execution {
  private active = true;
  private mg: Game;
  private random: PseudoRandom;
  private checkOffset: number;

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

  // Only exports once the extractor's own tank is full - it accumulates
  // silently until then, so this fires as a single lump transfer per fill
  // cycle rather than a continuous per-tick trickle into the Port.
  private maybeExportByRail(): void {
    const extractorCapacity = this.mg.config().oilExtractorCapacity();
    if (this.extractor.oil() < extractorCapacity) {
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
    const portStation = [...cluster.stations].find(
      (s) =>
        s.isActive() &&
        s.unit.type() === UnitType.Port &&
        s.unit.owner() === owner,
    );
    if (!portStation) {
      return;
    }

    const port = portStation.unit;
    const portCapacity = this.mg.config().portOilCapacity();
    if (port.oil() >= portCapacity) {
      return;
    }
    // The whole tank moves at once (capped by the Port's remaining room),
    // not a bounded per-check chunk - it only got here because it's full.
    const cargo = Math.min(this.extractor.oil(), portCapacity - port.oil());
    this.extractor.setOil(this.extractor.oil() - cargo);
    port.setOil(port.oil() + cargo);
  }

  // Storage cap is flat regardless of level - leveling up doesn't grow the
  // tank, it fills the same tank faster (level 5 = 5x the rate, so a full
  // cycle takes 1/5th the time). Building more separate extractors instead
  // is the other way to scale up: each has its own tank, so N extractors
  // give N times the total oil over the same stretch of time. Two distinct
  // scaling strategies, not the same thing achieved two ways.
  private produce(): void {
    const capacity = this.mg.config().oilExtractorCapacity();
    if (this.extractor.oil() >= capacity) {
      return;
    }
    const baseRate = this.mg
      .config()
      .oilExtractorRate(
        this.mg.x(this.extractor.tile()),
        this.mg.y(this.extractor.tile()),
      );
    const rate = baseRate * this.extractor.level();
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

  // Only ships once the extractor's own tank is full - same "fill first"
  // rule as the rail path, so a busy coastal extractor sends one full load
  // per fill cycle on a steady cadence rather than firing off on every
  // check as soon as there's any oil at all.
  private maybeSpawnOilShip(): void {
    const capacity = this.mg.config().oilExtractorCapacity();
    if (this.extractor.oil() < capacity || !this.hasWaterAccess()) {
      return;
    }

    const interval = this.mg.config().oilShipSpawnIntervalTicks();
    if ((this.mg.ticks() + this.checkOffset) % interval !== 0) {
      return;
    }

    const extractors = this.tradingExtractors();
    if (extractors.length === 0) {
      return;
    }

    const dst = this.random.randElement(extractors);
    this.mg.addExecution(
      new OilShipExecution(
        this.extractor.owner(),
        this.extractor,
        dst,
        this.mg.config().oilShipCapacity(),
      ),
    );
  }

  // Other players' water-adjacent OilExtractors that share a water body
  // with this one (so a route actually exists), weighted like
  // AirportExecution.tradingAirports() (proximity + friendliness bonuses).
  tradingExtractors(): Unit[] {
    const self = this.extractor;
    const owner: Player = self.owner();
    const sourceComponents = new Set<number>();
    for (const neighbor of this.mg.neighbors(self.tile())) {
      if (!this.mg.isWater(neighbor)) continue;
      const comp = this.mg.getWaterComponent(neighbor);
      if (comp !== null) sourceComponents.add(comp);
    }
    const extractors = this.mg
      .players()
      .filter((p) => p !== owner && p.canTrade(owner))
      .flatMap((p) => p.units(UnitType.OilExtractor))
      .filter((u) => {
        for (const comp of sourceComponents) {
          if (this.mg.hasWaterComponent(u.tile(), comp)) return true;
        }
        return false;
      })
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
