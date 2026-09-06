import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faGear } from '@fortawesome/free-solid-svg-icons';
import { type RoomResponse } from '@cardquorum/shared';
import { DetailsPopoverComponent } from './details-popover';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-room-table',
  imports: [DetailsPopoverComponent, FaIconComponent],
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
              @if (mode() === 'memberships') {
                <button
                  type="button"
                  class="text-primary hover:text-primary-hover dark:text-primary-dark dark:hover:text-primary-dark-hover"
                  (click)="navigateToRoom.emit(room.id)"
                >
                  {{ room.name }}
                </button>
              } @else {
                {{ room.name }}
              }
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
                    class="rounded-default p-1.5 text-text-secondary hover:bg-hover-overlay
                           dark:text-text-secondary-dark dark:hover:bg-hover-overlay-dark"
                    aria-label="Configure room"
                  >
                    <fa-icon [icon]="faGear" class="text-lg" aria-hidden="true" />
                  </button>
                } @else {
                  <button
                    type="button"
                    data-testid="leave-btn"
                    (click)="leaveRoom.emit(room)"
                    class="rounded-default px-3 py-1 text-xs font-medium text-danger
                           hover:bg-danger-surface dark:text-danger-dark
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
                      ? 'bg-disabled text-text-secondary dark:bg-surface-raised-dark dark:text-text-secondary'
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

  protected readonly faGear = faGear;

  protected formatMemberCount(room: RoomResponse): string {
    if (room.memberLimit != null && room.memberLimit > 0) {
      return `${room.rosterCount} / ${room.memberLimit}`;
    }
    return `${room.rosterCount}`;
  }

  protected isRoomFull(room: RoomResponse): boolean {
    const effectiveLimit =
      room.memberLimit != null && room.memberLimit > 0 ? room.memberLimit : 128;
    return room.rosterCount >= effectiveLimit && !room.isOnRoster;
  }
}
