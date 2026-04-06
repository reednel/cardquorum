/**
 * Pure validation functions for the Game Tab form.
 * Extracted so they can be property-tested independently of Angular.
 */

export interface GameFormValidationInput {
  /** Selected game type, or null/empty if none selected. */
  gameType: string | null;
  /** Index of the selected variant/preset, or -1 if none selected. */
  selectedPresetIndex: number;
  /** Number of players currently on the roster. */
  rosterCount: number;
  /** Allowed player counts for the selected variant, or null if no variant selected. */
  allowedPlayerCounts: number[] | null;
}

/**
 * Returns an array of human-readable validation error strings.
 * An empty array means the form is valid and a game can be started.
 */
export function validateGameForm(input: GameFormValidationInput): string[] {
  const errors: string[] = [];

  if (!input.gameType) {
    errors.push('No game selected');
  }

  if (input.selectedPresetIndex < 0) {
    errors.push('No variant selected');
  }

  if (input.allowedPlayerCounts != null && !input.allowedPlayerCounts.includes(input.rosterCount)) {
    errors.push(
      `Player count (${input.rosterCount}) doesn't match variant (${input.allowedPlayerCounts.join(', ')})`,
    );
  }

  return errors;
}
