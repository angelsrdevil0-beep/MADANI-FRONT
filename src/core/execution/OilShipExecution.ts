import { Execution, Game, Player, Unit, UnitType } from "../game/Game";
import { TileRef } from "../game/GameMap";
import { WaterPathFinder } from "../pathfinding/PathFinder";
import { PathStatus } from "../pathfinding/types";

// Mirrors TradeShipExecution's water-only routing (WaterPathFinder) rather
// than the trade plane's straight-line/ignore-terrain path - unlike a
// plane, a ship can't cross land. Pays gold to both sides on arrival, same
// as before. Two independent origins share this class:
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
  private pathFinder: WaterPathFinder;
  private motionPlanId = 1;
  private motionPlanDst: TileRef | null = null;

  private static _staggerCounter = 0;

  constructor(
    private origOwner: Player,
    private src: Unit,
    private dst: Unit,
    private cargoCapacity: number,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    const stagger =
      OilShipExecution._staggerCounter++ % WaterPathFinder.STAGGER_SPREAD;
    this.pathFinder = new WaterPathFinder(mg, stagger, true); // memoized: extractor/port tile to tile repeats
  }

  tick(ticks: number): void {
    if (this.pathFinder.rebuilt) {
      this.motionPlanDst = null; // Force motion plan re-recording
    }

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

    const curTile = this.ship.tile();
    const dstTile = this.dst.tile();

    if (curTile === dstTile) {
      this.complete();
      return;
    }

    const result = this.pathFinder.next(curTile, dstTile);

    switch (result.status) {
      case PathStatus.NEXT: {
        if (dstTile !== this.motionPlanDst) {
          this.motionPlanId++;
          const from = result.node;
          const path = this.pathFinder.pathForTraversal(from, dstTile);

          this.mg.recordMotionPlan({
            kind: "grid",
            unitId: this.ship.id(),
            planId: this.motionPlanId,
            startTick: ticks + 1,
            ticksPerStep: 1,
            path,
          });
          this.motionPlanDst = dstTile;
        }
        this.ship.move(result.node);
        break;
      }
      case PathStatus.COMPLETE:
        this.complete();
        return;
      case PathStatus.NOT_FOUND:
        // No water route between src and dst (e.g. unconnected water
        // bodies) - cargo is lost, same as any other failed trip.
        console.warn("oil ship cannot find water route");
        if (this.ship.isActive()) {
          this.ship.delete(false);
        }
        this.active = false;
        return;
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
