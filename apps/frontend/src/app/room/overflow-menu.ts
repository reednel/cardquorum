import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faEllipsisVertical } from '@fortawesome/free-solid-svg-icons';

export interface OverflowAction {
  label: string;
  handler: () => void;
  variant?: 'danger';
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-overflow-menu',
  imports: [FaIconComponent],
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
  },
  template: `
    <div class="relative">
      <button
        type="button"
        data-testid="overflow-trigger"
        aria-haspopup="true"
        aria-label="More actions"
        [attr.aria-expanded]="open()"
        (click)="toggle($event)"
        class="flex items-center justify-center rounded p-1 cursor-pointer text-text-secondary hover:bg-surface-raised
               dark:text-text-secondary-dark dark:hover:bg-surface-raised-dark"
      >
        <fa-icon [icon]="faEllipsisVertical" class="text-sm" />
      </button>
      @if (open()) {
        <ul
          role="menu"
          data-testid="overflow-menu"
          class="absolute right-0 z-10 mt-1 min-w-[100px] rounded-default border
                 border-border bg-bg py-1 shadow-lg dark:border-border-dark
                 dark:bg-surface-dark"
        >
          @for (action of actions(); track action.label) {
            <li role="none">
              <button
                type="button"
                role="menuitem"
                (click)="onAction(action)"
                (keydown.enter)="onAction(action)"
                (keydown.space)="onAction(action); $event.preventDefault()"
                [class]="
                  'w-full px-3 py-1.5 text-left text-sm ' +
                  (action.variant === 'danger'
                    ? 'text-danger hover:bg-danger-surface dark:text-danger-light dark:hover:bg-danger-surface-dark'
                    : 'text-text-body hover:bg-surface-raised dark:text-text-body-dark dark:hover:bg-surface-raised-dark')
                "
              >
                {{ action.label }}
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class OverflowMenuComponent {
  readonly actions = input.required<OverflowAction[]>();

  protected readonly faEllipsisVertical = faEllipsisVertical;
  protected readonly open = signal(false);

  private readonly elRef = inject(ElementRef<HTMLElement>);

  protected toggle(event: Event): void {
    event.stopPropagation();
    this.open.update((v) => !v);
  }

  protected close(): void {
    this.open.set(false);
  }

  protected onAction(action: OverflowAction): void {
    action.handler();
    this.close();
  }

  protected onDocumentClick(event: Event): void {
    if (!this.elRef.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }
}
