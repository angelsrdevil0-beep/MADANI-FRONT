import { Execution, Game, Player, Unit, UnitType } from "../game/Game";
import { TileRef } from "../game/GameMap";
import { straightLinePath } from "../pathfinding/StraightLinePath";

// Mirrors AirportPlaneExecution: a free auto-spawned trade unit that
// travels a straight line (ignoring terrain, like the trade plane) and pays
// gold to both sides on arrival. Two independent origins share this class:
//   - A water-adjacent OilExtractor shipping straight to a foreign
//     OilExtractor (OilExtractorExecution.maybeSpawnOilShip) - the original
//     direct-export path.
//   - A Port shipping its rail-collected oil stockpile to a foreign Port
//     (PortExecution.maybeSpawnOilShip) - a bigger, consolidated load from
//     potentially several rail-connected extractors, so `cargoCapacity` is
//     larger and the ship renders bigger too (see UnitPass.ts).
// Cargo is deducted from the source at spawn time (not refunded if the trip
// fails) and carried on the ship's own oil() field, so its size is whatever
// the source had on hand, capped at cargoCapacity - not always a full load.
export class OilShipExecution implements Execution {
  private active = true;
  private mg: Game;
  private ship: Unit | undefined;
  private path: TileRef[] = [];
  private pathIndex = 0;

  constructor(
    private origOwner: Player,
    private src: Unit,
    private dst: Unit,
    private cargoCapacity: number,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    if (this.ship === undefined) {
      const spawn = this.origOwner.canBuild(UnitType.OilShip, this.src.tile());
      if (spawn === false) {
        console.warn(`cannot build oil ship`);
        this.active = false;
        return;
      }
      const cargo = Math.min(this.src.oil(), this.cargoCapacity);
      if (cargo <= 0) {
        this.active = false;
        return;
      }
      this.src.setOil(this.src.oil() - cargo);

      this.ship = this.origOwner.buildUnit(UnitType.OilShip, spawn, {
        targetUnit: this.dst,
      });
      this.ship.setOil(cargo);
      this.path = straightLinePath(this.mg, spawn, this.dst.tile());
      this.pathIndex = 0;
      this.mg.recordMotionPlan({
        kind: "grid",
        unitId: this.ship.id(),
        planId: 1,
        startTick: ticks + 1,
        ticksPerStep: 1,
        path: this.path,
      });
      this.mg.stats().boatSendTrade(this.origOwner, this.dst.owner());
    }

    if (!this.ship.isActive()) {
      this.active = false;
      return;
    }

    const dstOwner = this.dst.owner();

    // If a player captures the destination while shipping, delete the ship
    // without paying out (mirrors AirportPlaneExecution's same guard) - the
    // cargo is simply lost, same as if it were intercepted.
    if (dstOwner.id() === this.src.owner().id()) {
      this.ship.delete(false);
      this.active = false;
      return;
    }

    if (!this.dst.isActive() || !this.ship.owner().canTrade(dstOwner)) {
      this.ship.delete(false);
      this.active = false;
      return;
    }

    if (this.pathIndex >= this.path.length) {
      this.complete();
      return;
    }

    this.ship.move(this.path[this.pathIndex]);
    this.pathIndex++;

    if (this.pathIndex >= this.path.length) {
      this.complete();
    }
  }

  private complete() {
    this.active = false;
    const cargo = this.ship!.oil();
    this.ship!.delete(false);
    const gold = this.mg.config().oilShipGold(cargo, this.src.owner());

    this.src.owner().addGold(gold, this.src.tile());
    this.dst.owner().addGold(gold, this.dst.tile());
    this.src.owner().addTradeGold(gold);
    this.dst.owner().addTradeGold(gold);
    this.mg.stats().boatArriveTrade(this.src.owner(), this.dst.owner(), gold);
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
