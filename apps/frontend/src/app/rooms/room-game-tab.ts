import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
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
        class="mb-4 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm
               focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500
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
          class="mb-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm
                 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500
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
          <p class="mb-4 text-xs text-gray-500 dark:text-gray-400">{{ preset.description }}</p>
        }
      }

      <!-- Config fields -->
      @if (editableFields().length > 0) {
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
                    class="h-4 w-4 rounded border-gray-300 text-indigo-600
                           focus:ring-indigo-500 dark:border-gray-600"
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
                    class="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm
                           focus:border-indigo-500 focus:outline-none focus:ring-1
                           focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800
                           dark:text-white"
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
                    class="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm
                           focus:border-indigo-500 focus:outline-none focus:ring-1
                           focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800
                           dark:text-white"
                  />
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

  private readonly allFields = computed<ConfigField[]>(() => {
    const game = GAMES[this.selectedGame()];
    return game ? fieldsFromSchema(game.configSchema) : [];
  });

  protected readonly editableFields = computed<ConfigField[]>(() => {
    const preset = this.activePreset();
    if (!preset) return [];
    const fixedKeys = new Set(Object.keys(preset.fixed));
    return this.allFields().filter((f) => !fixedKeys.has(f.key));
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
}
