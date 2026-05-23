import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  Type,
  type OutputEmitterRef,
} from '@angular/core';
import type { ColorAssignmentMap, GameTablePlugin, UserIdentity } from '@cardquorum/shared';
import { CardStack } from '../card-stack';
import { GameSummaryShell } from '../game-summary-shell';
import { GameTableShell } from '../game-table-shell';
import { InteractionController } from '../interaction-controller';
import { setPendingCall } from './pending-call-state';
import { SheepsheadTablePlugin } from './sheepshead-table-plugin';

const CALL_OPTIONS: { value: string; label: string }[] = [
  { value: 'ac', label: 'Ace of Clubs' },
  { value: 'as', label: 'Ace of Spades' },
  { value: 'ah', label: 'Ace of Hearts' },
  { value: 'xc', label: '10 of Clubs' },
  { value: 'xs', label: '10 of Spades' },
  { value: 'xh', label: '10 of Hearts' },
  { value: 'alone', label: 'Go Alone' },
];

@Component({
  selector: 'app-sheepshead-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardStack, GameSummaryShell, GameTableShell],
  host: { class: 'block h-full' },
  template: `
    <app-game-table-shell
      [plugin]="plugin"
      [state]="state()"
      [validActions]="validActions()"
      [myUserID]="myUserID()"
      [members]="members()"
      [colorMap]="colorMap()"
      [config]="config()"
    >
      <!-- Play area: phase-dependent content -->
      <div playArea class="flex w-64 flex-col items-center gap-3">
        @switch (currentPhase()) {
          @case ('deal') {
            <app-card-stack
              [cards]="blindCards()"
              [cardWidth]="100"
              [spreadDirection]="0"
              [spread]="0.03"
            />
            <div role="group" aria-label="Deal actions">
              @if (canDeal()) {
                <button
                  data-testid="deal-btn"
                  (click)="onAction({ type: 'deal' })"
                  class="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary-hover"
                >
                  Deal
                </button>
              } @else {
                <p
                  data-testid="deal-waiting"
                  class="text-sm text-text-secondary dark:text-text-secondary-dark"
                >
                  Waiting for dealer...
                </p>
              }
            </div>
          }
          @case ('pick') {
            <app-card-stack [cards]="blindCards()" [spread]="0.3" [cardWidth]="100" />
            <div role="group" aria-label="Pick or pass">
              @if (canPickOrPass()) {
                <div data-testid="pick-actions" class="flex gap-3">
                  @if (canPick()) {
                    <button
                      data-testid="pick-btn"
                      (click)="onAction({ type: 'pick' })"
                      class="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary-hover"
                    >
                      Pick
                    </button>
                  }
                  @if (canPass()) {
                    <button
                      data-testid="pass-btn"
                      (click)="onAction({ type: 'pass' })"
                      class="rounded-lg bg-surface-raised px-6 py-2 text-sm font-medium text-text-body hover:bg-border-input dark:bg-border-input-dark dark:text-text-heading-dark dark:hover:bg-surface-raised-dark"
                    >
                      Pass
                    </button>
                  }
                </div>
              } @else {
                <p
                  data-testid="pick-waiting"
                  class="text-sm text-text-secondary dark:text-text-secondary-dark"
                >
                  Waiting for pick decision...
                </p>
              }
            </div>
          }
          @case ('bury') {
            @if (canBury()) {
              <app-card-stack stackId="buried" [cards]="[]" [cardWidth]="100" [droppable]="true" />
            } @else {
              <p
                data-testid="bury-waiting"
                class="text-sm text-text-secondary dark:text-text-secondary-dark"
              >
                Waiting for bury...
              </p>
            }
          }
          @case ('call') {
            <div role="group" aria-label="Call options">
              @if (pendingCall()) {
                <div data-testid="hole-card-selection" class="flex flex-col items-center gap-2">
                  <p class="text-sm text-text-secondary dark:text-text-secondary-dark">
                    Calling unknown ace
                  </p>
                  <button
                    data-testid="cancel-call-btn"
                    (click)="cancelPendingCall()"
                    class="rounded-lg bg-surface-raised px-5 py-2 text-sm font-medium text-text-body hover:bg-border-input dark:bg-border-input-dark dark:text-text-heading-dark dark:hover:bg-surface-raised-dark"
                  >
                    Cancel
                  </button>
                </div>
              } @else if (canCall()) {
                <div data-testid="call-options" class="grid grid-cols-2 gap-2">
                  @for (opt of callOptions(); track opt.value) {
                    <button
                      [attr.data-testid]="'call-btn-' + opt.value"
                      (click)="onCallSelected(opt.value)"
                      class="rounded-lg border border-border-input bg-bg px-4 py-2 text-sm font-medium text-text-body hover:bg-surface-raised dark:border-border-input-dark dark:bg-surface-raised-dark dark:text-text-heading-dark dark:hover:bg-surface-raised-dark"
                    >
                      {{ opt.label }}
                    </button>
                  }
                </div>
              } @else {
                <p
                  data-testid="call-waiting"
                  class="text-sm text-text-secondary dark:text-text-secondary-dark"
                >
                  Waiting for call...
                </p>
              }
            </div>
          }
          @default {
            <app-card-stack
              stackId="trick-pile"
              [cards]="trickCardNames()"
              [biasedPlacement]="true"
              [cardWidth]="100"
              [droppable]="true"
              [colorMap]="colorMap() ?? null"
              [playerIds]="trickPlayerIds()"
            />
          }
        }
      </div>

      <!-- Player hand with bury support via interaction system -->
      <div hand class="flex w-full flex-col items-center gap-2">
        @if (pendingCall()) {
          <p
            data-testid="hole-card-prompt"
            class="text-sm font-medium text-text-body dark:text-text-body-dark"
          >
            Drop a card to lay face-down as the unknown
          </p>
        }
        <div class="relative flex w-full justify-center">
          <app-card-stack
            stackId="hand"
            [cards]="myHand()"
            [spread]="0.5"
            [spreadAngle]="25"
            [autoScale]="true"
            [selectable]="true"
            [reorderable]="true"
            [draggable]="currentPhase() === 'play' || isBuryPhase() || !!pendingCall()"
            [maxSelections]="isBuryPhase() ? buryCount() : 1"
            [legalCards]="legalCards()"
            (cardsReordered)="onHandReordered($event)"
          />
          @if (pendingCall()) {
            <div class="absolute right-2 top-1/2 -translate-y-1/2">
              <app-card-stack
                stackId="hole-card"
                data-testid="hole-card-stack"
                [cards]="[]"
                [cardWidth]="72"
                [droppable]="true"
              />
            </div>
          }
          @if (showHoleCard()) {
            <div class="absolute right-2 top-1/2 -translate-y-1/2" data-testid="hole-card-play">
              <app-card-stack
                stackId="hole-card"
                [cards]="[null]"
                [cardIds]="['hole']"
                [cardWidth]="72"
                [draggable]="canPlayHole()"
                [selectable]="true"
                [legalCards]="canPlayHole() ? ['hole'] : []"
              />
            </div>
          }
        </div>
      </div>

      <!-- Corner actions -->
      <div cornerActions>
        @if (showCornerActions()) {
          <div
            data-testid="corner-actions"
            role="group"
            aria-label="Stake escalation options"
            class="flex flex-col gap-2"
          >
            @if (canCrack()) {
              <button
                data-testid="crack-btn"
                (click)="onAction({ type: 'crack' })"
                class="rounded-lg bg-danger px-5 py-2 text-sm font-medium text-white hover:bg-danger-hover"
              >
                Crack
              </button>
            }
            @if (canReCrack()) {
              <button
                data-testid="recrack-btn"
                (click)="onAction({ type: 're_crack' })"
                class="rounded-lg bg-danger px-5 py-2 text-sm font-medium text-white hover:bg-danger-hover"
              >
                Re-crack
              </button>
            }
            @if (canBlitz()) {
              <button
                data-testid="blitz-btn"
                (click)="onAction({ type: 'blitz', payload: { blitzType: 'black-blitz' } })"
                class="rounded-lg bg-danger px-5 py-2 text-sm font-medium text-white hover:bg-danger-hover"
              >
                Blitz
              </button>
            }
            <button
              data-testid="dismiss-btn"
              (click)="dismissCornerActions()"
              class="rounded-lg bg-surface-raised px-5 py-2 text-sm font-medium text-text-body hover:bg-border-input dark:bg-border-input-dark dark:text-text-heading-dark dark:hover:bg-surface-raised-dark"
            >
              Dismiss
            </button>
          </div>
        }
      </div>

      <!-- Game summary overlay -->
      @if (
        activeOverlay() === 'score' &&
        !autostart() &&
        !scoreDismissed() &&
        summaryComponent() &&
        actionDispatcher()
      ) {
        <div overlay>
          <app-game-summary-shell
            mode="end-of-game"
            [summaryComponent]="summaryComponent()!"
            [store]="gameStore()"
            [participants]="members()"
            [isOwner]="isOwner()"
            [canStartNext]="canStartNext() && actionDispatcher() !== null"
            (dismissed)="onScoreDismissed()"
            (startNextGame)="onStartNextGame()"
          />
        </div>
      }
    </app-game-table-shell>
  `,
})
export class SheepsheadTable {
  private readonly interactionController = inject(InteractionController, { optional: true });

  // ── Data inputs (replacing GameService reads) ──
  readonly state = input.required<unknown>();
  readonly validActions = input.required<string[]>();
  readonly config = input<unknown>(null);
  readonly colorMap = input<ColorAssignmentMap | undefined>(undefined);
  readonly actionDispatcher = input<((event: { type: string; payload?: unknown }) => void) | null>(
    null,
  );
  readonly store = input<unknown>(null);

  // ── Inputs from GameTable via NgComponentOutlet ──
  readonly myUserID = input.required<number>();
  readonly members = input.required<UserIdentity[]>();
  readonly isOwner = input.required<boolean>();
  readonly autostart = input.required<boolean>();
  readonly canStartNext = input.required<boolean>();
  readonly startNextGame = input.required<OutputEmitterRef<void>>();

  // ── Plugin reference ──
  protected readonly plugin: GameTablePlugin = SheepsheadTablePlugin;

  // ── Local state ──
  protected readonly crackDismissed = signal(false);
  protected readonly scoreDismissed = signal(false);
  protected readonly pendingCall = signal<string | null>(null);
  private readonly handOrder = signal<string[] | null>(null);
  protected readonly callOptions = computed(() => {
    const state = this.state() as { legalCallableCards?: string[] | null } | null;
    const legal = state?.legalCallableCards;
    if (!legal) return CALL_OPTIONS;
    return CALL_OPTIONS.filter((opt) => legal.includes(opt.value));
  });

  // ── Cards that require a hole card (unknown ace condition) ──
  private readonly holeCardRequired = computed(() => {
    const state = this.state() as { holeCardRequired?: string[] | null } | null;
    return state?.holeCardRequired ?? [];
  });

  // ── Current game phase ──
  protected readonly currentPhase = computed(() => {
    const state = this.state() as { phase?: string } | null;
    return state?.phase ?? 'deal';
  });

  // ── Blind cards for deck/blind CardStack ──
  protected readonly blindCards = computed(() => {
    const state = this.state();
    return state ? this.plugin.getBlindCards(state) : [];
  });

  // ── Whether we're in bury phase with bury action available ──
  protected readonly isBuryPhase = computed(
    () => this.currentPhase() === 'bury' && this.validActions().includes('bury'),
  );

  // ── Whether crack/re-crack/blitz actions are available from the server ──
  private readonly hasCrackActions = computed(() => {
    const va = this.validActions();
    return va.includes('crack') || va.includes('re_crack') || va.includes('blitz');
  });

  // ── Corner actions visibility (available and not dismissed) ──
  protected readonly showCornerActions = computed(
    () => this.hasCrackActions() && !this.crackDismissed(),
  );

  // ── Helper booleans for template ──
  protected readonly canDeal = computed(() => this.validActions().includes('deal'));
  protected readonly canPick = computed(() => this.validActions().includes('pick'));
  protected readonly canPass = computed(() => this.validActions().includes('pass'));
  protected readonly canPickOrPass = computed(() => this.canPick() || this.canPass());
  protected readonly canBury = computed(() => this.validActions().includes('bury'));
  protected readonly canCall = computed(() => this.validActions().includes('call_ace'));
  protected readonly canCrack = computed(() => this.validActions().includes('crack'));
  protected readonly canReCrack = computed(() => this.validActions().includes('re_crack'));
  protected readonly canBlitz = computed(() => this.validActions().includes('blitz'));
  protected readonly canPlayHole = computed(() => this.validActions().includes('play_hole'));

  // ── Hole card visibility (face-down card next to hand during play) ──
  protected readonly showHoleCard = computed(() => {
    const state = this.state() as { hasHoleCard?: boolean } | null;
    return state?.hasHoleCard ?? false;
  });

  // ── Player hand with local reorder support ──
  protected readonly myHand = computed(() => {
    const state = this.state();
    const serverHand = state ? this.plugin.getMyHand(state, this.myUserID()) : [];
    const localOrder = this.handOrder();
    if (!localOrder) return serverHand;
    const serverSet = new Set(serverHand);
    const ordered = localOrder.filter((c) => serverSet.has(c));
    for (const c of serverHand) {
      if (!localOrder.includes(c)) ordered.push(c);
    }
    return ordered;
  });

  // ── Legal cards (only during play phase) ──
  protected readonly legalCards = computed(() => {
    const state = this.state();
    if (!state) return [];
    const phase = this.currentPhase();
    if (phase !== 'play') return null;
    return this.plugin.getLegalCards(state, this.validActions());
  });

  // ── Current trick ──
  protected readonly currentTrick = computed(() => {
    const state = this.state();
    return state ? this.plugin.getCurrentTrick(state) : null;
  });

  protected readonly trickCardNames = computed(() => {
    const trick = this.currentTrick();
    return trick ? trick.map((play) => play.cardName) : [];
  });

  protected readonly trickPlayerIds = computed(() => {
    const trick = this.currentTrick();
    return trick ? trick.map((play) => play.userID) : [];
  });

  // ── Active overlay ──
  protected readonly activeOverlay = computed(() => {
    const state = this.state();
    if (!state) return null;
    return this.plugin.getActiveOverlay(state, this.validActions());
  });

  // ── Bury count ──
  protected readonly buryCount = computed(() => {
    const state = this.state();
    return state ? this.plugin.getBuryCount(state, this.config()) : 2;
  });

  // ── Score players ──
  protected readonly scorePlayers = computed(() => {
    const state = this.state() as {
      players?: Array<{ userID: number; role: string | null; scoreDelta: number | null }>;
    } | null;
    return state?.players ?? [];
  });

  // ── Summary component from plugin ──
  protected readonly summaryComponent = computed((): Type<unknown> | null => {
    return this.plugin.getSummaryComponent?.() ?? null;
  });

  // ── Game store for summary (from GAME_OVER event) ──
  protected readonly gameStore = computed(() => {
    return this.store() ?? this.state();
  });

  constructor() {
    // Reset crackDismissed when crack actions are no longer available
    effect(() => {
      if (!this.hasCrackActions()) {
        this.crackDismissed.set(false);
      }
    });

    // Focus management: move focus to first action button on phase change
    effect(() => {
      const phase = this.currentPhase();
      void phase;
      queueMicrotask(() => {
        const el = document.querySelector<HTMLElement>(
          '[data-testid="deal-btn"], [data-testid="pick-btn"], [data-testid="pass-btn"], [data-testid="call-btn-ac"]',
        );
        el?.focus();
      });
    });

    // Reset scoreDismissed when phase changes away from score
    effect(() => {
      if (this.currentPhase() !== 'score') {
        this.scoreDismissed.set(false);
      }
    });

    // Reset pendingCall when phase changes away from call
    effect(() => {
      if (this.currentPhase() !== 'call') {
        this.pendingCall.set(null);
        setPendingCall(null);
      }
    });
  }

  protected dismissCornerActions(): void {
    this.crackDismissed.set(true);
  }

  protected onStartNextGame(): void {
    this.startNextGame().emit();
  }

  protected onScoreDismissed(): void {
    this.scoreDismissed.set(true);
  }

  protected onHandReordered(newOrder: (string | null)[]): void {
    this.handOrder.set(newOrder.filter((c): c is string => c !== null));
  }

  protected onCallSelected(cardValue: string): void {
    if (this.holeCardRequired().includes(cardValue)) {
      // Unknown ace condition — need to drop a hole card
      this.pendingCall.set(cardValue);
      setPendingCall(cardValue);
    } else {
      // Normal call — dispatch immediately
      this.onAction({ type: 'call_ace', payload: { card: cardValue } });
    }
  }

  protected cancelPendingCall(): void {
    this.pendingCall.set(null);
    setPendingCall(null);
    this.interactionController?.reset();
  }

  protected onAction(event: { type: string; payload?: unknown }): void {
    this.actionDispatcher()?.(event);
  }
}
