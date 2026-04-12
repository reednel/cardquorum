import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-pagination',
  template: `
    <nav class="flex items-center justify-center gap-3" aria-label="Pagination">
      <button
        type="button"
        data-testid="prev-btn"
        [disabled]="currentPage() === 1"
        (click)="pageChange.emit(currentPage() - 1)"
        [class]="
          'rounded-default px-3 py-1.5 text-sm font-medium ' +
          (currentPage() === 1
            ? 'bg-disabled text-disabled-text cursor-not-allowed dark:bg-surface-raised-dark dark:text-text-secondary'
            : 'bg-surface-raised text-text-heading hover:bg-surface-raised/80 dark:bg-surface-dark dark:text-text-heading-dark dark:hover:bg-surface-dark/80')
        "
        aria-label="Go to previous page"
      >
        Previous
      </button>

      <span
        data-testid="page-indicator"
        class="text-sm text-text-secondary dark:text-text-secondary-dark"
      >
        Page {{ currentPage() }} of {{ totalPages() }}
      </span>

      <button
        type="button"
        data-testid="next-btn"
        [disabled]="currentPage() === totalPages()"
        (click)="pageChange.emit(currentPage() + 1)"
        [class]="
          'rounded-default px-3 py-1.5 text-sm font-medium ' +
          (currentPage() === totalPages()
            ? 'bg-disabled text-disabled-text cursor-not-allowed dark:bg-surface-raised-dark dark:text-text-secondary'
            : 'bg-surface-raised text-text-heading hover:bg-surface-raised/80 dark:bg-surface-dark dark:text-text-heading-dark dark:hover:bg-surface-dark/80')
        "
        aria-label="Go to next page"
      >
        Next
      </button>
    </nav>
  `,
})
export class PaginationComponent {
  readonly currentPage = input.required<number>();
  readonly totalPages = input.required<number>();

  readonly pageChange = output<number>();
}
