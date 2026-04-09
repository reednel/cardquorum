import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-crack-overlay',
  template: `
    <div class="flex flex-col items-center gap-4">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Escalate?</h3>
      <div class="flex gap-3">
        @if (canCrack()) {
          <button
            (click)="action.emit({ type: 'crack' })"
            class="rounded-lg bg-red-600 px-5 py-2 text-sm font-medium text-white
                   hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            Crack
          </button>
        }
        @if (canReCrack()) {
          <button
            (click)="action.emit({ type: 're_crack' })"
            class="rounded-lg bg-red-700 px-5 py-2 text-sm font-medium text-white
                   hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            Re-crack
          </button>
        }
        @if (canBlitz()) {
          <button
            (click)="action.emit({ type: 'blitz', payload: { blitzType: 'black-blitz' } })"
            class="rounded-lg bg-purple-600 px-5 py-2 text-sm font-medium text-white
                   hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            Blitz
          </button>
        }
        <button
          (click)="dismiss.emit()"
          class="rounded-lg bg-gray-200 px-5 py-2 text-sm font-medium text-gray-700
                 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400
                 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500"
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
