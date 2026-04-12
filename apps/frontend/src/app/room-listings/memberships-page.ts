import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { RoomResponse } from '@cardquorum/shared';
import { AuthService } from '../auth/auth.service';
import { CreateRoomModal } from './create-room-modal';
import { RoomConfigModal } from './room-config-modal';
import { RoomListingsService } from './room-listings.service';
import { RoomTableComponent } from './room-table';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-memberships-page',
  imports: [RoomTableComponent, CreateRoomModal, RoomConfigModal],
  template: `
    <div class="mx-auto max-w-4xl px-4 py-8">
      <div class="mb-6 flex items-center justify-between">
        <h1
          data-testid="memberships-title"
          class="text-2xl font-bold text-text-heading dark:text-text-heading-dark"
        >
          Memberships
        </h1>
        <button
          data-testid="create-room-btn"
          (click)="showCreate.set(true)"
          class="rounded-default bg-primary px-4 py-2 text-sm font-semibold text-white
                 hover:bg-primary-hover"
        >
          Create Room
        </button>
      </div>

      @if (loading()) {
        <p
          data-testid="loading-state"
          class="py-8 text-center text-sm text-text-secondary dark:text-text-secondary-dark"
        >
          Loading rooms...
        </p>
      } @else if (error()) {
        <div data-testid="error-state" class="py-8 text-center">
          <p class="text-sm text-danger dark:text-danger-light">{{ error() }}</p>
          <button
            data-testid="retry-btn"
            (click)="loadMemberships()"
            class="mt-2 text-sm text-primary hover:underline dark:text-primary-light-text"
          >
            Try again
          </button>
        </div>
      } @else if (rooms().length === 0) {
        <p
          data-testid="empty-state"
          class="py-8 text-center text-sm text-text-secondary dark:text-text-secondary-dark"
        >
          No rooms yet. Create one to get started.
        </p>
      } @else {
        <app-room-table
          [rooms]="rooms()"
          [currentUserId]="currentUserId()"
          mode="memberships"
          (navigateToRoom)="onNavigateToRoom($event)"
          (configRoom)="onConfigRoom($event)"
          (leaveRoom)="onLeaveRoom($event)"
        />
      }
    </div>

    @if (showCreate()) {
      <app-create-room-modal (created)="onCreated($event)" (closed)="showCreate.set(false)" />
    }

    @if (configRoom()) {
      <app-room-config-modal
        [room]="configRoom()!"
        (updated)="onUpdated()"
        (deleted)="onDeleted()"
        (closed)="configRoom.set(null)"
      />
    }
  `,
})
export class MembershipsPage implements OnInit {
  private readonly listingsService = inject(RoomListingsService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly rooms = signal<RoomResponse[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showCreate = signal(false);
  protected readonly configRoom = signal<RoomResponse | null>(null);

  protected readonly currentUserId = () => this.auth.user()?.userId ?? 0;

  ngOnInit(): void {
    this.loadMemberships();
  }

  protected loadMemberships(): void {
    this.loading.set(true);
    this.error.set(null);

    this.listingsService.loadMemberships().subscribe({
      next: (rooms) => {
        this.rooms.set(rooms);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load memberships');
        this.loading.set(false);
      },
    });
  }

  protected onNavigateToRoom(roomId: number): void {
    this.router.navigate(['/rooms', roomId]);
  }

  protected onConfigRoom(room: RoomResponse): void {
    this.configRoom.set(room);
  }

  protected onLeaveRoom(room: RoomResponse): void {
    this.listingsService.leaveRoom(room.id).subscribe({
      next: () => this.loadMemberships(),
      error: () => this.error.set('Failed to leave room'),
    });
  }

  protected onCreated(room: RoomResponse): void {
    this.showCreate.set(false);
    this.router.navigate(['/rooms', room.id]);
  }

  protected onUpdated(): void {
    this.configRoom.set(null);
    this.loadMemberships();
  }

  protected onDeleted(): void {
    this.configRoom.set(null);
    this.loadMemberships();
  }
}
