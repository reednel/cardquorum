import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { GameTablePlugin, UserIdentity } from '@cardquorum/shared';
import { GameTableShell } from './game-table-shell';
import { GameService } from './game.service';
import { PhaseOverlay } from './phase-overlay';
import { PlayArea } from './play-area';
import { PlayerHand } from './player-hand';
import { BuryOverlay } from './sheepshead/bury-overlay';
import { CallOverlay } from './sheepshead/call-overlay';
import { CrackOverlay } from './sheepshead/crack-overlay';
import { DealOverlay } from './sheepshead/deal-overlay';
import { PickOverlay } from './sheepshead/pick-overlay';
import { ScoreOverlay } from './sheepshead/score-overlay';
import { SheepsheadTablePlugin } from './sheepshead/sheepshead-table-plugin';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-game-table',
  imports: [
    GameTableShell,
    PlayerHand,
    PlayArea,
    PhaseOverlay,
    DealOverlay,
    PickOverlay,
    BuryOverlay,
    CallOverlay,
    CrackOverlay,
    ScoreOverlay,
  ],
  template: `
    @if (gameService.state(); as state) {
      <app-game-table-shell
        [plugin]="plugin"
        [state]="state"
        [validActions]="gameService.validActions()"
        [myUserID]="myUserID()"
        [members]="members()"
      >
        <!-- Play area -->
        <div playArea>
          <app-play-area [plays]="currentTrick()" />
        </div>

        <!-- Player hand -->
        <div hand>
          <app-player-hand
            [cards]="myHand()"
            [legalCards]="legalCards()"
            (cardPlayed)="onCardPlayed($event)"
          />
        </div>

        <!-- Phase overlays -->
        @if (activeOverlay(); as overlay) {
          <div overlay>
            @switch (overlay) {
              @case ('deal') {
                <app-phase-overlay label="Deal cards">
                  <app-deal-overlay
                    [validActions]="gameService.validActions()"
                    (action)="onAction($event)"
                  />
                </app-phase-overlay>
              }
              @case ('pick') {
                <app-phase-overlay label="Pick or Pass">
                  <app-pick-overlay
                    [validActions]="gameService.validActions()"
                    (action)="onAction($event)"
                  />
                </app-phase-overlay>
              }
              @case ('bury') {
                <app-phase-overlay label="Bury cards">
                  <app-bury-overlay
                    [validActions]="gameService.validActions()"
                    [hand]="myHand()"
                    [buryCount]="buryCount()"
                    (buryConfirmed)="onBuryConfirmed($event)"
                  />
                </app-phase-overlay>
              }
              @case ('call') {
                <app-phase-overlay label="Call a card">
                  <app-call-overlay
                    [validActions]="gameService.validActions()"
                    (action)="onAction($event)"
                  />
                </app-phase-overlay>
              }
              @case ('crack') {
                @if (!crackDismissed()) {
                  <app-phase-overlay label="Escalate stakes">
                    <app-crack-overlay
                      [validActions]="gameService.validActions()"
                      (action)="onAction($event)"
                      (dismiss)="crackDismissed.set(true)"
                    />
                  </app-phase-overlay>
                }
              }
              @case ('score') {
                <app-phase-overlay label="Game results">
                  <app-score-overlay [players]="scorePlayers()" [members]="members()" />
                </app-phase-overlay>
              }
            }
          </div>
        }
      </app-game-table-shell>
    }
  `,
  host: { class: 'block h-full' },
})
export class GameTable {
  protected readonly gameService = inject(GameService);
  readonly myUserID = input.required<number>();
  readonly members = input.required<UserIdentity[]>();

  protected readonly plugin: GameTablePlugin = SheepsheadTablePlugin;
  protected readonly crackDismissed = signal(false);

  protected readonly myHand = computed(() => {
    const state = this.gameService.state();
    return state ? this.plugin.getMyHand(state, this.myUserID()) : [];
  });

  protected readonly legalCards = computed(() => {
    const state = this.gameService.state();
    return state ? this.plugin.getLegalCards(state, this.gameService.validActions()) : [];
  });

  protected readonly currentTrick = computed(() => {
    const state = this.gameService.state();
    return state ? this.plugin.getCurrentTrick(state) : null;
  });

  protected readonly activeOverlay = computed(() => {
    const state = this.gameService.state();
    if (!state) return null;
    return this.plugin.getActiveOverlay(state, this.gameService.validActions());
  });

  constructor() {
    // Reset crack dismissed state when overlay changes away from crack
    effect(() => {
      if (this.activeOverlay() !== 'crack') {
        this.crackDismissed.set(false);
      }
    });
  }

  protected readonly buryCount = computed(() => {
    const config = this.gameService.config() as { blindSize?: number; name?: string } | null;
    if (!config) return 2;
    const blindSize = config.blindSize ?? 2;
    return config.name === 'partner-draft' ? blindSize / 2 : blindSize;
  });

  protected readonly scorePlayers = computed(() => {
    const state = this.gameService.state() as {
      players?: Array<{ userID: number; role: string | null; scoreDelta: number | null }>;
    } | null;
    return state?.players ?? [];
  });

  protected onCardPlayed(cardName: string): void {
    const state = this.gameService.state();
    if (!state) return;
    const event = this.plugin.buildPlayCardEvent(state, cardName) as {
      type: string;
      payload?: unknown;
    };
    this.gameService.sendAction(event);
  }

  protected onBuryConfirmed(cardNames: string[]): void {
    const state = this.gameService.state();
    if (!state) return;
    const event = this.plugin.buildBuryEvent(state, cardNames) as {
      type: string;
      payload?: unknown;
    };
    this.gameService.sendAction(event);
  }

  protected onAction(event: { type: string; payload?: unknown }): void {
    this.gameService.sendAction(event);
  }
}
