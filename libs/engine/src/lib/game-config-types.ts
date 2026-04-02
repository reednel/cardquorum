import type { z } from 'zod';

// --- Field definition types ---

export type FieldMode = 'hidden' | 'locked' | 'editable';

export interface ConfigFieldDef<T> {
  readonly value: T;
  readonly mode: FieldMode;
}

export interface SelectFieldDef<T> extends ConfigFieldDef<T> {
  readonly options: T[];
}

// --- Field metadata types ---

export interface FieldMetadata {
  readonly displayName: string;
  readonly description: string;
  readonly renderType: 'boolean' | 'select' | 'number' | 'nullable-number' | 'hidden-array';
}

export type FieldRegistry<K extends string = string> = Readonly<Record<K, FieldMetadata>>;

// --- Preset & plugin types ---

export interface GenericConfigPreset {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly playerCount: number;
  readonly fields: Readonly<Record<string, ConfigFieldDef<unknown>>>;
}

export interface GameConfigPlugin<K extends string = string> {
  readonly label: string;
  readonly fieldRegistry: FieldRegistry<K>;
  readonly presets: readonly GenericConfigPreset[];
  readonly configSchema: z.ZodType;
}
