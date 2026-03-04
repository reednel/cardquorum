import { UserIdentity } from '@cardquorum/shared';

export const AUTH_STRATEGY_TOKEN = Symbol('AUTH_STRATEGY_TOKEN');

export interface AuthStrategyService {
  validateToken(token: string): Promise<UserIdentity | null>;
}
