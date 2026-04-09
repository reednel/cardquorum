import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-pick-overlay',
  template: `
    @if (canAct()) {
      <div class="flex flex-col items-center gap-4">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Pick or Pass?</h3>
        <div class="flex gap-3">
          @if (canPick()) {
            <button
              (click)="action.emit({ type: 'pick' })"
              class="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white
                     hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              Pick
            </button>
          }
          @if (canPass()) {
            <button
              (click)="action.emit({ type: 'pass' })"
              class="rounded-lg bg-gray-200 px-6 py-2 text-sm font-medium text-gray-700
                     hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400
                     dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500"
            >
              Pass
            </button>
          }
        </div>
      </div>
    } @else {
      <p class="text-sm text-gray-500 dark:text-gray-400">Waiting for pick decision...</p>
    }
  `,
})
export class PickOverlay {
  readonly validActions = input.required<string[]>();
  readonly action = output<{ type: string }>();

  protected canAct(): boolean {
    const actions = this.validActions();
    return actions.includes('pick') || actions.includes('pass');
  }

  protected canPick(): boolean {
    return this.validActions().includes('pick');
  }

  protected canPass(): boolean {
    return this.validActions().includes('pass');
  }
}
