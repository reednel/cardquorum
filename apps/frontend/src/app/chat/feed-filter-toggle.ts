import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faComments, faScroll } from '@fortawesome/free-solid-svg-icons';
import { type FeedMode } from './game-log-utils';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-feed-filter-toggle',
  imports: [FaIconComponent],
  host: { '[attr.aria-label]': '"Feed filters"' },
  template: `
    <button
      type="button"
      [attr.aria-pressed]="chatActive()"
      aria-label="Show chat messages"
      title="Chat"
      data-testid="filter-chat"
      [class]="iconClass(chatActive())"
      (click)="toggleChat()"
    >
      <fa-icon [icon]="faComments" />
    </button>
    <button
      type="button"
      [attr.aria-pressed]="logActive()"
      aria-label="Show game log"
      title="Game log"
      data-testid="filter-log"
      [class]="iconClass(logActive())"
      (click)="toggleLog()"
    >
      <fa-icon [icon]="faScroll" />
    </button>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
  `,
})
export class FeedFilterToggle {
  readonly mode = input.required<FeedMode>();
  readonly modeChange = output<FeedMode>();

  protected readonly faComments = faComments;
  protected readonly faScroll = faScroll;

  protected chatActive(): boolean {
    const m = this.mode();
    return m === 'chat' || m === 'all';
  }

  protected logActive(): boolean {
    const m = this.mode();
    return m === 'game-log' || m === 'all';
  }

  protected toggleChat(): void {
    const chat = this.chatActive();
    const log = this.logActive();
    if (chat && !log) return;
    this.modeChange.emit(this.resolveMode(!chat, log));
  }

  protected toggleLog(): void {
    const chat = this.chatActive();
    const log = this.logActive();
    if (log && !chat) return;
    this.modeChange.emit(this.resolveMode(chat, !log));
  }

  protected iconClass(active: boolean): string {
    const base =
      'cursor-pointer border-none bg-transparent p-0 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary';
    if (active) {
      return `${base} text-primary dark:text-primary-dark`;
    }
    return `${base} text-text-secondary hover:text-text-body dark:text-text-secondary-dark dark:hover:text-text-heading-dark`;
  }

  private resolveMode(chat: boolean, log: boolean): FeedMode {
    if (chat && log) return 'all';
    if (chat) return 'chat';
    if (log) return 'game-log';
    return 'all';
  }
}
