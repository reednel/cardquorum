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
import { ChatService } from '../chat/chat.service';
import { GameRegistry } from '../game/game-registry';
import { GameService } from '../game/game.service';
import { WebSocketService } from '../websocket.service';
import { validateGameForm } from './game-form-validation';

const GAMES: GameRegistry = {
  sheepshead: SheepsheadConfigPlugin,
};

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
  imports: [FormsModule],
  template: `
    <div id="game-panel" role="tabpanel" aria-label="Game" class="flex-1 overflow-y-auto p-4">
      <!-- Start / Abort buttons -->
      @if (isOwner()) {
        @if (gameService.sessionId()) {
          <button
            data-testid="abort-game-btn"
            (click)="onAbort()"
            class="mb-4 w-full rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white
                   transition-colors hover:bg-red-700 focus:outline-none focus:ring-2
                   focus:ring-red-500 focus:ring-offset-2
                   dark:bg-red-700 dark:hover:bg-red-800"
          >
            Abort Game
          </button>
        } @else {
          <button
            data-testid="start-game-btn"
            [disabled]="!canStart()"
            (click)="onStart()"
            class="mb-4 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white
                   transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2
                   focus:ring-indigo-500 focus:ring-offset-2
                   disabled:cursor-not-allowed disabled:opacity-60
                   dark:bg-indigo-700 dark:hover:bg-indigo-800"
          >
            Start Game
          </button>
          @if (validationErrors().length > 0) {
            <ul class="mb-4 list-none space-y-1">
              @for (msg of validationErrors(); track msg) {
                <li data-testid="validation-message" class="text-xs text-red-600 dark:text-red-400">
                  {{ msg }}
                </li>
              }
            </ul>
          }
        }
      }

      <!-- Autostart checkbox -->
      <label
        data-testid="autostart-checkbox"
        class="mb-4 flex items-center justify-between text-sm text-gray-700 dark:text-gray-300"
      >
        <span>Autostart Next Game</span>
        <input
          type="checkbox"
          [ngModel]="autostart()"
          (ngModelChange)="onAutostartChange($event)"
          [disabled]="!isOwner()"
          class="h-4 w-4 rounded border-gray-300 text-indigo-600
                 focus:ring-indigo-500 disabled:opacity-60
                 dark:border-gray-600"
        />
      </label>

      <!-- Game type -->
      <label
        for="game-type"
        class="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500
               dark:text-gray-200"
      >
        Game
      </label>
      <select
        id="game-type"
        [ngModel]="selectedGame()"
        (ngModelChange)="onGameChange($event)"
        [disabled]="!isOwner() || formLocked()"
        class="mb-4 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm
               focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500
               disabled:cursor-not-allowed disabled:opacity-60
               dark:border-gray-600 dark:bg-gray-800 dark:text-white"
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
          class="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500
                 dark:text-gray-400"
        >
          Variant
        </label>
        <select
          id="preset"
          [ngModel]="selectedPresetIndex()"
          (ngModelChange)="onPresetChange($event)"
          [disabled]="!isOwner() || formLocked()"
          class="mb-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm
                 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500
                 disabled:cursor-not-allowed disabled:opacity-60
                 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        >
          <option [value]="-1">— Select a variant —</option>
          @for (preset of presets(); track $index) {
            <option [value]="$index">{{ preset.label }}</option>
          }
        </select>
        @if (activePreset(); as preset) {
          <p class="mb-3 text-xs text-gray-500 dark:text-gray-400">{{ preset.description }}</p>
        }
      }

      <!-- Locked fields (read-only context) -->
      @if (lockedFields().length > 0) {
        <div
          class="mb-4 rounded-md border border-gray-200 bg-gray-50 p-3
                    dark:border-gray-700 dark:bg-gray-800/50"
        >
          <h4
            class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500
                     dark:text-gray-400"
          >
            Fixed Rules
          </h4>
          <dl class="flex flex-col gap-1">
            @for (entry of lockedFields(); track entry.key) {
              <div class="flex items-center justify-between text-sm">
                <dt class="text-gray-600 dark:text-gray-400" [title]="entry.description">
                  {{ entry.displayName }}
                </dt>
                <dd class="font-medium text-gray-800 dark:text-gray-200">
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
          class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500
                   dark:text-gray-400"
        >
          House Rules
        </h4>
        <div class="flex flex-col gap-3">
          @for (field of editableFields(); track field.key) {
            @switch (field.renderType) {
              @case ('boolean') {
                <label
                  class="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300"
                >
                  <span [title]="field.description">{{ field.displayName }}</span>
                  <input
                    type="checkbox"
                    [ngModel]="configValues()[field.key]"
                    (ngModelChange)="onFieldChange(field.key, $event)"
                    [disabled]="!isOwner() || formLocked()"
                    class="h-4 w-4 rounded border-gray-300 text-indigo-600
                           focus:ring-indigo-500 disabled:opacity-60
                           dark:border-gray-600"
                  />
                </label>
              }
              @case ('select') {
                <div>
                  <label
                    [attr.for]="'field-' + field.key"
                    [title]="field.description"
                    class="mb-1 block text-sm text-gray-700 dark:text-gray-300"
                  >
                    {{ field.displayName }}
                  </label>
                  <select
                    [id]="'field-' + field.key"
                    [ngModel]="configValues()[field.key]"
                    (ngModelChange)="onFieldChange(field.key, coerce($event))"
                    [disabled]="!isOwner() || formLocked()"
                    class="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm
                           focus:border-indigo-500 focus:outline-none focus:ring-1
                           focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60
                           dark:border-gray-600 dark:bg-gray-800 dark:text-white"
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
                    class="mb-1 block text-sm text-gray-700 dark:text-gray-300"
                  >
                    {{ field.displayName }}
                  </label>
                  <input
                    [id]="'field-' + field.key"
                    type="number"
                    [ngModel]="configValues()[field.key]"
                    (ngModelChange)="onFieldChange(field.key, $event)"
                    [disabled]="!isOwner() || formLocked()"
                    class="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm
                           focus:border-indigo-500 focus:outline-none focus:ring-1
                           focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60
                           dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              }
              @case ('nullable-number') {
                <div>
                  <label
                    [attr.for]="'field-' + field.key"
                    [title]="field.description"
                    class="mb-1 block text-sm text-gray-700 dark:text-gray-300"
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
                      [disabled]="!isOwner() || formLocked() || configValues()[field.key] === null"
                      placeholder="∞"
                      class="w-20 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm
                             focus:border-indigo-500 focus:outline-none focus:ring-1
                             focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60
                             dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    />
                    <label
                      class="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400"
                    >
                      <input
                        type="checkbox"
                        [ngModel]="configValues()[field.key] === null"
                        (ngModelChange)="onFieldChange(field.key, $event ? null : 1)"
                        [disabled]="!isOwner() || formLocked()"
                        class="h-4 w-4 rounded border-gray-300 text-indigo-600
                               focus:ring-indigo-500 disabled:opacity-60
                               dark:border-gray-600"
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
    </div>
  `,
})
export class RoomGameTab implements OnInit {
  readonly isOwner = input(false);
  readonly rosterPlayers = input<RosterMember[]>([]);

  protected readonly gameService = inject(GameService);
  private readonly chatService = inject(ChatService);
  private readonly ws = inject(WebSocketService);
  private readonly destroyRef = inject(DestroyRef);

  /** Set to true after createGame is called; cleared once startGame fires. */
  private readonly pendingStart = signal(false);

  /** Autostart next game when current one ends. */
  readonly autostart = signal(false);

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

    // Autostart trigger: when game ends (store becomes non-null) and autostart is enabled
    // and validation passes, auto-create + start a new game.
    effect(() => {
      const store = this.gameService.store();
      const autostartEnabled = this.autostart();
      const canStart = this.canStart();
      if (store !== null && autostartEnabled && canStart) {
        this.onStart();
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

  protected readonly canStart = computed(() => this.validationErrors().length === 0);

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

  protected onStart(): void {
    const roomId = this.chatService.currentRoomId();
    const gameType = this.selectedGame();
    const config = this.configValues();
    if (roomId && gameType) {
      this.pendingStart.set(true);
      this.gameService.createGame(roomId, gameType, config);
    }
  }

  protected onAbort(): void {
    this.gameService.cancelGame();
  }

  protected onAutostartChange(value: boolean): void {
    this.autostart.set(value);
    const roomId = this.chatService.currentRoomId();
    if (roomId) {
      this.ws.send(WS_EVENT.GAME_SETTINGS_UPDATE, {
        roomId,
        settings: {
          gameType: this.selectedGame() || null,
          presetName: this.activePreset()?.name ?? null,
          config: this.configValues(),
          autostart: value,
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
    const roomId = this.chatService.currentRoomId();
    if (!roomId) return;
    this.ws.send(WS_EVENT.GAME_SETTINGS_UPDATE, {
      roomId,
      settings: {
        gameType: this.selectedGame() || null,
        presetName: this.activePreset()?.name ?? null,
        config: this.configValues(),
        autostart: this.autostart(),
      },
    });
  }

  /** Request persisted settings from the server. */
  private loadSettings(): void {
    const roomId = this.chatService.currentRoomId();
    if (!roomId) return;
    this.ws.send(WS_EVENT.GAME_SETTINGS_LOAD, { roomId });
  }

  /** Apply settings received from the server to the form signals. */
  private applySettings(settings: RoomGameSettings): void {
    this.syncing = true;
    try {
      this.autostart.set(settings.autostart);

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
