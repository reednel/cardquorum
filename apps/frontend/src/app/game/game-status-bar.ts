import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { StatusBarConfig, StatusItem } from '@cardquorum/shared';

const BAR_CLASSES: Record<string, string> = {
  default:
    'border-border bg-surface text-text-secondary dark:border-border-dark dark:bg-surface-dark dark:text-text-secondary-dark',
  'active-turn':
    'border-primary bg-primary-surface text-primary dark:border-primary-dark dark:bg-primary-surface-dark dark:text-primary-dark',
  'active-turn-pulse':
    'status-bar-pulse border-primary text-primary dark:border-primary-dark dark:text-primary-dark [--status-pulse-bg:var(--color-primary-surface)] dark:[--status-pulse-bg:var(--color-primary-surface-dark)]',
  urgent:
    'border-danger bg-danger-surface text-danger dark:border-danger-dark dark:bg-danger-surface-dark dark:text-danger-dark',
};

const BADGE_CLASSES: Record<string, string> = {
  red: 'bg-badge-red-surface text-badge-red dark:bg-badge-red-surface-dark dark:text-badge-red-dark',
  yellow:
    'bg-badge-yellow-surface text-badge-yellow dark:bg-badge-yellow-surface-dark dark:text-badge-yellow-dark',
  green:
    'bg-badge-green-surface text-badge-green dark:bg-badge-green-surface-dark dark:text-badge-green-dark',
  blue: 'bg-badge-blue-surface text-badge-blue dark:bg-badge-blue-surface-dark dark:text-badge-blue-dark',
  purple:
    'bg-badge-purple-surface text-badge-purple dark:bg-badge-purple-surface-dark dark:text-badge-purple-dark',
  pink: 'bg-badge-pink-surface text-badge-pink dark:bg-badge-pink-surface-dark dark:text-badge-pink-dark',
  dark: 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900',
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-game-status-bar',
  styles: `
    .status-bar-pulse {
      animation: status-pulse 1.8s ease-in-out infinite;
    }
    @keyframes status-pulse {
      0%,
      100% {
        background-color: var(--status-pulse-bg);
      }
      50% {
        background-color: transparent;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .status-bar-pulse {
        animation: none;
      }
    }
  `,
  template: `
    <div
      [class]="
        'flex h-(--height-panel-header) select-none items-center justify-center gap-3 border-b px-4 text-xs ' +
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
