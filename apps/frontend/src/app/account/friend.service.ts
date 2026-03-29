import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import {
  FriendRequestBody,
  FriendRequestResponse,
  FriendshipResponse,
  UserSearchResult,
} from '@cardquorum/shared';

@Injectable({ providedIn: 'root' })
export class FriendService {
  private readonly http = inject(HttpClient);

  private readonly _friends = signal<FriendshipResponse[]>([]);
  private readonly _incomingRequests = signal<FriendRequestResponse[]>([]);
  private readonly _outgoingRequests = signal<FriendRequestResponse[]>([]);
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
    this.http.get<FriendRequestResponse[]>('/api/friends/requests/incoming').subscribe({
      next: (reqs) => this._incomingRequests.set(reqs),
    });
  }

  loadOutgoingRequests(): void {
    this.http.get<FriendRequestResponse[]>('/api/friends/requests/outgoing').subscribe({
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

  sendRequest(userId: number): Observable<FriendRequestResponse> {
    const body: FriendRequestBody = { userId };
    return this.http
      .post<FriendRequestResponse>('/api/friends/requests', body)
      .pipe(tap(() => this.loadOutgoingRequests()));
  }

  acceptRequest(requestId: number): Observable<unknown> {
    return this.http.post(`/api/friends/requests/${requestId}/accept`, {}).pipe(
      tap(() => {
        this.loadIncomingRequests();
        this.loadFriends();
      }),
    );
  }

  denyRequest(requestId: number): Observable<unknown> {
    return this.http
      .delete(`/api/friends/requests/${requestId}`)
      .pipe(tap(() => this.loadIncomingRequests()));
  }

  cancelRequest(requestId: number): Observable<unknown> {
    return this.http
      .delete(`/api/friends/requests/${requestId}`)
      .pipe(tap(() => this.loadOutgoingRequests()));
  }

  removeFriend(friendshipId: number): Observable<unknown> {
    return this.http.delete(`/api/friends/${friendshipId}`).pipe(tap(() => this.loadFriends()));
  }
}
