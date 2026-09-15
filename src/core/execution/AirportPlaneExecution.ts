import { Execution, Game, Player, Unit, UnitType } from "../game/Game";
import { TileRef } from "../game/GameMap";
import { straightLinePath } from "../pathfinding/StraightLinePath";

// Mirrors TradeShipExecution, but for the free Commercial Aircraft trade
// unit spawned by AirportExecution. Planes fly a straight line computed once
// at spawn instead of following a water pathfinder — there's no terrain to
// route around and (for now, before fighter jets exist) nothing that can
// intercept or redirect it mid-flight, so this is considerably simpler than
// its ship counterpart.
export class AirportPlaneExecution implements Execution {
  private active = true;
  private mg: Game;
  private plane: Unit | undefined;
  private path: TileRef[] = [];
  private pathIndex = 0;
  private tilesTraveled = 0;

  constructor(
    private origOwner: Player,
    private srcAirport: Unit,
    private dstAirport: Unit,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    if (this.plane === undefined) {
      const spawn = this.origOwner.canBuild(
        UnitType.CommercialAircraft,
        this.srcAirport.tile(),
      );
      if (spawn === false) {
        console.warn(`cannot build commercial aircraft`);
        this.active = false;
        return;
      }
      this.plane = this.origOwner.buildUnit(
        UnitType.CommercialAircraft,
        spawn,
        { targetUnit: this.dstAirport },
      );
      this.path = straightLinePath(this.mg, spawn, this.dstAirport.tile());
      this.pathIndex = 0;
      this.mg.recordMotionPlan({
        kind: "grid",
        unitId: this.plane.id(),
        planId: 1,
        startTick: ticks + 1,
        ticksPerStep: 1,
        path: this.path,
      });
      this.mg.stats().boatSendTrade(this.origOwner, this.dstAirport.owner());
    }

    if (!this.plane.isActive()) {
      this.active = false;
      return;
    }

    const dstAirportOwner = this.dstAirport.owner();

    // If a player captures another player's airport while trading we should
    // delete the plane (mirrors TradeShipExecution's same guard for ports).
    if (dstAirportOwner.id() === this.srcAirport.owner().id()) {
      this.plane.delete(false);
      this.active = false;
      return;
    }

    if (
      !this.dstAirport.isActive() ||
      !this.plane.owner().canTrade(dstAirportOwner)
    ) {
      this.plane.delete(false);
      this.active = false;
      return;
    }

    if (this.pathIndex >= this.path.length) {
      this.complete();
      return;
    }

    this.plane.move(this.path[this.pathIndex]);
    this.pathIndex++;
    this.tilesTraveled++;

    if (this.pathIndex >= this.path.length) {
      this.complete();
    }
  }

  private complete() {
    this.active = false;
    this.plane!.delete(false);
    const gold = this.mg
      .config()
      .tradeShipGold(this.tilesTraveled, this.plane!.owner());

    this.srcAirport.owner().addGold(gold, this.srcAirport.tile());
    this.dstAirport.owner().addGold(gold, this.dstAirport.tile());
    this.srcAirport.owner().addTradeGold(gold);
    this.dstAirport.owner().addTradeGold(gold);
    this.mg
      .stats()
      .boatArriveTrade(this.srcAirport.owner(), this.dstAirport.owner(), gold);
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
