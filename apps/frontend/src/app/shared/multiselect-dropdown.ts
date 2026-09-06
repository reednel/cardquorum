import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  type OnInit,
} from '@angular/core';

export interface MultiselectOption {
  key: string;
  label: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-multiselect-dropdown',
  template: `
    <div class="relative">
      <!-- Trigger button -->
      <button
        type="button"
        data-testid="multiselect-trigger"
        (click)="toggleOpen()"
        [attr.aria-expanded]="open()"
        aria-haspopup="listbox"
        class="relative box-border h-[31px] min-w-[180px] rounded-default border border-border-input
               py-0 pl-3 pr-6 text-left text-sm text-text-heading
               dark:border-border-input-dark dark:bg-surface-dark dark:text-text-heading-dark"
      >
        <span class="block truncate">{{ triggerLabel() }}</span>
        <svg
          class="pointer-events-none absolute right-0.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-heading dark:text-text-heading-dark"
          [class.rotate-180]="open()"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clip-rule="evenodd"
          />
        </svg>
      </button>

      <!-- Dropdown panel -->
      @if (open()) {
        <div
          data-testid="multiselect-panel"
          role="listbox"
          aria-multiselectable="true"
          [attr.aria-label]="label()"
          class="absolute left-0 z-20 mt-1 max-h-60 w-full min-w-[200px] overflow-y-auto
                 rounded-default border border-border bg-bg py-1 shadow-lg
                 dark:border-border-dark dark:bg-surface-dark"
        >
          <!-- Select All / Clear -->
          <div
            class="flex items-center justify-between border-b border-border px-3 py-1.5 dark:border-border-dark"
          >
            <button
              type="button"
              data-testid="multiselect-select-all"
              (click)="selectAll()"
              class="text-xs text-primary hover:text-primary-hover dark:text-primary-dark dark:hover:text-primary-dark-hover"
            >
              Select all
            </button>
            <button
              type="button"
              data-testid="multiselect-clear"
              (click)="clearAll()"
              class="text-xs text-primary hover:text-primary-hover dark:text-primary-dark dark:hover:text-primary-dark-hover"
            >
              Clear
            </button>
          </div>

          <!-- Options -->
          @for (option of options(); track option.key) {
            <label
              role="option"
              [attr.aria-selected]="isSelected(option.key)"
              class="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-text-heading
                     hover:bg-hover-overlay dark:text-text-heading-dark dark:hover:bg-hover-overlay-dark"
            >
              <input
                type="checkbox"
                [checked]="isSelected(option.key)"
                (change)="toggle(option.key, $any($event.target).checked)"
                class="rounded-sm"
              />
              <span class="truncate">{{ option.label }}</span>
            </label>
          }
        </div>
      }
    </div>
  `,
})
export class MultiselectDropdownComponent implements OnInit {
  readonly options = input.required<MultiselectOption[]>();
  readonly selected = input.required<string[]>();
  readonly label = input<string>('Select options');

  readonly selectionChange = output<string[]>();

  private readonly elRef = inject(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly open = signal(false);

  protected readonly triggerLabel = computed(() => {
    const sel = this.selected();
    const opts = this.options();
    if (sel.length === 0) return 'All';
    if (sel.length === opts.length) return 'All';
    if (sel.length === 1) {
      const match = opts.find((o) => o.key === sel[0]);
      return match?.label ?? '1 selected';
    }
    return `${sel.length} selected`;
  });

  ngOnInit(): void {
    const onDocClick = (e: MouseEvent) => {
      if (this.open() && !this.elRef.nativeElement.contains(e.target as Node)) {
        this.open.set(false);
      }
    };

    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.open()) {
        this.open.set(false);
      }
    };

    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKeydown);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKeydown);
    });
  }

  protected toggleOpen(): void {
    this.open.update((v) => !v);
  }

  protected isSelected(key: string): boolean {
    return this.selected().includes(key);
  }

  protected toggle(key: string, checked: boolean): void {
    const current = this.selected();
    const next = checked ? [...current, key] : current.filter((k) => k !== key);
    this.selectionChange.emit(next);
  }

  protected selectAll(): void {
    this.selectionChange.emit(this.options().map((o) => o.key));
  }

  protected clearAll(): void {
    this.selectionChange.emit([]);
  }
}
