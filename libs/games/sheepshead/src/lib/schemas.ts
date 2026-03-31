import { z } from 'zod';

export const CardNameSchema = z.enum([
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
]);

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
  cardsRemoved: z.array(CardNameSchema).optional(),
});

export type SheepsheadConfig = z.infer<typeof SheepsheadConfigSchema>;
export type NoPick = z.infer<typeof NoPickSchema>;
export type PickerRule = z.infer<typeof PickerRuleSchema>;
export type PartnerRule = z.infer<typeof PartnerRuleSchema>;
