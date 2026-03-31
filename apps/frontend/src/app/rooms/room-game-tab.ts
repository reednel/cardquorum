import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CONFIG_PRESETS, SheepsheadConfigSchema } from '@cardquorum/sheepshead';
import { ConfigField, fieldsFromSchema } from '../game/config-fields';
import { GamePreset, GameRegistry } from '../game/game-registry';

const GAMES: GameRegistry = {
  sheepshead: {
    label: 'Sheepshead',
    configSchema: SheepsheadConfigSchema,
    presets: CONFIG_PRESETS,
  },
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-room-game-tab',
  imports: [FormsModule],
  template: `
    <div id="game-panel" role="tabpanel" aria-label="Game" class="flex-1 overflow-y-auto p-4">
      <!-- Game type -->
      <label
        for="game-type"
        class="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500
               dark:text-gray-400"
      >
        Game
      </label>
      <select
        id="game-type"
        [ngModel]="selectedGame()"
        (ngModelChange)="onGameChange($event)"
        [disabled]="!isOwner()"
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
          [disabled]="!isOwner()"
          class="mb-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm
                 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500
                 disabled:cursor-not-allowed disabled:opacity-60
                 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        >
          <option [value]="-1">— Select a variant —</option>
          @for (preset of presets(); track $index) {
            <option [value]="$index">
              {{ preset.label }}
              @if (preset.fixed['playerCount']) {
                ({{ preset.fixed['playerCount'] }}p)
              }
            </option>
          }
        </select>
        @if (activePreset(); as preset) {
          <p class="mb-3 text-xs text-gray-500 dark:text-gray-400">{{ preset.description }}</p>
        }
      }

      <!-- Fixed fields (read-only context) -->
      @if (visibleFixedFields().length > 0) {
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
            @for (entry of visibleFixedFields(); track entry.key) {
              <div class="flex items-center justify-between text-sm">
                <dt class="text-gray-600 dark:text-gray-400">{{ labelFor(entry.key) }}</dt>
                <dd class="font-medium text-gray-800 dark:text-gray-200">
                  {{ displayValue(entry.value) }}
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
            @switch (field.type) {
              @case ('boolean') {
                <label
                  class="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300"
                >
                  <span>{{ labelFor(field.key) }}</span>
                  <input
                    type="checkbox"
                    [ngModel]="configValues()[field.key]"
                    (ngModelChange)="onFieldChange(field.key, $event)"
                    [disabled]="!isOwner()"
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
                    class="mb-1 block text-sm text-gray-700 dark:text-gray-300"
                  >
                    {{ labelFor(field.key) }}
                  </label>
                  <select
                    [id]="'field-' + field.key"
                    [ngModel]="configValues()[field.key]"
                    (ngModelChange)="onFieldChange(field.key, coerce(field, $event))"
                    [disabled]="!isOwner()"
                    class="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm
                           focus:border-indigo-500 focus:outline-none focus:ring-1
                           focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60
                           dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  >
                    @for (opt of field.options; track opt.value) {
                      <option [ngValue]="opt.value">{{ opt.label }}</option>
                    }
                  </select>
                </div>
              }
              @case ('number') {
                <div>
                  <label
                    [attr.for]="'field-' + field.key"
                    class="mb-1 block text-sm text-gray-700 dark:text-gray-300"
                  >
                    {{ labelFor(field.key) }}
                  </label>
                  <input
                    [id]="'field-' + field.key"
                    type="number"
                    [ngModel]="configValues()[field.key]"
                    (ngModelChange)="onFieldChange(field.key, $event)"
                    [disabled]="!isOwner()"
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
                    class="mb-1 block text-sm text-gray-700 dark:text-gray-300"
                  >
                    {{ labelFor(field.key) }}
                  </label>
                  <div class="flex items-center gap-2">
                    <input
                      [id]="'field-' + field.key"
                      type="number"
                      min="1"
                      step="1"
                      [ngModel]="configValues()[field.key]"
                      (ngModelChange)="onFieldChange(field.key, $event)"
                      [disabled]="!isOwner() || configValues()[field.key] === null"
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
                        [disabled]="!isOwner()"
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
export class RoomGameTab {
  readonly isOwner = input(false);

  protected readonly gameEntries = Object.entries(GAMES).map(([key, entry]) => ({
    key,
    label: entry.label,
  }));

  protected readonly selectedGame = signal('');
  protected readonly selectedPresetIndex = signal(-1);
  protected readonly configValues = signal<Record<string, unknown>>({});

  protected readonly presets = computed<readonly GamePreset[]>(() => {
    const game = GAMES[this.selectedGame()];
    return game?.presets ?? [];
  });

  protected readonly activePreset = computed<GamePreset | null>(() => {
    const idx = this.selectedPresetIndex();
    const list = this.presets();
    return idx >= 0 && idx < list.length ? list[idx] : null;
  });

  /** Fixed fields with non-null values — shown as read-only context. */
  protected readonly visibleFixedFields = computed(() => {
    const preset = this.activePreset();
    if (!preset) return [];
    return Object.entries(preset.fixed)
      .filter(([, v]) => v != null)
      .map(([key, value]) => ({ key, value }));
  });

  private readonly allFields = computed<ConfigField[]>(() => {
    const game = GAMES[this.selectedGame()];
    return game ? fieldsFromSchema(game.configSchema) : [];
  });

  /** Editable fields: everything in preset.defaults (null is a valid default, e.g. "no limit"). */
  protected readonly editableFields = computed<ConfigField[]>(() => {
    const preset = this.activePreset();
    if (!preset) return [];
    const defaultKeys = new Set(Object.keys(preset.defaults));
    return this.allFields().filter((f) => defaultKeys.has(f.key));
  });

  protected onGameChange(gameType: string): void {
    this.selectedGame.set(gameType);
    this.selectedPresetIndex.set(-1);
    this.configValues.set({});
  }

  protected onPresetChange(index: number | string): void {
    const idx = typeof index === 'string' ? parseInt(index, 10) : index;
    this.selectedPresetIndex.set(idx);
    const preset = this.presets()[idx];
    if (preset) {
      this.configValues.set({ ...preset.fixed, ...preset.defaults });
    }
  }

  protected onFieldChange(key: string, value: unknown): void {
    this.configValues.update((v) => ({ ...v, [key]: value }));
  }

  protected coerce(field: ConfigField, value: unknown): unknown {
    if (value === 'null') return null;
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (field.type === 'number' && typeof value === 'string') return Number(value);
    return value;
  }

  protected labelFor(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (c) => c.toUpperCase())
      .trim();
  }

  protected displayValue(value: unknown): string {
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (value === null) return '—';
    if (typeof value === 'string') {
      return value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return String(value);
  }
}
