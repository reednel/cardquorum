export type AuthStrategy = 'basic' | 'oidc';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  displayName: string;
  password: string;
}

export interface StrategiesResponse {
  strategies: AuthStrategy[];
}
