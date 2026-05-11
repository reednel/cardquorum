import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { ColorAssignmentMap, UserIdentity } from '@cardquorum/shared';
import { GAME_TABLE_COMPONENTS } from '../game/game-registry';
import { ReplayEngineService } from './replay-engine.service';

@Component({
  selector: 'app-replay-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `
    @if (replayEngine.playerView(); as state) {
      @if (gameTableComponent(); as comp) {
        <ng-container *ngComponentOutlet="comp; inputs: gameTableInputs()" />
      }
    }
  `,
  host: { class: 'block h-full' },
})
export class ReplayTable {
  protected readonly replayEngine = inject(ReplayEngineService);

  readonly gameType = input.required<string>();
  readonly viewerUserId = input.required<number>();
  readonly participants = input.required<UserIdentity[]>();
  readonly config = input<unknown>(null);
  readonly colorMap = input<ColorAssignmentMap | undefined>(undefined);

  /** Resolve the game-specific table component from the game type. */
  readonly gameTableComponent = computed(() => GAME_TABLE_COMPONENTS[this.gameType()] ?? null);

  /** Inputs for the game-specific table — no action dispatcher, no interaction. */
  readonly gameTableInputs = computed(() => ({
    myUserID: this.viewerUserId(),
    members: this.participants(),
    isOwner: false,
    autostart: false,
    canStartNext: false,
    startNextGame: null,
    state: this.replayEngine.playerView(),
    validActions: [] as string[],
    config: this.config(),
    colorMap: this.colorMap(),
    actionDispatcher: null,
  }));
}
