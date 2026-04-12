import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RoomResponse } from '@cardquorum/shared';
import { DetailsPopoverComponent } from './details-popover';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-room-table',
  imports: [DetailsPopoverComponent],
  template: `
    <table class="w-full text-left text-sm">
      <thead>
        <tr
          class="border-b border-border text-text-secondary dark:border-border-dark dark:text-text-secondary-dark"
        >
          <th scope="col" class="pb-2 font-medium">Name</th>
          <th scope="col" class="pb-2 font-medium">Game</th>
          <th scope="col" class="pb-2 font-medium">Status</th>
          <th scope="col" class="pb-2 font-medium text-center">Members</th>
          <th scope="col" class="pb-2 font-medium text-center">Details</th>
          <th scope="col" class="pb-2 font-medium"><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        @for (room of rooms(); track room.id) {
          <tr data-testid="room-row" class="border-b border-border dark:border-border-dark">
            <td class="py-3 font-medium text-text-heading dark:text-text-heading-dark">
              <button
                type="button"
                class="text-primary hover:underline dark:text-primary-light-text"
                (click)="navigateToRoom.emit(room.id)"
              >
                {{ room.name }}
              </button>
            </td>
            <td class="py-3 text-text-secondary dark:text-text-secondary-dark">
              {{ room.gameType ?? '—' }}
            </td>
            <td class="py-3 text-text-secondary dark:text-text-secondary-dark">
              {{ room.gameInProgress ? 'In Progress' : 'Idle' }}
            </td>
            <td class="py-3 text-center text-text-secondary dark:text-text-secondary-dark">
              {{ formatMemberCount(room) }}
            </td>
            <td class="py-3 text-center">
              <app-details-popover [room]="room" />
            </td>
            <td class="py-3 text-right">
              @if (mode() === 'memberships') {
                @if (room.ownerId === currentUserId()) {
                  <button
                    type="button"
                    data-testid="config-btn"
                    (click)="configRoom.emit(room)"
                    class="rounded-default p-1.5 text-text-secondary hover:bg-surface-raised
                           dark:text-text-secondary-dark dark:hover:bg-surface-dark"
                    aria-label="Configure room"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </button>
                } @else {
                  <button
                    type="button"
                    data-testid="leave-btn"
                    (click)="leaveRoom.emit(room)"
                    class="rounded-default px-3 py-1 text-xs font-medium text-danger
                           hover:bg-danger-surface dark:text-danger-light
                           dark:hover:bg-danger-surface-dark"
                  >
                    Leave
                  </button>
                }
              } @else {
                <button
                  type="button"
                  [attr.data-testid]="isRoomFull(room) ? null : 'join-btn'"
                  [disabled]="isRoomFull(room)"
                  (click)="joinRoom.emit(room)"
                  [class]="
                    'rounded-default px-3 py-1 text-xs font-medium ' +
                    (isRoomFull(room)
                      ? 'bg-disabled text-disabled-text cursor-not-allowed dark:bg-surface-raised-dark dark:text-text-secondary'
                      : 'bg-primary text-white hover:bg-primary-hover')
                  "
                >
                  {{ isRoomFull(room) ? 'Full' : 'Join' }}
                </button>
              }
            </td>
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class RoomTableComponent {
  readonly rooms = input.required<RoomResponse[]>();
  readonly currentUserId = input.required<number>();
  readonly mode = input.required<'memberships' | 'discover'>();

  readonly joinRoom = output<RoomResponse>();
  readonly leaveRoom = output<RoomResponse>();
  readonly configRoom = output<RoomResponse>();
  readonly navigateToRoom = output<number>();

  protected formatMemberCount(room: RoomResponse): string {
    if (room.memberLimit != null && room.memberLimit > 0) {
      return `${room.rosterCount} / ${room.memberLimit}`;
    }
    return `${room.rosterCount}`;
  }

  protected isRoomFull(room: RoomResponse): boolean {
    return (
      room.memberLimit != null &&
      room.memberLimit > 0 &&
      room.rosterCount >= room.memberLimit &&
      !room.isOnRoster
    );
  }
}
