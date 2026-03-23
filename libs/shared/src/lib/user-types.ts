export interface UserProfile {
  userId: number;
  username: string;
  displayName: string;
  email: string | null;
  createdAt: string;
}

export interface UserSearchResult {
  userId: number;
  username: string;
  displayName: string;
}

export interface UpdateDisplayNameRequest {
  displayName: string;
}
