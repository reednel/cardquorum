/** The 18 palette hue values: [0, 20, 40, …, 340]. */
export const PALETTE_HUES: readonly number[] = [
  0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300, 320, 340,
];

/** Mapping from player userId to their assigned hue integer (0–359). */
export type ColorAssignmentMap = Record<number, number>;
