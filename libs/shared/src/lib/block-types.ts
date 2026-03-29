export interface BlockedUserResponse {
  userId: number;
  username: string;
  displayName: string | null;
  blockedAt: string;
}

export interface BlockUserRequest {
  userId: number;
}
