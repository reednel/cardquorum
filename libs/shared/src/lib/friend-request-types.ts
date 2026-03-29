import { UserSearchResult } from './user-types';

export interface FriendRequestBody {
  userId: number;
}

export interface FriendRequestResponse {
  requestId: number;
  user: UserSearchResult;
  createdAt: string;
}
