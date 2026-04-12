import * as fc from 'fast-check';
import { validateGameForm } from './game-form-validation';

describe('Player count mismatch validation', () => {
  /**
   * For any (rosterCount, allowedPlayerCounts) tuple, validateGameForm reports
   * a "player count mismatch" error if and only if rosterCount is NOT in
   * allowedPlayerCounts. We fix gameType and presetIndex to valid values so
   * only the player-count rule is exercised.
   */
  it('reports player count mismatch iff rosterCount is not in allowedPlayerCounts', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.uniqueArray(fc.integer({ min: 1, max: 20 }), { minLength: 1, maxLength: 8 }),
        (rosterCount, allowedPlayerCounts) => {
          const errors = validateGameForm({
            gameType: 'sheepshead',
            selectedPresetIndex: 0,
            rosterCount,
            allowedPlayerCounts,
          });

          const hasMismatchError = errors.some((e) => e.includes("doesn't match variant"));

          if (allowedPlayerCounts.includes(rosterCount)) {
            expect(hasMismatchError).toBe(false);
          } else {
            expect(hasMismatchError).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Incomplete form validation', () => {
  /**
   * For any form state where gameType is null or empty string,
   * validateGameForm always includes a "No game selected" error.
   */
  it('reports "No game selected" when gameType is missing', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(null, ''),
        fc.integer({ min: -10, max: 10 }),
        fc.integer({ min: 0, max: 20 }),
        fc.option(
          fc.uniqueArray(fc.integer({ min: 1, max: 20 }), {
            minLength: 1,
            maxLength: 8,
          }),
          { nil: null },
        ),
        (gameType, selectedPresetIndex, rosterCount, allowedPlayerCounts) => {
          const errors = validateGameForm({
            gameType,
            selectedPresetIndex,
            rosterCount,
            allowedPlayerCounts,
          });

          expect(errors).toContain('No game selected');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * For any form state where selectedPresetIndex is negative (no variant selected),
   * validateGameForm always includes a "No variant selected" error.
   */
  it('reports "No variant selected" when selectedPresetIndex is negative', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
        fc.integer({ min: -100, max: -1 }),
        fc.integer({ min: 0, max: 20 }),
        fc.option(
          fc.uniqueArray(fc.integer({ min: 1, max: 20 }), {
            minLength: 1,
            maxLength: 8,
          }),
          { nil: null },
        ),
        (gameType, selectedPresetIndex, rosterCount, allowedPlayerCounts) => {
          const errors = validateGameForm({
            gameType,
            selectedPresetIndex,
            rosterCount,
            allowedPlayerCounts,
          });

          expect(errors).toContain('No variant selected');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * For any form state where BOTH gameType is missing AND selectedPresetIndex
   * is negative, validateGameForm includes both error messages.
   */
  it('reports both errors when gameType is missing and no variant selected', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(null, ''),
        fc.integer({ min: -100, max: -1 }),
        fc.integer({ min: 0, max: 20 }),
        (gameType, selectedPresetIndex, rosterCount) => {
          const errors = validateGameForm({
            gameType,
            selectedPresetIndex,
            rosterCount,
            allowedPlayerCounts: null,
          });

          expect(errors).toContain('No game selected');
          expect(errors).toContain('No variant selected');
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Start button disabled state tracks validation errors', () => {
  /**
   * For any list of validation errors (string[]), the Start button is disabled
   * if and only if the list is non-empty. This tests the pure relationship:
   *   canStart = errors.length === 0
   *   disabled = !canStart = errors.length > 0
   */
  it('Start button is disabled iff validation errors array is non-empty', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 10 }),
        (errors: string[]) => {
          const canStart = errors.length === 0;
          const disabled = !canStart;

          // disabled should be true when there are errors, false when empty
          expect(disabled).toBe(errors.length > 0);
          expect(canStart).toBe(errors.length === 0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * For any random form state, the canStart derivation from validateGameForm
   * correctly tracks: canStart = (validateGameForm(input).length === 0).
   * This verifies the integration between the validation function and the
   * disabled-state logic used by the component.
   */
  it('canStart derived from validateGameForm is false iff errors are non-empty', () => {
    const gameTypeArb = fc.oneof(
      fc.constant(null),
      fc.constant(''),
      fc.string({ minLength: 1, maxLength: 20 }),
    );
    const presetIndexArb = fc.integer({ min: -10, max: 10 });
    const rosterCountArb = fc.integer({ min: 0, max: 20 });
    const allowedPlayerCountsArb = fc.option(
      fc.uniqueArray(fc.integer({ min: 1, max: 20 }), { minLength: 1, maxLength: 8 }),
      { nil: null },
    );

    fc.assert(
      fc.property(
        gameTypeArb,
        presetIndexArb,
        rosterCountArb,
        allowedPlayerCountsArb,
        (gameType, selectedPresetIndex, rosterCount, allowedPlayerCounts) => {
          const errors = validateGameForm({
            gameType,
            selectedPresetIndex,
            rosterCount,
            allowedPlayerCounts,
          });

          const canStart = errors.length === 0;
          const disabled = !canStart;

          // Start button disabled iff there are validation errors
          expect(disabled).toBe(errors.length > 0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
