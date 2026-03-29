import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { BlockedUserResponse, BlockUserRequest } from '@cardquorum/shared';
import { FriendService } from './friend.service';

@Injectable({ providedIn: 'root' })
export class BlockService {
  private readonly http = inject(HttpClient);
  private readonly friendService = inject(FriendService);

  private readonly _blockedUsers = signal<BlockedUserResponse[]>([]);
  readonly blockedUsers = this._blockedUsers.asReadonly();

  loadBlockedUsers(): void {
    this.http.get<BlockedUserResponse[]>('/api/blocks').subscribe({
      next: (users) => this._blockedUsers.set(users),
    });
  }

  blockUser(userId: number): Observable<BlockedUserResponse> {
    const body: BlockUserRequest = { userId };
    return this.http.post<BlockedUserResponse>('/api/blocks', body).pipe(
      tap(() => {
        this.loadBlockedUsers();
        this.friendService.loadFriends();
        this.friendService.loadIncomingRequests();
        this.friendService.loadOutgoingRequests();
      }),
    );
  }

  unblockUser(userId: number): Observable<unknown> {
    return this.http.delete(`/api/blocks/${userId}`).pipe(
      tap(() => {
        this.loadBlockedUsers();
        this.friendService.loadFriends();
        this.friendService.loadIncomingRequests();
        this.friendService.loadOutgoingRequests();
      }),
    );
  }
}
