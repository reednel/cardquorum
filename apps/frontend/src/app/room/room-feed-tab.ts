import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import { GameLogBroadcast } from '@cardquorum/shared';
import { ChatService } from '../chat/chat.service';
import { FormatTimePipe } from '../chat/format-time.pipe';
import { GameLogEntryComponent } from '../chat/game-log-entry';
import { deriveFeedItems, FeedItem, FeedMode, isBoundaryEntry } from '../chat/game-log-utils';
import { GameLogService } from '../chat/game-log.service';
import { SessionBoundaryMarker } from '../chat/session-boundary-marker';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-room-feed-tab',
  imports: [
    FormsModule,
    FaIconComponent,
    GameLogEntryComponent,
    SessionBoundaryMarker,
    FormatTimePipe,
  ],
  template: `
    <div id="feed-panel" role="tabpanel" aria-label="Feed" class="flex min-h-0 flex-1 flex-col">
      <div
        #feedContainer
        role="log"
        aria-live="polite"
        class="flex-1 overflow-y-auto"
        (scroll)="onScroll()"
      >
        @if (gameLogService.loading()) {
          <div
            class="flex justify-center p-2"
            aria-label="Loading older game log entries"
            data-testid="loading-indicator"
          >
            <span class="text-xs text-text-secondary">Loading...</span>
          </div>
        }
        <div class="flex flex-col gap-2 p-4">
          @for (item of feedItems(); track trackFeedItem(item)) {
            @if (item.type === 'date-divider') {
              <div
                class="flex items-center gap-2 py-1 text-xs text-text-secondary dark:text-text-secondary-dark"
                aria-label="Date separator"
              >
                <hr class="flex-1 border-border dark:border-border-dark" />
                <span>{{ item.label }}</span>
                <hr class="flex-1 border-border dark:border-border-dark" />
              </div>
            } @else if (item.type === 'game-log' && isBoundaryEntry($any(item.data))) {
              <app-session-boundary-marker [entry]="$any(item.data)" />
            } @else if (item.type === 'game-log') {
              <app-game-log-entry [entry]="$any(item.data)" />
            } @else {
              <div class="text-sm">
                <p class="wrap-break-word text-text-body dark:text-text-body-dark">
                  {{ $any(item.data).content }}
                </p>
                <div class="flex items-center text-xs">
                  <span class="font-semibold text-primary dark:text-primary-dark-text">
                    {{ $any(item.data).senderDisplayName }}
                  </span>
                  <span class="ml-auto text-text-secondary dark:text-text-secondary-dark">{{
                    item.timestamp | formatTime
                  }}</span>
                </div>
              </div>
            }
          } @empty {
            <p class="py-8 text-center text-sm text-text-secondary">No messages yet. Say hello!</p>
          }
        </div>
      </div>

      @if (showInput()) {
        <form
          (ngSubmit)="send()"
          class="shrink-0 border-t border-border p-3 dark:border-border-dark"
        >
          <label class="sr-only" for="message-input">Message</label>
          <div class="relative">
            <input
              id="message-input"
              type="text"
              [(ngModel)]="messageText"
              name="message"
              autocomplete="off"
              placeholder="Type a message..."
              class="w-full rounded-default border border-border-input bg-bg py-2 pl-3 pr-9 text-sm
                     dark:border-border-input-dark dark:bg-surface-dark
                     dark:text-white"
            />
            <button
              type="submit"
              [disabled]="!messageText()"
              title="Send"
              class="absolute inset-y-0 right-0 flex items-center pr-3 text-text-secondary
                     transition-colors hover:text-text-body disabled:opacity-30
                     disabled:hover:text-text-secondary dark:text-text-secondary-dark
                     dark:hover:text-text-heading-dark dark:disabled:hover:text-text-secondary-dark"
            >
              <fa-icon [icon]="faPaperPlane" aria-hidden="true" />
              <span class="sr-only">Send</span>
            </button>
          </div>
        </form>
      }
    </div>
  `,
})
export class RoomFeedTab {
  readonly chatService = inject(ChatService);
  readonly gameLogService = inject(GameLogService);

  protected readonly faPaperPlane = faPaperPlane;
  protected readonly feedContainer = viewChild<ElementRef<HTMLElement>>('feedContainer');

  readonly feedMode = input<FeedMode>('all');
  protected readonly messageText = signal('');

  private isAtBottom = true;
  private previousItemCount = 0;

  protected readonly feedItems = computed<FeedItem[]>(() =>
    deriveFeedItems(this.feedMode(), this.chatService.messages(), this.gameLogService.entries()),
  );

  protected readonly showInput = computed(() => this.feedMode() !== 'game-log');

  protected readonly isBoundaryEntry = (entry: GameLogBroadcast): boolean => isBoundaryEntry(entry);

  constructor() {
    effect(() => {
      const items = this.feedItems();
      const container = this.feedContainer()?.nativeElement;
      if (!container) return;

      const currentCount = items.length;
      const prevCount = this.previousItemCount;
      this.previousItemCount = currentCount;

      if (currentCount > prevCount && prevCount > 0) {
        // Items were prepended (history load) — preserve scroll position
        const isPrepend = currentCount - prevCount > 1 && this.gameLogService.loading() === false;
        if (isPrepend && !this.isAtBottom) {
          const previousScrollHeight = container.scrollHeight;
          setTimeout(() => {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop += newScrollHeight - previousScrollHeight;
          }, 0);
          return;
        }
      }

      // Auto-scroll to bottom on new items when already at bottom
      if (this.isAtBottom) {
        setTimeout(() => {
          container.scrollTop = container.scrollHeight;
        }, 0);
      }
    });
  }

  protected onScroll(): void {
    const container = this.feedContainer()?.nativeElement;
    if (!container) return;

    // Track whether user is at the bottom
    const threshold = 10;
    this.isAtBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;

    // Detect scroll to top (within 10px threshold) — trigger history load
    if (container.scrollTop <= threshold) {
      const mode = this.feedMode();
      if (
        (mode === 'game-log' || mode === 'all') &&
        !this.gameLogService.loading() &&
        !this.gameLogService.exhausted()
      ) {
        this.gameLogService.requestHistory();
      }
    }
  }

  protected trackFeedItem(item: FeedItem): string {
    return `${item.type}:${item.timestamp}`;
  }

  protected send(): void {
    const text = this.messageText().trim();
    if (!text) return;
    this.chatService.sendMessage(text);
    this.messageText.set('');
  }
}
