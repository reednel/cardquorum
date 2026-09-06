import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
  type OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faCalendar } from '@fortawesome/free-solid-svg-icons';
import { catchError, debounceTime, EMPTY, Subject, switchMap, timeout } from 'rxjs';
import { type GameReportPlugin } from '@cardquorum/shared';
import { FlatpickrDirective } from '../shared/flatpickr.directive';
import { MultiselectDropdownComponent } from '../shared/multiselect-dropdown';
import { GAME_REPORT_PLUGINS } from './report-registry';
import { ReportService } from './report.service';

type ShellState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; payload: unknown }
  | { status: 'error'; message: string }
  | { status: 'empty' };

const STORAGE_KEY = 'report-filters';

interface StoredFilters {
  gameType: string;
  variants: string[];
  startDate: string;
  endDate: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-report-shell',
  imports: [NgComponentOutlet, MultiselectDropdownComponent, FlatpickrDirective, FaIconComponent],
  template: `
    <div class="space-y-4">
      <!-- Filter Controls -->
      <div class="space-y-3" role="group" aria-label="Report filters">
        <!-- Row 1: Game Type + Variants -->
        <div class="flex flex-wrap gap-3">
          <!-- Game Type Selector -->
          <label class="flex flex-col gap-1">
            <span class="text-xs font-medium text-text-secondary dark:text-text-secondary-dark">
              Game
            </span>
            <select
              data-testid="game-type-selector"
              (change)="onGameTypeChange($any($event.target).value)"
              class="rounded-default border border-border-input px-3 py-1.5 text-sm text-text-heading
                     dark:border-border-input-dark dark:bg-surface-dark dark:text-text-heading-dark"
              aria-label="Select game type"
            >
              <option value="" [selected]="selectedGameType() === ''">Select a game…</option>
              @for (entry of gameTypeEntries; track entry.key) {
                <option [value]="entry.key" [selected]="entry.key === selectedGameType()">
                  {{ entry.plugin.label }}
                </option>
              }
            </select>
          </label>

          <!-- Variant Multiselect (shown when game type selected) -->
          @if (selectedPlugin()) {
            <div class="flex flex-col gap-1">
              <span class="text-xs font-medium text-text-secondary dark:text-text-secondary-dark">
                Variants
              </span>
              <app-multiselect-dropdown
                [options]="selectedPlugin()!.variants"
                [selected]="selectedVariants()"
                label="Select variants"
                (selectionChange)="onVariantsChange($event)"
              />
            </div>
          }
        </div>

        <!-- Row 2: Date Pickers (shown when game type selected) -->
        @if (selectedPlugin()) {
          <div class="flex flex-wrap gap-3">
            <div class="flex flex-col gap-1">
              <span class="text-xs font-medium text-text-secondary dark:text-text-secondary-dark">
                Start Date
              </span>
              <div class="relative w-[140px]">
                <input
                  appFlatpickr
                  data-testid="start-date"
                  [value]="startDate()"
                  (dateChange)="onStartDateChange($event)"
                  placeholder="Start date"
                  class="w-full rounded-default border border-border-input py-1.5 pl-3 pr-8 text-sm text-text-heading
                         dark:border-border-input-dark dark:bg-surface-dark dark:text-text-heading-dark"
                  aria-label="Start date"
                />
                <fa-icon
                  [icon]="faCalendar"
                  class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary dark:text-text-secondary-dark"
                  size="xs"
                />
              </div>
            </div>

            <div class="flex flex-col gap-1">
              <span class="text-xs font-medium text-text-secondary dark:text-text-secondary-dark">
                End Date
              </span>
              <div class="relative w-[140px]">
                <input
                  appFlatpickr
                  data-testid="end-date"
                  [value]="endDate()"
                  (dateChange)="onEndDateChange($event)"
                  placeholder="End date"
                  class="w-full rounded-default border border-border-input py-1.5 pl-3 pr-8 text-sm text-text-heading
                         dark:border-border-input-dark dark:bg-surface-dark dark:text-text-heading-dark"
                  aria-label="End date"
                />
                <fa-icon
                  [icon]="faCalendar"
                  class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary dark:text-text-secondary-dark"
                  size="xs"
                />
              </div>
            </div>
          </div>
        }
      </div>

      <!-- Date Validation Error -->
      @if (dateError()) {
        <p data-testid="date-error" class="text-sm text-danger dark:text-danger-dark" role="alert">
          {{ dateError() }}
        </p>
      }

      <!-- State-based content area -->
      @switch (state().status) {
        @case ('idle') {
          <p
            data-testid="idle-state"
            class="py-8 text-center text-sm text-text-secondary dark:text-text-secondary-dark"
          >
            Select a game type to view your report.
          </p>
        }
        @case ('loading') {
          <div
            data-testid="loading-state"
            class="py-8 text-center"
            role="status"
            aria-live="polite"
          >
            <p class="text-sm text-text-secondary dark:text-text-secondary-dark">Loading report…</p>
          </div>
        }
        @case ('error') {
          <div data-testid="error-state" class="py-8 text-center" role="alert">
            <p class="text-sm text-danger dark:text-danger-dark">
              {{ $any(state()).message }}
            </p>
            <button
              data-testid="retry-btn"
              (click)="retry()"
              class="mt-2 text-sm text-primary hover:text-primary-hover
                     dark:text-primary-dark dark:hover:text-primary-dark-hover"
            >
              Try again
            </button>
          </div>
        }
        @case ('empty') {
          <p
            data-testid="empty-state"
            class="py-8 text-center text-sm text-text-secondary dark:text-text-secondary-dark"
          >
            No data available for the selected filters.
          </p>
        }
        @case ('success') {
          <div data-testid="report-content">
            @if (reportComponent()) {
              <ng-container *ngComponentOutlet="reportComponent(); inputs: reportInputs()" />
            }
          </div>
        }
      }
    </div>
  `,
})
export class ReportShellComponent implements OnInit {
  private readonly reportService = inject(ReportService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly faCalendar = faCalendar;

  /** All registered game report plugins. */
  protected readonly gameTypeEntries = Object.entries(GAME_REPORT_PLUGINS).map(([key, plugin]) => ({
    key,
    plugin,
  }));

  /** Filter state signals (initialized from localStorage). */
  private readonly stored = this.loadFilters();
  protected readonly selectedGameType = signal(this.stored.gameType);
  protected readonly selectedVariants = signal<string[]>(this.stored.variants);
  protected readonly startDate = signal(this.stored.startDate);
  protected readonly endDate = signal(this.stored.endDate);

  /** Shell state. */
  protected readonly state = signal<ShellState>({ status: 'idle' });

  /** Subject for filter changes to debounce. */
  private readonly filterChange$ = new Subject<void>();

  /** The currently selected plugin. */
  protected readonly selectedPlugin = computed<GameReportPlugin | null>(() => {
    const gt = this.selectedGameType();
    return gt ? (GAME_REPORT_PLUGINS[gt] ?? null) : null;
  });

  /** Date validation error. */
  protected readonly dateError = computed<string | null>(() => {
    const start = this.startDate();
    const end = this.endDate();
    if (start && end && start > end) {
      return 'Start date must be before end date.';
    }
    return null;
  });

  /** The component type to render for the current game plugin. */
  protected readonly reportComponent = computed(() => {
    const plugin = this.selectedPlugin();
    if (!plugin) return null;
    if (this.state().status !== 'success') return null;
    return plugin.getReportComponent();
  });

  /** Inputs to pass to the dynamically rendered report component. */
  protected readonly reportInputs = computed(() => {
    const s = this.state();
    if (s.status !== 'success') return {};
    return { payload: s.payload };
  });

  ngOnInit(): void {
    this.filterChange$
      .pipe(
        debounceTime(300),
        switchMap(() => {
          const gameType = this.selectedGameType();
          if (!gameType) {
            this.state.set({ status: 'idle' });
            return EMPTY;
          }

          if (this.dateError()) {
            return EMPTY;
          }

          this.state.set({ status: 'loading' });

          const filters = {
            variants: this.selectedVariants().length > 0 ? this.selectedVariants() : undefined,
            startDate: this.startDate() || undefined,
            endDate: this.endDate() || undefined,
          };

          return this.reportService.getReport(gameType, filters).pipe(
            timeout(30000),
            catchError((err) => {
              const message =
                err?.name === 'TimeoutError'
                  ? 'Request timed out. Please try again.'
                  : 'Failed to load report. Please try again.';
              this.state.set({ status: 'error', message });
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((payload) => {
        if (payload && typeof payload === 'object' && 'totalSessions' in payload) {
          const total = (payload as { totalSessions: number }).totalSessions;
          if (total === 0) {
            this.state.set({ status: 'empty' });
          } else {
            this.state.set({ status: 'success', payload });
          }
        } else {
          // Fallback: treat any truthy payload as success
          this.state.set({ status: 'success', payload });
        }
      });

    // If filters were restored from localStorage, trigger an initial fetch
    if (this.selectedGameType()) {
      this.emitFilterChange();
    }
  }

  protected onGameTypeChange(value: string): void {
    this.selectedGameType.set(value);
    this.selectedVariants.set([]);
    this.emitFilterChange();
  }

  protected onVariantsChange(variants: string[]): void {
    this.selectedVariants.set(variants);
    this.emitFilterChange();
  }

  protected onStartDateChange(value: string): void {
    this.startDate.set(value);
    this.emitFilterChange();
  }

  protected onEndDateChange(value: string): void {
    this.endDate.set(value);
    this.emitFilterChange();
  }

  protected retry(): void {
    this.emitFilterChange();
  }

  private emitFilterChange(): void {
    this.saveFilters();
    this.filterChange$.next();
  }

  private saveFilters(): void {
    const data: StoredFilters = {
      gameType: this.selectedGameType(),
      variants: this.selectedVariants(),
      startDate: this.startDate(),
      endDate: this.endDate(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Storage full or unavailable — silently ignore
    }
  }

  private loadFilters(): StoredFilters {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          gameType: typeof parsed.gameType === 'string' ? parsed.gameType : '',
          variants: Array.isArray(parsed.variants) ? parsed.variants : [],
          startDate: typeof parsed.startDate === 'string' ? parsed.startDate : '',
          endDate: typeof parsed.endDate === 'string' ? parsed.endDate : '',
        };
      }
    } catch {
      // Corrupted data — ignore
    }
    return { gameType: '', variants: [], startDate: '', endDate: '' };
  }
}
