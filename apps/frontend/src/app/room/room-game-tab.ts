import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faCircleInfo, faRepeat } from '@fortawesome/free-solid-svg-icons';
import {
  ConfigFieldDef,
  FieldRegistry,
  GenericConfigPreset,
  SelectFieldDef,
} from '@cardquorum/engine';
import {
  GameSettingsLoadedPayload,
  GameSettingsUpdatedPayload,
  RoomGameSettings,
  RosterMember,
  WS_EMIT,
  WS_EVENT,
} from '@cardquorum/shared';
import { SheepsheadConfigPlugin } from '@cardquorum/sheepshead';
import { GameRegistry } from '../game/game-registry';
import { GameService } from '../game/game.service';
import { ConfirmDialog } from '../shared/confirm-dialog';
import { WebSocketService } from '../websocket.service';
import { validateGameForm } from './game-form-validation';
import { RoomContextService } from './room-context.service';

const GAMES: GameRegistry = {
  sheepshead: SheepsheadConfigPlugin,
};

type TimeUnit = 'seconds' | 'minutes' | 'hours';

const UNIT_FACTORS: Record<TimeUnit, number> = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
};

const TIME_UNITS: { value: TimeUnit; label: string }[] = [
  { value: 'seconds', label: 'seconds' },
  { value: 'minutes', label: 'minutes' },
  { value: 'hours', label: 'hours' },
];

type FieldEntry = {
  key: string;
  displayName: string;
  description: string;
  mode: string;
  value: unknown;
  options?: unknown[];
  renderType: 'boolean' | 'select' | 'number' | 'nullable-number' | 'hidden-array';
};

export function buildFieldEntries(
  preset: GenericConfigPreset,
  registry: FieldRegistry,
): FieldEntry[] {
  return Object.entries(preset.fields).map(([key, field]) => {
    const meta = registry[key];
    return {
      key,
      displayName: meta?.displayName ?? key,
      description: meta?.description ?? '',
      mode: field.mode,
      value: field.value,
      options: 'options' in field ? (field as SelectFieldDef<unknown>).options : undefined,
      renderType: meta?.renderType ?? 'number',
    };
  });
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-room-game-tab',
  imports: [FormsModule, FaIconComponent, ConfirmDialog],
  template: `
    <div id="game-panel" role="tabpanel" aria-label="Game" class="flex min-h-0 flex-1 flex-col">
      <div class="flex-1 overflow-y-auto p-4">
        <!-- Game type -->
        <label
          for="game-type"
          class="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary
               dark:text-text-heading-dark"
        >
          Game
        </label>
        <select
          id="game-type"
          [ngModel]="selectedGame()"
          (ngModelChange)="onGameChange($event)"
          [disabled]="!isOwner() || formLocked()"
          class="mb-4 w-full rounded-default border border-border-input bg-bg px-3 py-2 text-sm
                disabled:opacity-disabled
               dark:border-border-input-dark dark:bg-surface-dark dark:text-white"
        >
          <option value="">— Select a game —</option>
          @for (entry of gameEntries; track entry.key) {
            <option [value]="entry.key">{{ entry.label }}</option>
          }
        </select>

        <!-- Preset -->
        @if (selectedGame()) {
          <label
            for="preset"
            class="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary
                 dark:text-text-secondary-dark"
          >
            Variant
          </label>
          <select
            id="preset"
            [ngModel]="selectedPresetIndex()"
            (ngModelChange)="onPresetChange($event)"
            [disabled]="!isOwner() || formLocked()"
            class="mb-1 w-full rounded-default border border-border-input bg-bg px-3 py-2 text-sm
                  disabled:opacity-disabled
                 dark:border-border-input-dark dark:bg-surface-dark dark:text-white"
          >
            <option [value]="-1">— Select a variant —</option>
            @for (preset of presets(); track $index) {
              <option [value]="$index">{{ preset.label }}</option>
            }
          </select>
          @if (activePreset(); as preset) {
            <p class="mb-3 text-xs text-text-secondary dark:text-text-secondary-dark">
              {{ preset.description }}
            </p>
          }
        }

        <!-- Locked fields (read-only context) -->
        @if (lockedFields().length > 0) {
          <div
            class="mb-4 rounded-default border border-border bg-surface p-3
                    dark:border-border-dark dark:bg-surface-dark/50"
          >
            <h4
              class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary
                     dark:text-text-secondary-dark"
            >
              Fixed Rules
            </h4>
            <dl class="flex flex-col gap-1">
              @for (entry of lockedFields(); track entry.key) {
                <div class="flex items-center justify-between text-sm">
                  <dt
                    class="text-text-body dark:text-text-secondary-dark"
                    [title]="entry.description"
                  >
                    {{ entry.displayName }}
                  </dt>
                  <dd class="font-medium text-text-heading dark:text-text-heading-dark">
                    {{ displayValue(configValues()[entry.key]) }}
                  </dd>
                </div>
              }
            </dl>
          </div>
        }

        <!-- Editable config fields -->
        @if (editableFields().length > 0) {
          <h4
            class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary
                   dark:text-text-secondary-dark"
          >
            House Rules
          </h4>
          <div class="flex flex-col gap-3">
            @for (field of editableFields(); track field.key) {
              @switch (field.renderType) {
                @case ('boolean') {
                  <label
                    class="flex items-center justify-between text-sm text-text-body dark:text-text-body-dark"
                  >
                    <span [title]="field.description">{{ field.displayName }}</span>
                    <input
                      type="checkbox"
                      [ngModel]="configValues()[field.key]"
                      (ngModelChange)="onFieldChange(field.key, $event)"
                      [disabled]="!isOwner() || formLocked()"
                      class="h-4 w-4 rounded border-border-input text-primary
                           disabled:opacity-disabled
                           dark:border-border-input-dark"
                    />
                  </label>
                }
                @case ('select') {
                  <div>
                    <label
                      [attr.for]="'field-' + field.key"
                      [title]="field.description"
                      class="mb-1 block text-sm text-text-body dark:text-text-body-dark"
                    >
                      {{ field.displayName }}
                    </label>
                    <select
                      [id]="'field-' + field.key"
                      [ngModel]="configValues()[field.key]"
                      (ngModelChange)="onFieldChange(field.key, coerce($event))"
                      [disabled]="!isOwner() || formLocked()"
                      class="w-full rounded-default border border-border-input bg-bg px-3 py-1.5 text-sm
                            disabled:opacity-disabled
                           dark:border-border-input-dark dark:bg-surface-dark dark:text-white"
                    >
                      @for (opt of field.options; track opt) {
                        <option [ngValue]="opt">{{ displayValue(opt) }}</option>
                      }
                    </select>
                  </div>
                }
                @case ('number') {
                  <div>
                    <label
                      [attr.for]="'field-' + field.key"
                      [title]="field.description"
                      class="mb-1 block text-sm text-text-body dark:text-text-body-dark"
                    >
                      {{ field.displayName }}
                    </label>
                    <input
                      [id]="'field-' + field.key"
                      type="number"
                      [ngModel]="configValues()[field.key]"
                      (ngModelChange)="onFieldChange(field.key, $event)"
                      [disabled]="!isOwner() || formLocked()"
                      class="w-full rounded-default border border-border-input bg-bg px-3 py-1.5 text-sm
                            disabled:opacity-disabled
                           dark:border-border-input-dark dark:bg-surface-dark dark:text-white"
                    />
                  </div>
                }
                @case ('nullable-number') {
                  <div>
                    <label
                      [attr.for]="'field-' + field.key"
                      [title]="field.description"
                      class="mb-1 block text-sm text-text-body dark:text-text-body-dark"
                    >
                      {{ field.displayName }}
                    </label>
                    <div class="flex items-center gap-2">
                      <input
                        [id]="'field-' + field.key"
                        type="number"
                        min="1"
                        step="1"
                        [ngModel]="configValues()[field.key]"
                        (ngModelChange)="onFieldChange(field.key, $event)"
                        [disabled]="
                          !isOwner() || formLocked() || configValues()[field.key] === null
                        "
                        placeholder="∞"
                        class="w-20 rounded-default border border-border-input bg-bg px-3 py-1.5 text-sm
                              disabled:opacity-disabled
                             dark:border-border-input-dark dark:bg-surface-dark dark:text-white"
                      />
                      <label
                        class="flex items-center gap-1.5 text-sm text-text-body dark:text-text-secondary-dark"
                      >
                        <input
                          type="checkbox"
                          [ngModel]="configValues()[field.key] === null"
                          (ngModelChange)="onFieldChange(field.key, $event ? null : 1)"
                          [disabled]="!isOwner() || formLocked()"
                          class="h-4 w-4 rounded border-border-input text-primary
                               disabled:opacity-disabled
                               dark:border-border-input-dark"
                        />
                        No Limit
                      </label>
                    </div>
                  </div>
                }
              }
            }
          </div>
        }

        <!-- Turn Time Limit -->
        <div class="mt-4 border-t border-border pt-4 dark:border-border-dark">
          <div class="mb-2 flex items-center gap-1.5">
            <span
              class="text-xs font-semibold uppercase tracking-wide text-text-secondary
                     dark:text-text-heading-dark"
            >
              Turn Time Limit
            </span>
            <fa-icon
              [icon]="faCircleInfo"
              class="text-xs text-text-secondary dark:text-text-secondary-dark"
              [title]="turnTimeLimitTooltip"
              [attr.aria-label]="turnTimeLimitTooltip"
            />
          </div>

          <div class="flex flex-col gap-2">
            <label
              class="flex items-center gap-1.5 text-sm text-text-body dark:text-text-body-dark"
            >
              <input
                type="checkbox"
                data-testid="turn-time-unlimited"
                [ngModel]="turnTimeUnlimited()"
                (ngModelChange)="onTurnTimeUnlimitedChange($event)"
                [disabled]="!isOwner() || formLocked()"
                class="h-4 w-4 rounded border-border-input text-primary
                     disabled:opacity-disabled
                     dark:border-border-input-dark"
              />
              Unlimited
            </label>

            <div class="flex items-center gap-2">
              <input
                id="turn-time-value"
                type="number"
                data-testid="turn-time-value"
                min="1"
                max="999"
                step="1"
                [ngModel]="turnTimeValue()"
                (ngModelChange)="onTurnTimeValueChange($event)"
                [disabled]="!isOwner() || formLocked() || turnTimeUnlimited()"
                placeholder="—"
                class="w-20 rounded-default border border-border-input bg-bg px-3 py-1.5 text-sm
                      disabled:opacity-disabled
                     dark:border-border-input-dark dark:bg-surface-dark dark:text-white"
              />
              <select
                id="turn-time-unit"
                data-testid="turn-time-unit"
                [ngModel]="turnTimeUnit()"
                (ngModelChange)="onTurnTimeUnitChange($event)"
                [disabled]="!isOwner() || formLocked() || turnTimeUnlimited()"
                class="rounded-default border border-border-input bg-bg px-3 py-1.5 text-sm
                      disabled:opacity-disabled
                     dark:border-border-input-dark dark:bg-surface-dark dark:text-white"
              >
                @for (unit of timeUnits; track unit.value) {
                  <option [value]="unit.value">{{ unit.label }}</option>
                }
              </select>
            </div>

            @if (turnTimeLimitError()) {
              <p
                data-testid="turn-time-error"
                class="text-xs text-danger dark:text-danger-dark"
                role="alert"
              >
                {{ turnTimeLimitError() }}
              </p>
            }
          </div>
        </div>
      </div>

      <!-- Bottom actions (owner only) -->
      @if (isOwner()) {
        <div class="border-t border-border p-4 pt-3 dark:border-border-dark">
          @if (!gameService.sessionId() && validationErrors().length > 0) {
            <ul class="mb-3 list-none space-y-1">
              @for (msg of validationErrors(); track msg) {
                <li
                  data-testid="validation-message"
                  class="text-xs text-danger dark:text-danger-dark"
                >
                  {{ msg }}
                </li>
              }
            </ul>
          }
          <div class="flex gap-2">
            @if (gameService.sessionId()) {
              <button
                data-testid="abort-game-btn"
                (click)="confirmingAbort.set(true)"
                class="min-w-0 flex-1 rounded-default border border-danger px-4 py-2 text-sm font-medium
                       text-danger hover:bg-danger-surface
                       dark:border-danger-dark dark:text-danger-dark dark:hover:bg-danger-surface-dark"
              >
                Abort Game
              </button>
            } @else {
              <button
                data-testid="start-game-btn"
                [disabled]="!canStart()"
                (click)="onStart()"
                class="min-w-0 flex-1 rounded-default bg-primary px-4 py-2 text-sm font-medium text-white
                       transition-colors hover:bg-primary-hover
                        disabled:opacity-disabled
                       dark:bg-primary-dark dark:hover:bg-primary-dark-hover"
              >
                Start Game
              </button>
            }
            <button
              type="button"
              data-testid="autostart-checkbox"
              title="Autostart next game"
              [attr.aria-label]="'Autostart next game'"
              [attr.aria-pressed]="autostart()"
              (click)="onAutostartChange(!autostart())"
              [class]="
                'flex aspect-square items-center justify-center rounded-default border px-2 py-2 transition-colors ' +
                (autostart()
                  ? 'border-primary bg-primary text-white hover:bg-primary-hover dark:border-primary-dark dark:bg-primary-dark dark:hover:bg-primary-dark-hover'
                  : 'border-border text-text-secondary hover:bg-surface-raised dark:border-border-dark dark:text-text-secondary-dark dark:hover:bg-surface-raised-dark')
              "
            >
              <fa-icon [icon]="faRepeat" class="text-sm" />
            </button>
          </div>
        </div>
      }
    </div>

    @if (confirmingAbort()) {
      <app-confirm-dialog
        title="Abort Game"
        message="This will end the current game for all players. This does not count as a forefit."
        confirmLabel="Abort"
        titleId="abort-dialog-title"
        (confirmed)="onAbort()"
        (closed)="confirmingAbort.set(false)"
      />
    }
  `,
})
export class RoomGameTab implements OnInit {
  readonly isOwner = input(false);
  readonly rosterPlayers = input<RosterMember[]>([]);

  protected readonly gameService = inject(GameService);
  protected readonly faRepeat = faRepeat;
  protected readonly faCircleInfo = faCircleInfo;
  private readonly roomContext = inject(RoomContextService);
  private readonly ws = inject(WebSocketService);
  private readonly destroyRef = inject(DestroyRef);

  /** Set to true after createGame is called; cleared once startGame fires. */
  private readonly pendingStart = signal(false);

  /** Whether the abort confirmation dialog is open. */
  protected readonly confirmingAbort = signal(false);

  /** Autostart next game when current one ends. */
  readonly autostart = signal(false);

  /** Turn time limit UI state */
  protected readonly turnTimeUnlimited = signal(true);
  protected readonly turnTimeValue = signal<number | null>(null);
  protected readonly turnTimeUnit = signal<TimeUnit>('minutes');
  protected readonly timeUnits = TIME_UNITS;
  protected readonly turnTimeLimitTooltip =
    "Controls how long each player has per turn before the room owner can force-abandon on their behalf. 'Unlimited' disables this feature.";

  /** Computed turn time limit in seconds, or null if unlimited */
  protected readonly computedTurnTimeLimit = computed<number | null>(() => {
    if (this.turnTimeUnlimited()) return null;
    const value = this.turnTimeValue();
    if (value === null) return null;
    return value * UNIT_FACTORS[this.turnTimeUnit()];
  });

  /** Validation error for the turn time limit input */
  protected readonly turnTimeLimitError = computed<string | null>(() => {
    if (this.turnTimeUnlimited()) return null;
    const value = this.turnTimeValue();
    if (value === null || value === undefined) return 'Enter a value between 1 and 999.';
    if (!Number.isInteger(value)) return 'Value must be a whole number.';
    if (value < 1 || value > 999) return 'Value must be between 1 and 999.';
    return null;
  });

  /** Guard flag to prevent WS receive → form update → WS send loops. */
  private syncing = false;

  constructor() {
    // When a session is created after the owner clicked Start, auto-start it.
    effect(() => {
      const sessionId = this.gameService.sessionId();
      if (this.pendingStart() && sessionId !== null) {
        this.pendingStart.set(false);
        this.gameService.startGame(sessionId);
      }
    });

    // Autostart trigger: when a game ends (store transitions from null to non-null)
    // and autostart is enabled and validation passes, auto-create + start a new game.
    // We track the previous store value to only trigger on the transition, not when
    // autostart is toggled while an old store result is still present.
    let prevStore: unknown = this.gameService.store();
    effect(() => {
      const store = this.gameService.store();
      const autostartEnabled = this.autostart();
      const canStart = this.canStart();
      const justEnded = prevStore === null && store !== null;
      prevStore = store;
      if (justEnded && autostartEnabled) {
        if (canStart) {
          this.onStart();
        }
        // Clear the game display so the game table disappears — the score
        // overlay is hidden when autostart is enabled, so nothing else will.
        this.gameService.clearDisplay();
      }
    });

    // When a GAME_ERROR arrives while pendingStart is true, the auto-start
    // sequence failed (e.g., player count mismatch). Cancel the orphaned
    // waiting session so the UI reverts to "Start Game".
    effect(() => {
      const error = this.gameService.error();
      if (error && this.pendingStart()) {
        this.pendingStart.set(false);
        this.gameService.cancelGame();
      }
    });

    // Keep playerCount in configValues in sync with the actual roster size.
    effect(() => {
      const count = this.rosterPlayers().length;
      const current = this.configValues();
      if ('playerCount' in current && current['playerCount'] !== count) {
        this.configValues.update((v) => ({ ...v, playerCount: count }));
      }
    });
  }

  ngOnInit(): void {
    // Listen for settings loaded response (after we send game-settings:load)
    const unsubLoaded = this.ws.on<GameSettingsLoadedPayload>(
      WS_EMIT.GAME_SETTINGS_LOADED,
      (payload) => {
        if (payload.settings) {
          this.applySettings(payload.settings);
        }
      },
    );

    // Listen for real-time settings updates (broadcast when another user changes settings)
    const unsubUpdated = this.ws.on<GameSettingsUpdatedPayload>(
      WS_EMIT.GAME_SETTINGS_UPDATED,
      (payload) => {
        if (payload.settings) {
          this.applySettings(payload.settings);
        }
      },
    );

    // Clean up WS listeners on destroy
    this.destroyRef.onDestroy(() => {
      unsubLoaded();
      unsubUpdated();
    });

    // Request persisted settings from the server
    this.loadSettings();
  }

  protected readonly gameEntries = Object.entries(GAMES).map(([key, entry]) => ({
    key,
    label: entry.label,
  }));

  protected readonly selectedGame = signal('');
  protected readonly selectedPresetIndex = signal(-1);
  protected readonly configValues = signal<Record<string, unknown>>({});

  protected readonly presets = computed<readonly GenericConfigPreset[]>(() => {
    const game = GAMES[this.selectedGame()];
    return game?.presets ?? [];
  });

  protected readonly activePreset = computed<GenericConfigPreset | null>(() => {
    const idx = this.selectedPresetIndex();
    const list = this.presets();
    return idx >= 0 && idx < list.length ? list[idx] : null;
  });

  protected readonly validationErrors = computed<string[]>(() => {
    const preset = this.activePreset();
    return validateGameForm({
      gameType: this.selectedGame() || null,
      selectedPresetIndex: this.selectedPresetIndex(),
      rosterCount: this.rosterPlayers().length,
      allowedPlayerCounts: preset ? preset.allowedPlayerCounts : null,
    });
  });

  readonly canStart = computed(() => this.validationErrors().length === 0);

  /** True when a game session is active — locks game type, variant, and config fields. */
  protected readonly formLocked = computed(() => this.gameService.sessionId() !== null);

  private readonly fieldEntries = computed<FieldEntry[]>(() => {
    const preset = this.activePreset();
    const game = GAMES[this.selectedGame()];
    return preset && game ? buildFieldEntries(preset, game.fieldRegistry) : [];
  });

  protected readonly lockedFields = computed(() =>
    this.fieldEntries().filter((f) => f.mode === 'locked'),
  );

  protected readonly editableFields = computed(() =>
    this.fieldEntries().filter((f) => f.mode === 'editable'),
  );

  protected onGameChange(gameType: string): void {
    this.selectedGame.set(gameType);
    this.selectedPresetIndex.set(-1);
    this.configValues.set({});
    this.sendSettings();
  }

  onStart(): void {
    const roomId = this.roomContext.currentRoomId();
    const gameType = this.selectedGame();
    const config = this.configValues();
    if (roomId && gameType) {
      this.pendingStart.set(true);
      this.gameService.createGame(roomId, gameType, config);
    }
  }

  protected onAbort(): void {
    this.confirmingAbort.set(false);
    this.gameService.cancelGame();
  }

  protected onAutostartChange(value: boolean): void {
    this.autostart.set(value);
    const roomId = this.roomContext.currentRoomId();
    if (roomId) {
      this.ws.send(WS_EVENT.GAME_SETTINGS_UPDATE, {
        roomId,
        settings: {
          gameType: this.selectedGame() || null,
          presetName: this.activePreset()?.name ?? null,
          config: this.configValues(),
          autostart: value,
          turnTimeLimit: this.computedTurnTimeLimit(),
        },
      });
    }
  }

  protected onPresetChange(index: number | string): void {
    const idx = typeof index === 'string' ? parseInt(index, 10) : index;
    this.selectedPresetIndex.set(idx);
    const preset = this.presets()[idx];
    if (preset) {
      const values: Record<string, unknown> = {
        name: preset.name,
        playerCount: this.rosterPlayers().length,
      };
      for (const [key, field] of Object.entries(preset.fields)) {
        values[key] = (field as ConfigFieldDef<unknown>).value;
      }
      this.configValues.set(values);
    }
    this.sendSettings();
  }

  protected onFieldChange(key: string, value: unknown): void {
    this.configValues.update((v) => ({ ...v, [key]: value }));
    this.sendSettings();
  }

  protected onTurnTimeUnlimitedChange(unlimited: boolean): void {
    this.turnTimeUnlimited.set(unlimited);
    if (unlimited) {
      // Clear validation errors when switching to unlimited
      this.turnTimeValue.set(null);
    } else if (this.turnTimeValue() === null) {
      // Set a default value when switching from unlimited
      this.turnTimeValue.set(60);
      this.turnTimeUnit.set('seconds');
    }
    this.sendSettings();
  }

  protected onTurnTimeValueChange(value: number | null): void {
    this.turnTimeValue.set(value);
    if (this.turnTimeLimitError() === null) {
      this.sendSettings();
    }
  }

  protected onTurnTimeUnitChange(unit: TimeUnit): void {
    this.turnTimeUnit.set(unit);
    if (this.turnTimeLimitError() === null) {
      this.sendSettings();
    }
  }

  protected coerce(value: unknown): unknown {
    if (value === 'null') return null;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  }

  protected displayValue(value: unknown): string {
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (value === null) return 'None';
    if (typeof value === 'string') {
      return value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return String(value);
  }

  /** Send current form state to the server for persistence. Skipped during WS sync. */
  private sendSettings(): void {
    if (this.syncing) return;
    const roomId = this.roomContext.currentRoomId();
    if (!roomId) return;
    this.ws.send(WS_EVENT.GAME_SETTINGS_UPDATE, {
      roomId,
      settings: {
        gameType: this.selectedGame() || null,
        presetName: this.activePreset()?.name ?? null,
        config: this.configValues(),
        autostart: this.autostart(),
        turnTimeLimit: this.computedTurnTimeLimit(),
      },
    });
  }

  /** Request persisted settings from the server. */
  private loadSettings(): void {
    const roomId = this.roomContext.currentRoomId();
    if (!roomId) return;
    this.ws.send(WS_EVENT.GAME_SETTINGS_LOAD, { roomId });
  }

  /** Apply settings received from the server to the form signals. */
  private applySettings(settings: RoomGameSettings): void {
    this.syncing = true;
    try {
      this.autostart.set(settings.autostart);

      // Apply turn time limit
      if (settings.turnTimeLimit === null || settings.turnTimeLimit === undefined) {
        this.turnTimeUnlimited.set(true);
        this.turnTimeValue.set(null);
      } else {
        this.turnTimeUnlimited.set(false);
        // Only update the UI if the current controls don't already represent the same total.
        const currentTotal = this.computedTurnTimeLimit();
        if (currentTotal !== settings.turnTimeLimit) {
          // Use seconds directly if it fits in the input range (1–999).
          // Only convert to a larger unit when the seconds value exceeds 999.
          const totalSeconds = settings.turnTimeLimit;
          if (totalSeconds <= 999) {
            this.turnTimeValue.set(totalSeconds);
            this.turnTimeUnit.set('seconds');
          } else if (totalSeconds % 3600 === 0 && totalSeconds / 3600 <= 999) {
            this.turnTimeValue.set(totalSeconds / 3600);
            this.turnTimeUnit.set('hours');
          } else if (totalSeconds % 60 === 0 && totalSeconds / 60 <= 999) {
            this.turnTimeValue.set(totalSeconds / 60);
            this.turnTimeUnit.set('minutes');
          } else {
            this.turnTimeValue.set(totalSeconds);
            this.turnTimeUnit.set('seconds');
          }
        }
      }

      const gameType = settings.gameType ?? '';
      this.selectedGame.set(gameType);

      // Resolve preset index from preset name
      const presets = this.presets();
      const presetIdx = settings.presetName
        ? presets.findIndex((p) => p.name === settings.presetName)
        : -1;
      this.selectedPresetIndex.set(presetIdx);

      if (presetIdx >= 0 && Object.keys(settings.config).length > 0) {
        this.configValues.set(settings.config);
      } else if (presetIdx >= 0) {
        // Preset found but no config saved — use preset defaults
        const preset = presets[presetIdx];
        const values: Record<string, unknown> = {
          name: preset.name,
          playerCount: this.rosterPlayers().length,
        };
        for (const [key, field] of Object.entries(preset.fields)) {
          values[key] = (field as ConfigFieldDef<unknown>).value;
        }
        this.configValues.set(values);
      } else {
        this.configValues.set({});
      }
    } finally {
      this.syncing = false;
    }
  }
}
