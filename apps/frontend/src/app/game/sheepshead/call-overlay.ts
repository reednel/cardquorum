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
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Call a Card</h3>
        <div class="grid grid-cols-2 gap-2">
          @for (opt of options; track opt.value) {
            <button
              (click)="action.emit({ type: 'call_ace', payload: { card: opt.value } })"
              class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium
                     text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2
                     focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700
                     dark:text-gray-200 dark:hover:bg-gray-600"
            >
              {{ opt.label }}
            </button>
          }
        </div>
      </div>
    } @else {
      <p class="text-sm text-gray-500 dark:text-gray-400">Waiting for call...</p>
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
