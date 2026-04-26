import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { StatusBarConfig, StatusItem } from '@cardquorum/shared';

const BAR_CLASSES: Record<string, string> = {
  default:
    'border-border bg-surface text-text-secondary dark:border-border-dark dark:bg-surface-dark dark:text-text-secondary-dark',
  'active-turn':
    'border-primary bg-primary-surface text-primary dark:border-primary-light dark:bg-primary-surface-dark dark:text-primary-light-text',
  urgent:
    'border-danger bg-danger-surface text-danger dark:border-danger-light dark:bg-danger-surface-dark dark:text-danger-light',
};

const BADGE_CLASSES: Record<string, string> = {
  red: 'bg-[var(--color-badge-red-surface)] text-[var(--color-badge-red)] dark:bg-[var(--color-badge-red-surface-dark)] dark:text-[var(--color-badge-red-light)]',
  yellow:
    'bg-[var(--color-badge-yellow-surface)] text-[var(--color-badge-yellow)] dark:bg-[var(--color-badge-yellow-surface-dark)] dark:text-[var(--color-badge-yellow-light)]',
  green:
    'bg-[var(--color-badge-green-surface)] text-[var(--color-badge-green)] dark:bg-[var(--color-badge-green-surface-dark)] dark:text-[var(--color-badge-green-light)]',
  blue: 'bg-[var(--color-badge-blue-surface)] text-[var(--color-badge-blue)] dark:bg-[var(--color-badge-blue-surface-dark)] dark:text-[var(--color-badge-blue-light)]',
  purple:
    'bg-[var(--color-badge-purple-surface)] text-[var(--color-badge-purple)] dark:bg-[var(--color-badge-purple-surface-dark)] dark:text-[var(--color-badge-purple-light)]',
  pink: 'bg-[var(--color-badge-pink-surface)] text-[var(--color-badge-pink)] dark:bg-[var(--color-badge-pink-surface-dark)] dark:text-[var(--color-badge-pink-light)]',
  dark: 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900',
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-game-status-bar',
  template: `
    <div
      [class]="
        'flex h-(--height-panel-header) items-center justify-center gap-3 border-b px-4 text-xs ' +
        barClass()
      "
      role="status"
      aria-live="polite"
      [attr.aria-label]="ariaLabel()"
    >
      @for (item of config().items; track itemKey(item)) {
        @switch (item.type) {
          @case ('text') {
            <span
              [class.font-medium]="item.variant !== 'muted'"
              [class.opacity-75]="item.variant === 'muted'"
              >{{ item.label }}</span
            >
          }
          @case ('badge') {
            <span
              [class]="'rounded-full px-2 py-0.5 text-xs font-bold ' + badgeClass(item.color)"
              >{{ item.label }}</span
            >
          }
          @case ('separator') {
            <span class="opacity-40" aria-hidden="true">·</span>
          }
        }
      }
    </div>
  `,
})
export class GameStatusBar {
  readonly config = input.required<StatusBarConfig>();

  protected readonly barClass = computed(() => BAR_CLASSES[this.config().barVariant ?? 'default']);

  protected readonly ariaLabel = computed(() => {
    return this.config()
      .items.filter((i): i is StatusItem & { label: string } => 'label' in i)
      .map((i) => i.label)
      .join(', ');
  });

  protected itemKey(item: StatusItem): string {
    return item.type === 'separator' ? 'sep' : item.key;
  }

  protected badgeClass(color: string): string {
    return BADGE_CLASSES[color] ?? '';
  }
}
