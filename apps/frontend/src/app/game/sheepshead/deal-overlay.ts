import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-deal-overlay',
  template: `
    @if (canDeal()) {
      <div class="flex flex-col items-center gap-4">
        <h3 class="text-lg font-semibold text-text-heading dark:text-white">Ready to deal?</h3>
        <button
          data-testid="deal-btn"
          (click)="action.emit({ type: 'deal' })"
          class="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white
                 hover:bg-primary-hover focus:outline-none focus:ring-ring-width focus:ring-primary-light"
        >
          Deal
        </button>
      </div>
    } @else {
      <p class="text-sm text-text-secondary dark:text-text-secondary-dark">Waiting for dealer...</p>
    }
  `,
})
export class DealOverlay {
  readonly validActions = input.required<string[]>();
  readonly action = output<{ type: string }>();

  protected canDeal(): boolean {
    return this.validActions().includes('deal');
  }
}
