import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { RoomResponse } from '@cardquorum/shared';
import { AuthService } from '../auth/auth.service';
import { CreateRoomModal } from './create-room-modal';
import { RoomConfigModal } from './room-config-modal';
import { RoomService } from './room.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-room-list',
  imports: [CreateRoomModal, RoomConfigModal],
  template: `
    <div class="mx-auto max-w-4xl px-4 py-8">
      <div class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Rooms</h1>
        <button
          data-testid="create-room-btn"
          (click)="showCreate.set(true)"
          class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white
                 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          Create Room
        </button>
      </div>

      @if (roomService.loading()) {
        <p class="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading rooms...</p>
      } @else if (roomService.error()) {
        <div data-testid="error-state" class="py-8 text-center">
          <p class="text-sm text-red-600 dark:text-red-400">{{ roomService.error() }}</p>
          <button
            data-testid="retry-btn"
            (click)="roomService.loadRooms()"
            class="mt-2 text-sm text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Try again
          </button>
        </div>
      } @else if (roomService.rooms().length === 0) {
        <p
          data-testid="empty-rooms"
          class="py-8 text-center text-sm text-gray-500 dark:text-gray-400"
        >
          No rooms yet. Create one to get started.
        </p>
      } @else {
        <table class="w-full text-left text-sm">
          <thead>
            <tr
              class="border-b border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400"
            >
              <th scope="col" class="pb-2 font-medium">Name</th>
              <th scope="col" class="pb-2 font-medium">Owner</th>
              <th scope="col" class="pb-2 font-medium text-center">Members</th>
              <th scope="col" class="pb-2 font-medium">Visibility</th>
              <th scope="col" class="pb-2 font-medium"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            @for (room of roomService.rooms(); track room.id) {
              <tr data-testid="room-row" class="border-b border-gray-100 dark:border-gray-800">
                <td class="py-3 font-medium text-gray-900 dark:text-gray-100">{{ room.name }}</td>
                <td class="py-3 text-gray-600 dark:text-gray-400">{{ room.ownerDisplayName }}</td>
                <td class="py-3 text-center text-gray-600 dark:text-gray-400">
                  {{ formatMemberCount(room) }}
                </td>
                <td class="py-3">
                  <span
                    class="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                    [class]="visibilityClass(room.visibility)"
                  >
                    {{ room.visibility }}
                  </span>
                </td>
                <td class="py-3 text-right">
                  <div class="flex items-center justify-end gap-2">
                    @if (isOwner(room)) {
                      <button
                        data-testid="config-btn"
                        (click)="configRoom.set(room)"
                        class="rounded-md p-1.5 text-gray-500 hover:bg-gray-100
                               dark:text-gray-400 dark:hover:bg-gray-800"
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
                    }
                    <button
                      data-testid="join-btn"
                      (click)="joinRoom(room.id)"
                      [disabled]="isRoomFull(room)"
                      [class]="
                        'rounded-md px-3 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 ' +
                        (isRoomFull(room)
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700')
                      "
                    >
                      {{ isRoomFull(room) ? 'Full' : 'Join' }}
                    </button>
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>

    @if (showCreate()) {
      <app-create-room-modal (created)="onCreated($event)" (closed)="showCreate.set(false)" />
    }

    @if (configRoom()) {
      <app-room-config-modal
        [room]="configRoom()!"
        (updated)="onUpdated($event)"
        (deleted)="onDeleted()"
        (closed)="configRoom.set(null)"
      />
    }
  `,
})
export class RoomList implements OnInit {
  protected readonly roomService = inject(RoomService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly showCreate = signal(false);
  protected readonly configRoom = signal<RoomResponse | null>(null);

  ngOnInit(): void {
    this.roomService.loadRooms();
  }

  protected isOwner(room: RoomResponse): boolean {
    return room.ownerId === this.auth.user()?.userId;
  }

  protected isRoomFull(room: RoomResponse): boolean {
    if (room.isOnRoster) return false;
    return room.memberLimit != null && room.memberLimit > 0 && room.rosterCount >= room.memberLimit;
  }

  protected formatMemberCount(room: RoomResponse): string {
    if (room.memberLimit != null && room.memberLimit > 0) {
      return `${room.rosterCount} / ${room.memberLimit}`;
    }
    return `${room.rosterCount}`;
  }

  protected visibilityClass(visibility: string): string {
    switch (visibility) {
      case 'public':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'friends-only':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'invite-only':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
      default:
        return '';
    }
  }

  protected joinRoom(roomId: number): void {
    this.router.navigate(['/rooms', roomId]);
  }

  protected onCreated(room: RoomResponse): void {
    this.showCreate.set(false);
    this.router.navigate(['/rooms', room.id]);
  }

  protected onUpdated(room: RoomResponse): void {
    this.configRoom.set(null);
    this.roomService.loadRooms();
  }

  protected onDeleted(): void {
    this.configRoom.set(null);
    this.roomService.loadRooms();
  }
}
