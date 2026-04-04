import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';

export interface OverflowAction {
  label: string;
  handler: () => void;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-overflow-menu',
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
        [attr.aria-expanded]="open()"
        (click)="toggle($event)"
        class="rounded px-1.5 py-0.5 text-sm text-gray-500 hover:bg-gray-100
               dark:text-gray-400 dark:hover:bg-gray-700"
      >
        …
      </button>
      @if (open()) {
        <ul
          role="menu"
          data-testid="overflow-menu"
          class="absolute right-0 z-10 mt-1 min-w-[100px] rounded-md border
                 border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700
                 dark:bg-gray-800"
        >
          @for (action of actions(); track action.label) {
            <li role="none">
              <button
                type="button"
                role="menuitem"
                (click)="onAction(action)"
                (keydown.enter)="onAction(action)"
                (keydown.space)="onAction(action); $event.preventDefault()"
                class="w-full px-3 py-1.5 text-left text-sm text-gray-700
                       hover:bg-gray-100 dark:text-gray-300
                       dark:hover:bg-gray-700"
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
