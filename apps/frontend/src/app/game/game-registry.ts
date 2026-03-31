import { ZodObject } from 'zod';

export interface GamePreset {
  label: string;
  description: string;
  fixed: Record<string, unknown>;
  defaults: Record<string, unknown>;
}

export interface GameRegistryEntry {
  label: string;
  configSchema: ZodObject<any>;
  presets: readonly GamePreset[];
}

export type GameRegistry = Record<string, GameRegistryEntry>;
