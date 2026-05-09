import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChildren,
} from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-segmented-toggle',
  host: { role: 'tablist', '[attr.aria-label]': 'ariaLabel()' },
  template: `
    @for (option of options(); track option.value; let i = $index) {
      <button
        #tabButton
        role="tab"
        [attr.aria-selected]="value() === option.value"
        [attr.aria-controls]="panelId()"
        [attr.tabindex]="value() === option.value ? 0 : -1"
        [class]="buttonClass(option.value)"
        (click)="select(option.value)"
        (keydown)="onKeydown($event, i)"
      >
        {{ option.label }}
      </button>
    }
  `,
  styles: `
    :host {
      display: flex;
      gap: 0.25rem;
      padding: 0.25rem;
      border-radius: var(--radius-default);
      background-color: var(--color-surface-raised);
    }

    :host-context(.dark) {
      background-color: var(--color-surface-raised-dark);
    }
  `,
})
export class SegmentedToggle {
  options = input.required<{ value: string; label: string }[]>();
  value = input.required<string>();
  panelId = input<string>('feed-panel');
  ariaLabel = input<string>('Feed mode');
  valueChange = output<string>();

  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');

  protected buttonClass(optionValue: string): string {
    const base =
      'rounded-default px-3 py-1 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary';
    if (this.value() === optionValue) {
      return `${base} bg-primary text-white dark:bg-primary-light`;
    }
    return `${base} text-text-body hover:bg-surface dark:text-text-body-dark dark:hover:bg-surface-dark`;
  }

  protected select(optionValue: string): void {
    if (optionValue !== this.value()) {
      this.valueChange.emit(optionValue);
    }
  }

  protected onKeydown(event: KeyboardEvent, index: number): void {
    const opts = this.options();
    let newIndex: number | null = null;

    switch (event.key) {
      case 'ArrowRight':
        newIndex = (index + 1) % opts.length;
        event.preventDefault();
        break;
      case 'ArrowLeft':
        newIndex = (index - 1 + opts.length) % opts.length;
        event.preventDefault();
        break;
      case 'Enter':
      case ' ':
        this.select(opts[index].value);
        event.preventDefault();
        return;
      default:
        return;
    }

    if (newIndex !== null) {
      const buttons = this.tabButtons();
      buttons[newIndex]?.nativeElement.focus();
      this.select(opts[newIndex].value);
    }
  }
}
