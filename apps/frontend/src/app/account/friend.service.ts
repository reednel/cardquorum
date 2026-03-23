import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { FriendRequestBody, FriendshipResponse, UserSearchResult } from '@cardquorum/shared';

@Injectable({ providedIn: 'root' })
export class FriendService {
  private readonly http = inject(HttpClient);

  private readonly _friends = signal<FriendshipResponse[]>([]);
  private readonly _incomingRequests = signal<FriendshipResponse[]>([]);
  private readonly _outgoingRequests = signal<FriendshipResponse[]>([]);
  private readonly _searchResults = signal<UserSearchResult[]>([]);

  readonly friends = this._friends.asReadonly();
  readonly incomingRequests = this._incomingRequests.asReadonly();
  readonly outgoingRequests = this._outgoingRequests.asReadonly();
  readonly searchResults = this._searchResults.asReadonly();

  loadFriends(): void {
    this.http.get<FriendshipResponse[]>('/api/friends').subscribe({
      next: (friends) => this._friends.set(friends),
    });
  }

  loadIncomingRequests(): void {
    this.http.get<FriendshipResponse[]>('/api/friends/requests/incoming').subscribe({
      next: (reqs) => this._incomingRequests.set(reqs),
    });
  }

  loadOutgoingRequests(): void {
    this.http.get<FriendshipResponse[]>('/api/friends/requests/outgoing').subscribe({
      next: (reqs) => this._outgoingRequests.set(reqs),
    });
  }

  searchUsers(query: string): void {
    if (!query) {
      this._searchResults.set([]);
      return;
    }
    this.http.get<UserSearchResult[]>('/api/users/search', { params: { q: query } }).subscribe({
      next: (results) => this._searchResults.set(results),
    });
  }

  sendRequest(userId: number): Observable<FriendshipResponse> {
    const body: FriendRequestBody = { userId };
    return this.http
      .post<FriendshipResponse>('/api/friends/requests', body)
      .pipe(tap(() => this.loadOutgoingRequests()));
  }

  acceptRequest(friendshipId: number): Observable<unknown> {
    return this.http.post(`/api/friends/requests/${friendshipId}/accept`, {}).pipe(
      tap(() => {
        this.loadIncomingRequests();
        this.loadFriends();
      }),
    );
  }

  denyRequest(friendshipId: number): Observable<unknown> {
    return this.http
      .delete(`/api/friends/requests/${friendshipId}`)
      .pipe(tap(() => this.loadIncomingRequests()));
  }

  cancelRequest(friendshipId: number): Observable<unknown> {
    return this.http
      .delete(`/api/friends/requests/${friendshipId}`)
      .pipe(tap(() => this.loadOutgoingRequests()));
  }

  removeFriend(friendshipId: number): Observable<unknown> {
    return this.http.delete(`/api/friends/${friendshipId}`).pipe(tap(() => this.loadFriends()));
  }
}
