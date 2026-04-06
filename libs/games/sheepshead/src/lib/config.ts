/**
 * Sheepshead game configuration: schemas, types, field registry, presets, and plugin.
 *
 * Everything needed to understand and work with game config lives in this file.
 */

import { z } from 'zod';
import type {
  ConfigFieldDef,
  FieldRegistry,
  GameConfigPlugin,
  SelectFieldDef,
} from '@cardquorum/engine';
import type { CardName } from './types';

// ---------------------------------------------------------------------------
// Zod schemas (config validation)
// ---------------------------------------------------------------------------

export const NoPickSchema = z.enum([
  'forced-pick',
  'leaster',
  'moster',
  'mittler',
  'schneidster',
  'doubler',
  'schwanzer',
]);

export const PickerRuleSchema = z.enum(['autonomous', 'left-of-dealer']).nullable();

export const PartnerRuleSchema = z
  .enum(['called-ace', 'jd', 'jc', 'qc-qs', 'qs-jc', 'first-trick', 'qc-7d', 'left-of-picker'])
  .nullable();

export const SheepsheadConfigSchema = z.object({
  name: z.string().regex(/^\S+$/),
  playerCount: z.union([
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
    z.literal(8),
  ]),
  handSize: z.number().int().positive(),
  blindSize: z.number().int().nonnegative(),
  pickerRule: PickerRuleSchema,
  partnerRule: PartnerRuleSchema,
  noPick: NoPickSchema.nullable(),
  cracking: z.boolean(),
  blitzing: z.boolean(),
  doubleOnTheBump: z.boolean(),
  partnerOffTheHook: z.boolean(),
  noAceFaceTrump: z.boolean(),
  multiplicityLimit: z.number().int().positive().nullable(),
  callOwnAce: z.boolean().nullable(),
  cardsRemoved: z
    .array(
      z.enum([
        '7c',
        '8c',
        '9c',
        'xc',
        'jc',
        'qc',
        'kc',
        'ac',
        '7s',
        '8s',
        '9s',
        'xs',
        'js',
        'qs',
        'ks',
        'as',
        '7h',
        '8h',
        '9h',
        'xh',
        'jh',
        'qh',
        'kh',
        'ah',
        '7d',
        '8d',
        '9d',
        'xd',
        'jd',
        'qd',
        'kd',
        'ad',
      ]),
    )
    .optional(),
});

// ---------------------------------------------------------------------------
// Inferred types from schemas
// ---------------------------------------------------------------------------

export type SheepsheadConfig = z.infer<typeof SheepsheadConfigSchema>;
export type NoPick = z.infer<typeof NoPickSchema>;
export type PickerRule = z.infer<typeof PickerRuleSchema>;
export type PartnerRule = z.infer<typeof PartnerRuleSchema>;

// ---------------------------------------------------------------------------
// Config field key union & preset interface
// ---------------------------------------------------------------------------

/** Union of all 13 Sheepshead config field keys. */
export type SheepsheadFieldKey =
  | 'handSize'
  | 'blindSize'
  | 'pickerRule'
  | 'partnerRule'
  | 'noPick'
  | 'cracking'
  | 'blitzing'
  | 'doubleOnTheBump'
  | 'partnerOffTheHook'
  | 'noAceFaceTrump'
  | 'multiplicityLimit'
  | 'callOwnAce'
  | 'cardsRemoved';

export interface ConfigPreset {
  name: string;
  label: string;
  description: string;
  allowedPlayerCounts: number[];
  fields: {
    handSize: ConfigFieldDef<number>;
    blindSize: ConfigFieldDef<number>;
    pickerRule: SelectFieldDef<PickerRule>;
    partnerRule: SelectFieldDef<PartnerRule>;
    noPick: SelectFieldDef<NoPick | null>;
    cracking: ConfigFieldDef<boolean>;
    blitzing: ConfigFieldDef<boolean>;
    doubleOnTheBump: ConfigFieldDef<boolean>;
    partnerOffTheHook: ConfigFieldDef<boolean>;
    noAceFaceTrump: ConfigFieldDef<boolean>;
    multiplicityLimit: ConfigFieldDef<number | null>;
    callOwnAce: ConfigFieldDef<boolean | null>;
    cardsRemoved: ConfigFieldDef<CardName[]>;
  };
}

// ---------------------------------------------------------------------------
// Field registry (UI metadata)
// ---------------------------------------------------------------------------

export const FIELD_REGISTRY: FieldRegistry<SheepsheadFieldKey> = {
  handSize: {
    displayName: 'Hand Size',
    description: 'Number of cards dealt to each player.',
    renderType: 'number',
  },
  blindSize: {
    displayName: 'Blind Size',
    description: 'Number of cards in the blind.',
    renderType: 'number',
  },
  pickerRule: {
    displayName: 'Picker Rule',
    description: 'How the picker is determined.',
    renderType: 'select',
  },
  partnerRule: {
    displayName: 'Partner Rule',
    description: 'How the partner is determined.',
    renderType: 'select',
  },
  noPick: {
    displayName: 'No-Pick Rule',
    description: 'What happens when all players pass.',
    renderType: 'select',
  },
  cracking: {
    displayName: 'Cracking/Recracking',
    description:
      'Allow opposition to double the stakes before play begins, and the picking team to double them again.',
    renderType: 'boolean',
  },
  blitzing: {
    displayName: 'Blitzing',
    description:
      'Allow a player with both black or red queens to double the stakes before play begins.',
    renderType: 'boolean',
  },
  doubleOnTheBump: {
    displayName: 'Double on the Bump',
    description: 'Double the stakes when the picking team loses.',
    renderType: 'boolean',
  },
  partnerOffTheHook: {
    displayName: 'Partner off the Hook',
    description: 'Partner does not lose points if the picking team takes no tricks.',
    renderType: 'boolean',
  },
  noAceFaceTrump: {
    displayName: 'No Ace, No Face, No Trump',
    description:
      'When someone is dealt no aces, no faces cards, and no trump, a redeal is triggered.',
    renderType: 'boolean',
  },
  multiplicityLimit: {
    displayName: 'Multiplicity Limit',
    description: 'Maximum score multiplier allowed (null = no limit).',
    renderType: 'nullable-number',
  },
  callOwnAce: {
    displayName: 'May Call Own Ace',
    description: 'Allow the picker to sneakily call an ace they hold or buried.',
    renderType: 'boolean',
  },
  cardsRemoved: {
    displayName: 'Cards Removed',
    description: 'Cards removed from the deck for this variant.',
    renderType: 'hidden-array',
  },
};

// ---------------------------------------------------------------------------
// Config presets
// ---------------------------------------------------------------------------

const ALL_NO_PICK_OPTIONS: (NoPick | null)[] = [
  'leaster',
  'moster',
  'mittler',
  'schneidster',
  'doubler',
  'schwanzer',
  'forced-pick',
];

export const CONFIG_PRESETS: readonly ConfigPreset[] = [
  // 2 players
  {
    name: 'two-handed',
    label: 'Two-Handed (2p)',
    description: 'No teams, no picking.',
    allowedPlayerCounts: [2],
    fields: {
      handSize: { value: 14, mode: 'locked' },
      blindSize: { value: 4, mode: 'locked' },
      pickerRule: { value: null, mode: 'hidden', options: [null] },
      partnerRule: { value: null, mode: 'hidden', options: [null] },
      noPick: { value: null, mode: 'hidden', options: [null] },
      cracking: { value: false, mode: 'editable' },
      blitzing: { value: false, mode: 'editable' },
      doubleOnTheBump: { value: false, mode: 'hidden' },
      partnerOffTheHook: { value: false, mode: 'editable' },
      noAceFaceTrump: { value: false, mode: 'editable' },
      multiplicityLimit: { value: null, mode: 'editable' },
      callOwnAce: { value: null, mode: 'hidden' },
      cardsRemoved: { value: [], mode: 'hidden' },
    },
  },
  // 3 players
  {
    name: 'three-handed',
    label: 'Three-Handed (3p)',
    description: 'Picker plays alone against two opponents.',
    allowedPlayerCounts: [3],
    fields: {
      handSize: { value: 10, mode: 'locked' },
      blindSize: { value: 2, mode: 'locked' },
      pickerRule: { value: 'autonomous', mode: 'hidden', options: ['autonomous'] },
      partnerRule: { value: null, mode: 'hidden', options: [null] },
      noPick: { value: 'leaster', mode: 'editable', options: ALL_NO_PICK_OPTIONS },
      cracking: { value: false, mode: 'editable' },
      blitzing: { value: false, mode: 'editable' },
      doubleOnTheBump: { value: false, mode: 'editable' },
      partnerOffTheHook: { value: false, mode: 'editable' },
      noAceFaceTrump: { value: false, mode: 'editable' },
      multiplicityLimit: { value: null, mode: 'editable' },
      callOwnAce: { value: null, mode: 'hidden' },
      cardsRemoved: { value: [], mode: 'hidden' },
    },
  },
  // 4 players
  {
    name: 'black-queens',
    label: 'Black Queens (4p)',
    description: 'Holders of the two black Queens are partners. Player with both goes alone.',
    allowedPlayerCounts: [4],
    fields: {
      handSize: { value: 8, mode: 'locked' },
      blindSize: { value: 0, mode: 'locked' },
      pickerRule: { value: null, mode: 'hidden', options: [null] },
      partnerRule: { value: 'qc-qs', mode: 'locked', options: ['qc-qs'] },
      noPick: { value: null, mode: 'hidden', options: [null] },
      cracking: { value: false, mode: 'editable' },
      blitzing: { value: false, mode: 'editable' },
      doubleOnTheBump: { value: true, mode: 'hidden' },
      partnerOffTheHook: { value: false, mode: 'editable' },
      noAceFaceTrump: { value: false, mode: 'editable' },
      multiplicityLimit: { value: null, mode: 'editable' },
      callOwnAce: { value: null, mode: 'hidden' },
      cardsRemoved: { value: [], mode: 'hidden' },
    },
  },
  {
    name: 'queen-and-7',
    label: 'Queen & 7 (4p)',
    description:
      'Queen of Clubs and 7 of Diamonds holders are partners. Player with both goes alone.',
    allowedPlayerCounts: [4],
    fields: {
      handSize: { value: 8, mode: 'locked' },
      blindSize: { value: 0, mode: 'locked' },
      pickerRule: { value: null, mode: 'hidden', options: [null] },
      partnerRule: { value: 'qc-7d', mode: 'locked', options: ['qc-7d'] },
      noPick: { value: null, mode: 'hidden', options: [null] },
      cracking: { value: false, mode: 'editable' },
      blitzing: { value: false, mode: 'editable' },
      doubleOnTheBump: { value: false, mode: 'editable' },
      partnerOffTheHook: { value: false, mode: 'editable' },
      noAceFaceTrump: { value: false, mode: 'editable' },
      multiplicityLimit: { value: null, mode: 'editable' },
      callOwnAce: { value: null, mode: 'hidden' },
      cardsRemoved: { value: [], mode: 'hidden' },
    },
  },
  {
    name: 'picker-alone',
    label: 'Picker Alone (4p)',
    description: 'Picker plays alone against three opponents.',
    allowedPlayerCounts: [4],
    fields: {
      handSize: { value: 7, mode: 'locked' },
      blindSize: { value: 4, mode: 'locked' },
      pickerRule: { value: 'autonomous', mode: 'hidden', options: ['autonomous'] },
      partnerRule: { value: null, mode: 'hidden', options: [null] },
      noPick: { value: 'leaster', mode: 'editable', options: ALL_NO_PICK_OPTIONS },
      cracking: { value: false, mode: 'editable' },
      blitzing: { value: false, mode: 'editable' },
      doubleOnTheBump: { value: true, mode: 'editable' },
      partnerOffTheHook: { value: false, mode: 'editable' },
      noAceFaceTrump: { value: false, mode: 'editable' },
      multiplicityLimit: { value: null, mode: 'editable' },
      callOwnAce: { value: null, mode: 'hidden' },
      cardsRemoved: { value: [], mode: 'hidden' },
    },
  },
  {
    name: 'called-ace',
    label: 'Called Ace (4p)',
    description: 'Black 7s removed. Picker calls a fail ace for partner.',
    allowedPlayerCounts: [4],
    fields: {
      handSize: { value: 7, mode: 'locked' },
      blindSize: { value: 2, mode: 'locked' },
      pickerRule: { value: 'autonomous', mode: 'hidden', options: ['autonomous'] },
      partnerRule: { value: 'called-ace', mode: 'locked', options: ['called-ace'] },
      noPick: { value: 'leaster', mode: 'editable', options: ALL_NO_PICK_OPTIONS },
      cracking: { value: false, mode: 'editable' },
      blitzing: { value: false, mode: 'editable' },
      doubleOnTheBump: { value: true, mode: 'editable' },
      partnerOffTheHook: { value: false, mode: 'editable' },
      noAceFaceTrump: { value: false, mode: 'editable' },
      multiplicityLimit: { value: null, mode: 'editable' },
      callOwnAce: { value: false, mode: 'editable' },
      cardsRemoved: { value: ['7c', '7s'], mode: 'hidden' },
    },
  },
  // 5 players
  {
    name: 'called-ace',
    label: 'Called Ace (5p)',
    description: 'Picker calls a fail ace for partner.',
    allowedPlayerCounts: [5],
    fields: {
      handSize: { value: 6, mode: 'locked' },
      blindSize: { value: 2, mode: 'locked' },
      pickerRule: { value: 'autonomous', mode: 'hidden', options: ['autonomous'] },
      partnerRule: { value: 'called-ace', mode: 'locked', options: ['called-ace'] },
      noPick: { value: 'leaster', mode: 'editable', options: ALL_NO_PICK_OPTIONS },
      cracking: { value: false, mode: 'editable' },
      blitzing: { value: false, mode: 'editable' },
      doubleOnTheBump: { value: false, mode: 'editable' },
      partnerOffTheHook: { value: false, mode: 'editable' },
      noAceFaceTrump: { value: false, mode: 'editable' },
      multiplicityLimit: { value: null, mode: 'editable' },
      callOwnAce: { value: false, mode: 'editable' },
      cardsRemoved: { value: [], mode: 'hidden' },
    },
  },
  {
    name: 'jack-of-diamonds',
    label: 'Jack of Diamonds (5p)',
    description: 'Holder of the Jack of Diamonds is the partner.',
    allowedPlayerCounts: [5],
    fields: {
      handSize: { value: 6, mode: 'locked' },
      blindSize: { value: 2, mode: 'locked' },
      pickerRule: { value: 'autonomous', mode: 'hidden', options: ['autonomous'] },
      partnerRule: { value: 'jd', mode: 'locked', options: ['jd'] },
      noPick: { value: 'leaster', mode: 'editable', options: ALL_NO_PICK_OPTIONS },
      cracking: { value: false, mode: 'editable' },
      blitzing: { value: false, mode: 'editable' },
      doubleOnTheBump: { value: false, mode: 'editable' },
      partnerOffTheHook: { value: false, mode: 'editable' },
      noAceFaceTrump: { value: false, mode: 'editable' },
      multiplicityLimit: { value: null, mode: 'editable' },
      callOwnAce: { value: null, mode: 'hidden' },
      cardsRemoved: { value: [], mode: 'hidden' },
    },
  },
  {
    name: 'queen-and-jack',
    label: 'Queen & Jack (5p)',
    description:
      'Black 7s removed. Queen of Spades and Jack of Clubs holders are partners. No blind.',
    allowedPlayerCounts: [5],
    fields: {
      handSize: { value: 6, mode: 'locked' },
      blindSize: { value: 0, mode: 'locked' },
      pickerRule: { value: null, mode: 'hidden', options: [null] },
      partnerRule: { value: 'qs-jc', mode: 'locked', options: ['qs-jc'] },
      noPick: { value: null, mode: 'hidden', options: [null] },
      cracking: { value: false, mode: 'editable' },
      blitzing: { value: false, mode: 'editable' },
      doubleOnTheBump: { value: false, mode: 'editable' },
      partnerOffTheHook: { value: false, mode: 'editable' },
      noAceFaceTrump: { value: false, mode: 'editable' },
      multiplicityLimit: { value: null, mode: 'editable' },
      callOwnAce: { value: null, mode: 'hidden' },
      cardsRemoved: { value: ['7c', '7s'], mode: 'hidden' },
    },
  },
  {
    name: 'first-trick',
    label: 'First Trick (5p)',
    description: 'Winner of the first trick is the partner.',
    allowedPlayerCounts: [5],
    fields: {
      handSize: { value: 6, mode: 'locked' },
      blindSize: { value: 2, mode: 'locked' },
      pickerRule: { value: 'autonomous', mode: 'hidden', options: ['autonomous'] },
      partnerRule: { value: 'first-trick', mode: 'locked', options: ['first-trick'] },
      noPick: { value: 'leaster', mode: 'editable', options: ALL_NO_PICK_OPTIONS },
      cracking: { value: false, mode: 'editable' },
      blitzing: { value: false, mode: 'editable' },
      doubleOnTheBump: { value: false, mode: 'editable' },
      partnerOffTheHook: { value: false, mode: 'editable' },
      noAceFaceTrump: { value: false, mode: 'editable' },
      multiplicityLimit: { value: null, mode: 'editable' },
      callOwnAce: { value: null, mode: 'hidden' },
      cardsRemoved: { value: [], mode: 'hidden' },
    },
  },
  {
    name: 'schiller',
    label: 'Schiller (5p)',
    description: 'Player left of dealer must pick. Called ace for partner.',
    allowedPlayerCounts: [5],
    fields: {
      handSize: { value: 6, mode: 'locked' },
      blindSize: { value: 2, mode: 'locked' },
      pickerRule: { value: 'left-of-dealer', mode: 'locked', options: ['left-of-dealer'] },
      partnerRule: { value: 'called-ace', mode: 'locked', options: ['called-ace'] },
      noPick: { value: null, mode: 'hidden', options: [null] },
      cracking: { value: false, mode: 'editable' },
      blitzing: { value: false, mode: 'editable' },
      doubleOnTheBump: { value: false, mode: 'editable' },
      partnerOffTheHook: { value: false, mode: 'editable' },
      noAceFaceTrump: { value: false, mode: 'editable' },
      multiplicityLimit: { value: null, mode: 'editable' },
      callOwnAce: { value: false, mode: 'editable' },
      cardsRemoved: { value: [], mode: 'hidden' },
    },
  },
  // 6 players
  {
    name: 'jack-of-clubs',
    label: 'Jack of Clubs (6p)',
    description:
      'Partner is the Jack of Clubs. If picker has it, they can call another Jack or play alone.',
    allowedPlayerCounts: [6],
    fields: {
      handSize: { value: 5, mode: 'locked' },
      blindSize: { value: 2, mode: 'locked' },
      pickerRule: { value: 'autonomous', mode: 'hidden', options: ['autonomous'] },
      partnerRule: { value: 'jc', mode: 'locked', options: ['jc'] },
      noPick: { value: 'leaster', mode: 'editable', options: ALL_NO_PICK_OPTIONS },
      cracking: { value: false, mode: 'editable' },
      blitzing: { value: false, mode: 'editable' },
      doubleOnTheBump: { value: false, mode: 'hidden' },
      partnerOffTheHook: { value: false, mode: 'editable' },
      noAceFaceTrump: { value: false, mode: 'editable' },
      multiplicityLimit: { value: null, mode: 'editable' },
      callOwnAce: { value: null, mode: 'hidden' },
      cardsRemoved: { value: [], mode: 'hidden' },
    },
  },
  // 7 players
  {
    name: 'jack-of-diamonds',
    label: 'Jack of Diamonds (7p)',
    description:
      'Partner is the Jack of Diamonds. If picker has it, they can call another Jack or play alone.',
    allowedPlayerCounts: [7],
    fields: {
      handSize: { value: 4, mode: 'locked' },
      blindSize: { value: 4, mode: 'locked' },
      pickerRule: { value: 'autonomous', mode: 'hidden', options: ['autonomous'] },
      partnerRule: { value: 'jd', mode: 'locked', options: ['jd'] },
      noPick: { value: 'leaster', mode: 'editable', options: ALL_NO_PICK_OPTIONS },
      cracking: { value: false, mode: 'editable' },
      blitzing: { value: false, mode: 'editable' },
      doubleOnTheBump: { value: false, mode: 'editable' },
      partnerOffTheHook: { value: false, mode: 'editable' },
      noAceFaceTrump: { value: false, mode: 'editable' },
      multiplicityLimit: { value: null, mode: 'editable' },
      callOwnAce: { value: null, mode: 'hidden' },
      cardsRemoved: { value: [], mode: 'hidden' },
    },
  },
  {
    name: 'partner-draft',
    label: 'Partner Draft (7p)',
    description:
      'Picker draws 2 from blind. Player to their left is partner and draws the other 2.',
    allowedPlayerCounts: [7],
    fields: {
      handSize: { value: 4, mode: 'locked' },
      blindSize: { value: 4, mode: 'locked' },
      pickerRule: { value: 'autonomous', mode: 'hidden', options: ['autonomous'] },
      partnerRule: { value: 'left-of-picker', mode: 'locked', options: ['left-of-picker'] },
      noPick: { value: 'leaster', mode: 'editable', options: ALL_NO_PICK_OPTIONS },
      cracking: { value: false, mode: 'editable' },
      blitzing: { value: false, mode: 'editable' },
      doubleOnTheBump: { value: false, mode: 'editable' },
      partnerOffTheHook: { value: false, mode: 'editable' },
      noAceFaceTrump: { value: false, mode: 'editable' },
      multiplicityLimit: { value: null, mode: 'editable' },
      callOwnAce: { value: null, mode: 'hidden' },
      cardsRemoved: { value: [], mode: 'hidden' },
    },
  },
  // 8 players
  {
    name: 'black-queens',
    label: 'Black Queens (8p)',
    description: 'Black Queen holders are partners. Player with both goes alone. No blind.',
    allowedPlayerCounts: [8],
    fields: {
      handSize: { value: 4, mode: 'locked' },
      blindSize: { value: 0, mode: 'locked' },
      pickerRule: { value: null, mode: 'hidden', options: [null] },
      partnerRule: { value: 'qc-qs', mode: 'locked', options: ['qc-qs'] },
      noPick: { value: null, mode: 'hidden', options: [null] },
      cracking: { value: false, mode: 'editable' },
      blitzing: { value: false, mode: 'editable' },
      doubleOnTheBump: { value: false, mode: 'editable' },
      partnerOffTheHook: { value: false, mode: 'editable' },
      noAceFaceTrump: { value: false, mode: 'editable' },
      multiplicityLimit: { value: null, mode: 'editable' },
      callOwnAce: { value: null, mode: 'hidden' },
      cardsRemoved: { value: [], mode: 'hidden' },
    },
  },
];

// ---------------------------------------------------------------------------
// Plugin (wires everything together)
// ---------------------------------------------------------------------------

export const SheepsheadConfigPlugin: GameConfigPlugin<SheepsheadFieldKey> = {
  label: 'Sheepshead',
  fieldRegistry: FIELD_REGISTRY,
  presets: CONFIG_PRESETS,
  configSchema: SheepsheadConfigSchema,
};
