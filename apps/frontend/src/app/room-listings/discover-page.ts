import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { of, Subject, Subscription, switchMap } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { RoomResponse } from '@cardquorum/shared';
import { AuthService } from '../auth/auth.service';
import { PaginationComponent } from './pagination';
import { RoomListingsService } from './room-listings.service';
import { RoomTableComponent } from './room-table';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-discover-page',
  imports: [RoomTableComponent, PaginationComponent],
  template: `
    <div class="mx-auto max-w-4xl px-4 py-8">
      <h1
        data-testid="discover-title"
        class="mb-6 text-2xl font-bold text-text-heading dark:text-text-heading-dark"
      >
        Discover
      </h1>

      <div class="mb-6">
        <input
          data-testid="search-input"
          type="text"
          aria-label="Search rooms by name"
          placeholder="Search rooms by name..."
          (input)="onSearchInput($event)"
          class="w-full rounded-default border border-border bg-surface px-4 py-2 text-sm
                 text-text-heading placeholder-text-secondary
                 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary
                 dark:border-border-dark dark:bg-surface-dark dark:text-text-heading-dark
                 dark:placeholder-text-secondary-dark dark:focus:border-primary-light-text
                 dark:focus:ring-primary-light-text"
        />
      </div>

      @if (searchQuery()) {
        <section data-testid="search-results">
          @if (searchLoading()) {
            <p class="py-8 text-center text-sm text-text-secondary dark:text-text-secondary-dark">
              Searching...
            </p>
          } @else if (searchError()) {
            <div class="py-8 text-center">
              <p class="text-sm text-danger dark:text-danger-light">{{ searchError() }}</p>
            </div>
          } @else if (searchResults().length === 0) {
            <p class="py-8 text-center text-sm text-text-secondary dark:text-text-secondary-dark">
              No rooms match your search.
            </p>
          } @else {
            <app-room-table
              [rooms]="searchResults()"
              [currentUserId]="currentUserId()"
              mode="discover"
              (joinRoom)="onJoinRoom($event)"
              (navigateToRoom)="onNavigateToRoom($event)"
            />
          }
        </section>
      } @else {
        <section data-testid="private-section" class="mb-8">
          <h2 class="mb-4 text-lg font-semibold text-text-heading dark:text-text-heading-dark">
            Private Rooms
          </h2>
          @if (privateLoading()) {
            <p
              data-testid="private-loading"
              class="py-4 text-center text-sm text-text-secondary dark:text-text-secondary-dark"
            >
              Loading private rooms...
            </p>
          } @else if (privateError()) {
            <div class="py-4 text-center">
              <p class="text-sm text-danger dark:text-danger-light">{{ privateError() }}</p>
              <button
                (click)="loadPrivateRooms()"
                class="mt-2 text-sm text-primary hover:underline dark:text-primary-light-text"
              >
                Try again
              </button>
            </div>
          } @else if (privateRooms().length === 0) {
            <p
              data-testid="private-empty"
              class="py-4 text-center text-sm text-text-secondary dark:text-text-secondary-dark"
            >
              No private rooms available.
            </p>
          } @else {
            <app-room-table
              [rooms]="privateRooms()"
              [currentUserId]="currentUserId()"
              mode="discover"
              (joinRoom)="onJoinRoom($event)"
              (navigateToRoom)="onNavigateToRoom($event)"
            />
          }
        </section>

        <section data-testid="public-section">
          <h2 class="mb-4 text-lg font-semibold text-text-heading dark:text-text-heading-dark">
            Public Rooms
          </h2>
          @if (publicLoading()) {
            <p
              data-testid="public-loading"
              class="py-4 text-center text-sm text-text-secondary dark:text-text-secondary-dark"
            >
              Loading public rooms...
            </p>
          } @else if (publicError()) {
            <div class="py-4 text-center">
              <p class="text-sm text-danger dark:text-danger-light">{{ publicError() }}</p>
              <button
                (click)="loadPublicRooms()"
                class="mt-2 text-sm text-primary hover:underline dark:text-primary-light-text"
              >
                Try again
              </button>
            </div>
          } @else if (publicRooms().length === 0) {
            <p
              data-testid="public-empty"
              class="py-4 text-center text-sm text-text-secondary dark:text-text-secondary-dark"
            >
              No public rooms available.
            </p>
          } @else {
            <app-room-table
              [rooms]="publicRooms()"
              [currentUserId]="currentUserId()"
              mode="discover"
              (joinRoom)="onJoinRoom($event)"
              (navigateToRoom)="onNavigateToRoom($event)"
            />
            @if (publicTotalPages() > 1) {
              <div class="mt-4">
                <app-pagination
                  [currentPage]="publicPage()"
                  [totalPages]="publicTotalPages()"
                  (pageChange)="onPublicPageChange($event)"
                />
              </div>
            }
          }
        </section>
      }
    </div>
  `,
})
export class DiscoverPage implements OnInit, OnDestroy {
  private readonly listingsService = inject(RoomListingsService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly pageSize = 20;
  private readonly search$ = new Subject<string>();
  private searchSub?: Subscription;

  protected readonly searchQuery = signal('');
  protected readonly searchResults = signal<RoomResponse[]>([]);
  protected readonly searchLoading = signal(false);
  protected readonly searchError = signal<string | null>(null);

  protected readonly privateRooms = signal<RoomResponse[]>([]);
  protected readonly privateLoading = signal(false);
  protected readonly privateError = signal<string | null>(null);

  protected readonly publicRooms = signal<RoomResponse[]>([]);
  protected readonly publicLoading = signal(false);
  protected readonly publicError = signal<string | null>(null);
  protected readonly publicPage = signal(1);
  protected readonly publicTotalPages = signal(1);

  protected readonly currentUserId = () => this.auth.user()?.userId ?? 0;

  ngOnInit(): void {
    this.searchSub = this.search$
      .pipe(
        debounceTime(300),
        switchMap((query) => {
          const trimmed = query.trim();
          this.searchQuery.set(trimmed);

          if (!trimmed) {
            this.searchResults.set([]);
            this.searchLoading.set(false);
            this.searchError.set(null);
            return of(null);
          }

          this.searchLoading.set(true);
          this.searchError.set(null);
          return this.listingsService.searchDiscover(trimmed);
        }),
      )
      .subscribe({
        next: (results) => {
          if (results !== null) {
            this.searchResults.set(results);
          }
          this.searchLoading.set(false);
        },
        error: () => {
          this.searchError.set('Search failed');
          this.searchLoading.set(false);
        },
      });

    this.loadPrivateRooms();
    this.loadPublicRooms();
  }

  ngOnDestroy(): void {
    this.searchSub?.unsubscribe();
  }

  protected onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.search$.next(value);
  }

  protected loadPrivateRooms(): void {
    this.privateLoading.set(true);
    this.privateError.set(null);

    this.listingsService.loadDiscoverPrivate().subscribe({
      next: (rooms) => {
        this.privateRooms.set(rooms);
        this.privateLoading.set(false);
      },
      error: () => {
        this.privateError.set('Failed to load private rooms');
        this.privateLoading.set(false);
      },
    });
  }

  protected loadPublicRooms(): void {
    this.publicLoading.set(true);
    this.publicError.set(null);

    this.listingsService.loadDiscoverPublic(this.publicPage(), this.pageSize).subscribe({
      next: (response) => {
        this.publicRooms.set(response.data);
        this.publicTotalPages.set(Math.ceil(response.total / this.pageSize) || 1);
        this.publicLoading.set(false);
      },
      error: () => {
        this.publicError.set('Failed to load public rooms');
        this.publicLoading.set(false);
      },
    });
  }

  protected onPublicPageChange(page: number): void {
    this.publicPage.set(page);
    this.loadPublicRooms();
  }

  protected onJoinRoom(room: RoomResponse): void {
    this.router.navigate(['/rooms', room.id]);
  }

  protected onNavigateToRoom(roomId: number): void {
    this.router.navigate(['/rooms', roomId]);
  }
}
