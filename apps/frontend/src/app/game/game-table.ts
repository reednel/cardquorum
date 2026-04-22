import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import type { UserIdentity } from '@cardquorum/shared';
import { GAME_TABLE_COMPONENTS, GAME_TABLE_PLUGINS } from './game-registry';
import { GameService } from './game.service';
import { InteractionController, type InteractionDispatcher } from './interaction-controller';

@Component({
  providers: [InteractionController],
  selector: 'app-game-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `
    @if (gameService.state(); as state) {
      @if (gameTableComponent(); as comp) {
        <ng-container *ngComponentOutlet="comp; inputs: gameTableInputs()" />
      }
    }
    <span class="sr-only" aria-live="polite">{{ interactionController.liveAnnouncement() }}</span>
  `,
  host: { class: 'block h-full' },
})
export class GameTable {
  protected readonly interactionController = inject(InteractionController);
  protected readonly gameService = inject(GameService);

  readonly myUserID = input.required<number>();
  readonly members = input.required<UserIdentity[]>();
  readonly isOwner = input.required<boolean>();
  readonly autostart = input.required<boolean>();
  readonly startNextGame = output<void>();

  /** Resolve the plugin from the game type. */
  readonly plugin = computed(() => {
    const gameType = this.gameService.gameType();
    return gameType ? (GAME_TABLE_PLUGINS[gameType] ?? null) : null;
  });

  /** Resolve the game-specific table component from the game type. */
  readonly gameTableComponent = computed(() => {
    const gameType = this.gameService.gameType();
    return gameType ? (GAME_TABLE_COMPONENTS[gameType] ?? null) : null;
  });

  /** Inputs to pass to the dynamically resolved game-specific table component. */
  readonly gameTableInputs = computed(() => ({
    myUserID: this.myUserID(),
    members: this.members(),
    isOwner: this.isOwner(),
    autostart: this.autostart(),
    startNextGame: this.startNextGame,
  }));

  /** Track the game phase for reset logic. */
  private readonly currentPhase = computed(() => {
    const state = this.gameService.state() as { phase?: string } | null;
    return state?.phase ?? null;
  });

  /**
   * Stable dispatcher — created once since GameService.queryTargets and
   * GameService.sendAction are stable method references that don't change.
   */
  private readonly dispatcher: InteractionDispatcher = {
    queryTargets: (sourceStackId, selectedCards, generation) =>
      this.gameService.queryTargets(sourceStackId, selectedCards, generation),
    sendAction: (event) => this.gameService.sendAction(event),
  };

  constructor() {
    // Initialize InteractionController with the stable dispatcher and a plugin adapter.
    // Only the plugin adapter is recreated when the plugin signal changes.
    // The adapter closures read state/validActions lazily via signals
    // so they always have fresh values without re-running the effect.
    effect(() => {
      const plugin = this.plugin();
      if (!plugin) return;
      const gameService = this.gameService;

      this.interactionController.init(this.dispatcher, {
        getDefaultTarget: () => {
          const state = gameService.state();
          const validActions = gameService.validActions();
          return state ? plugin.getDefaultTarget(state, validActions) : null;
        },
        buildMoveEvent: (selectedCards, targetStackId) => {
          const state = gameService.state();
          return state
            ? (plugin.buildMoveEvent(state, selectedCards, targetStackId) as {
                type: string;
                payload?: unknown;
              })
            : { type: 'noop' };
        },
      });
    });

    // Connect valid targets response to InteractionController
    effect(() => {
      const response = this.gameService.validTargetsResponse();
      if (response) {
        this.interactionController.receiveValidTargets(response.generation, response.targets);
      }
    });

    // Reset interaction state when the game phase changes OR when valid actions change.
    // Phase change: deal→pick→bury→play→score transitions.
    // ValidActions change: active player changes within the same phase (e.g., play phase
    // rotates between players — your validActions go from ['play_card'] to []).
    // This prevents stale IC state (glowing targets, stuck selections) from persisting.
    effect(() => {
      this.currentPhase();
      this.gameService.validActions();
      this.interactionController.reset();
    });
  }
}
