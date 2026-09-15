import { Execution, Game, Player, Unit, UnitType } from "../game/Game";
import { TileRef } from "../game/GameMap";
import { straightLinePath } from "../pathfinding/StraightLinePath";

// Mirrors AirportPlaneExecution: a free auto-spawned trade unit that
// travels a straight line (ignoring terrain, like the trade plane) between
// two OilExtractors and pays gold to both sides on arrival. Cargo is
// deducted from the source extractor at spawn time (not refunded if the
// trip fails) and carried on the ship's own oil() field, so its size is
// whatever the extractor had on hand, capped at the ship's capacity - not
// always a full load.
export class OilShipExecution implements Execution {
  private active = true;
  private mg: Game;
  private ship: Unit | undefined;
  private path: TileRef[] = [];
  private pathIndex = 0;

  constructor(
    private origOwner: Player,
    private srcExtractor: Unit,
    private dstExtractor: Unit,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    if (this.ship === undefined) {
      const spawn = this.origOwner.canBuild(
        UnitType.OilShip,
        this.srcExtractor.tile(),
      );
      if (spawn === false) {
        console.warn(`cannot build oil ship`);
        this.active = false;
        return;
      }
      const cargo = Math.min(
        this.srcExtractor.oil(),
        this.mg.config().oilShipCapacity(),
      );
      if (cargo <= 0) {
        this.active = false;
        return;
      }
      this.srcExtractor.setOil(this.srcExtractor.oil() - cargo);

      this.ship = this.origOwner.buildUnit(UnitType.OilShip, spawn, {
        targetUnit: this.dstExtractor,
      });
      this.ship.setOil(cargo);
      this.path = straightLinePath(this.mg, spawn, this.dstExtractor.tile());
      this.pathIndex = 0;
      this.mg.recordMotionPlan({
        kind: "grid",
        unitId: this.ship.id(),
        planId: 1,
        startTick: ticks + 1,
        ticksPerStep: 1,
        path: this.path,
      });
      this.mg.stats().boatSendTrade(this.origOwner, this.dstExtractor.owner());
    }

    if (!this.ship.isActive()) {
      this.active = false;
      return;
    }

    const dstOwner = this.dstExtractor.owner();

    // If a player captures another player's extractor while shipping, delete
    // the ship without paying out (mirrors AirportPlaneExecution's same
    // guard) - the cargo is simply lost, same as if it were intercepted.
    if (dstOwner.id() === this.srcExtractor.owner().id()) {
      this.ship.delete(false);
      this.active = false;
      return;
    }

    if (
      !this.dstExtractor.isActive() ||
      !this.ship.owner().canTrade(dstOwner)
    ) {
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
    const gold = this.mg
      .config()
      .oilShipGold(cargo, this.srcExtractor.owner());

    this.srcExtractor.owner().addGold(gold, this.srcExtractor.tile());
    this.dstExtractor.owner().addGold(gold, this.dstExtractor.tile());
    this.srcExtractor.owner().addTradeGold(gold);
    this.dstExtractor.owner().addTradeGold(gold);
    this.mg
      .stats()
      .boatArriveTrade(
        this.srcExtractor.owner(),
        this.dstExtractor.owner(),
        gold,
      );
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
