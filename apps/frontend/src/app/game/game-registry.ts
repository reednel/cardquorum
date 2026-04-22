import type { Type } from '@angular/core';
import type { GameConfigPlugin } from '@cardquorum/engine';
import type { GameTablePlugin } from '@cardquorum/shared';
import { SheepsheadTable } from './sheepshead/sheepshead-table';
import { SheepsheadTablePlugin } from './sheepshead/sheepshead-table-plugin';

export type GameRegistry = Record<string, GameConfigPlugin>;
export type GameTableRegistry = Record<string, GameTablePlugin>;

export const GAME_TABLE_COMPONENTS: Record<string, Type<unknown>> = {
  sheepshead: SheepsheadTable,
};

export const GAME_TABLE_PLUGINS: Record<string, GameTablePlugin> = {
  sheepshead: SheepsheadTablePlugin,
};
