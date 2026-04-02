import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ConfigFieldDef,
  FieldRegistry,
  GenericConfigPreset,
  SelectFieldDef,
} from '@cardquorum/engine';
import { SheepsheadConfigPlugin } from '@cardquorum/sheepshead';
import { GameRegistry } from '../game/game-registry';

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
                    [title]="field.description"
                    class="mb-1 block text-sm text-gray-700 dark:text-gray-300"
                  >
                    {{ field.displayName }}
                  </label>
                  <select
                    [id]="'field-' + field.key"
                    [ngModel]="configValues()[field.key]"
                    (ngModelChange)="onFieldChange(field.key, coerce($event))"
                    [disabled]="!isOwner()"
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

  protected readonly presets = computed<readonly GenericConfigPreset[]>(() => {
    const game = GAMES[this.selectedGame()];
    return game?.presets ?? [];
  });

  protected readonly activePreset = computed<GenericConfigPreset | null>(() => {
    const idx = this.selectedPresetIndex();
    const list = this.presets();
    return idx >= 0 && idx < list.length ? list[idx] : null;
  });

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
  }

  protected onPresetChange(index: number | string): void {
    const idx = typeof index === 'string' ? parseInt(index, 10) : index;
    this.selectedPresetIndex.set(idx);
    const preset = this.presets()[idx];
    if (preset) {
      const values: Record<string, unknown> = {
        name: preset.name,
        playerCount: preset.playerCount,
      };
      for (const [key, field] of Object.entries(preset.fields)) {
        values[key] = (field as ConfigFieldDef<unknown>).value;
      }
      this.configValues.set(values);
    }
  }

  protected onFieldChange(key: string, value: unknown): void {
    this.configValues.update((v) => ({ ...v, [key]: value }));
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
}
