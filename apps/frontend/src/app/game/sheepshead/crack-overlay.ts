import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-crack-overlay',
  template: `
    <div class="flex flex-col items-center gap-4">
      <h3 class="text-lg font-semibold text-text-heading dark:text-white">Escalate?</h3>
      <div class="flex gap-3">
        @if (canCrack()) {
          <button
            (click)="action.emit({ type: 'crack' })"
            class="rounded-lg bg-danger px-5 py-2 text-sm font-medium text-white
                   hover:bg-danger-hover"
          >
            Crack
          </button>
        }
        @if (canReCrack()) {
          <button
            (click)="action.emit({ type: 're_crack' })"
            class="rounded-lg bg-danger-hover px-5 py-2 text-sm font-medium text-white
                   hover:bg-danger-dark-hover"
          >
            Re-crack
          </button>
        }
        @if (canBlitz()) {
          <button
            (click)="action.emit({ type: 'blitz', payload: { blitzType: 'black-blitz' } })"
            class="rounded-lg bg-accent-blitz px-5 py-2 text-sm font-medium text-white
                   hover:bg-accent-blitz-hover"
          >
            Blitz
          </button>
        }
        <button
          (click)="dismiss.emit()"
          class="rounded-lg bg-surface-raised px-5 py-2 text-sm font-medium text-text-body
                 hover:bg-border-input
                 dark:bg-border-input-dark dark:text-text-heading-dark dark:hover:bg-surface-raised-dark"
        >
          Dismiss
        </button>
      </div>
    </div>
  `,
})
export class CrackOverlay {
  readonly validActions = input.required<string[]>();
  readonly action = output<{ type: string; payload?: unknown }>();
  /** Local dismiss (no server event). */
  readonly dismiss = output<void>();

  protected canCrack(): boolean {
    return this.validActions().includes('crack');
  }

  protected canReCrack(): boolean {
    return this.validActions().includes('re_crack');
  }

  protected canBlitz(): boolean {
    return this.validActions().includes('blitz');
  }
}
