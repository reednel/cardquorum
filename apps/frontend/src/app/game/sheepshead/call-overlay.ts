import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

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
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-call-overlay',
  template: `
    @if (canAct()) {
      <div class="flex flex-col items-center gap-4">
        <h3 class="text-lg font-semibold text-text-heading dark:text-white">Call a Card</h3>
        <div class="grid grid-cols-2 gap-2">
          @for (opt of options; track opt.value) {
            <button
              (click)="action.emit({ type: 'call_ace', payload: { card: opt.value } })"
              class="rounded-lg border border-border-input bg-bg px-4 py-2 text-sm font-medium
                     text-text-body hover:bg-surface-raised
                     dark:border-border-input-dark dark:bg-surface-raised-dark
                     dark:text-text-heading-dark dark:hover:bg-surface-raised-dark"
            >
              {{ opt.label }}
            </button>
          }
        </div>
      </div>
    } @else {
      <p class="text-sm text-text-secondary dark:text-text-secondary-dark">Waiting for call...</p>
    }
  `,
})
export class CallOverlay {
  readonly validActions = input.required<string[]>();
  readonly action = output<{ type: string; payload: { card: string } }>();

  protected readonly options = CALL_OPTIONS;

  protected canAct(): boolean {
    return this.validActions().includes('call_ace');
  }
}
