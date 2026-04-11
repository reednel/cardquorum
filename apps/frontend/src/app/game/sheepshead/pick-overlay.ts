import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-pick-overlay',
  template: `
    @if (canAct()) {
      <div class="flex flex-col items-center gap-4">
        <h3 class="text-lg font-semibold text-text-heading dark:text-white">Pick or Pass?</h3>
        <div class="flex gap-3">
          @if (canPick()) {
            <button
              (click)="action.emit({ type: 'pick' })"
              class="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white
                     hover:bg-primary-hover"
            >
              Pick
            </button>
          }
          @if (canPass()) {
            <button
              (click)="action.emit({ type: 'pass' })"
              class="rounded-lg bg-surface-raised px-6 py-2 text-sm font-medium text-text-body
                     hover:bg-border-input
                     dark:bg-border-input-dark dark:text-text-heading-dark dark:hover:bg-surface-raised-dark"
            >
              Pass
            </button>
          }
        </div>
      </div>
    } @else {
      <p class="text-sm text-text-secondary dark:text-text-secondary-dark">
        Waiting for pick decision...
      </p>
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
