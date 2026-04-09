import type { GameConfigPlugin } from '@cardquorum/engine';
import type { GameTablePlugin } from '@cardquorum/shared';

export type GameRegistry = Record<string, GameConfigPlugin>;
export type GameTableRegistry = Record<string, GameTablePlugin>;
