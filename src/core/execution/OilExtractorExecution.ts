import { Execution, Game, Unit } from "../game/Game";

// Fills the extractor's oil storage at a flat rate (geography weighting
// lands in Stage 5) until it hits its capacity, then stops producing —
// oil only leaves via export (Oil Ship / domestic rail, Stages 3-4).
export class OilExtractorExecution implements Execution {
  private active = true;
  private mg: Game;

  constructor(private extractor: Unit) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    if (!this.extractor.isActive()) {
      this.active = false;
      return;
    }

    if (this.extractor.isUnderConstruction()) {
      return;
    }

    const capacity = this.mg.config().oilExtractorCapacity();
    if (this.extractor.oil() >= capacity) {
      return;
    }

    const rate = this.mg.config().oilExtractorRate();
    this.extractor.setOil(Math.min(capacity, this.extractor.oil() + rate));
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
