import * as fc from 'fast-check';

/**
 * Pure function that determines whether the force-abandon UI (modal or button)
 * should be visible based on the current game state conditions.
 */
function shouldShowForceAbandonUI(params: {
  gameActive: boolean;
  turnTimeLimit: number | null;
  isRoomOwner: boolean;
  isActivePlayer: boolean;
  elapsedSeconds: number;
}): boolean {
  return (
    params.gameActive &&
    params.turnTimeLimit !== null &&
    params.isRoomOwner &&
    !params.isActivePlayer &&
    params.elapsedSeconds > params.turnTimeLimit
  );
}

describe('Force-abandon UI visibility conditions', () => {
  const arbPositiveLimit = fc.integer({ min: 1, max: 3596400 });
  const arbElapsedSeconds = fc.integer({ min: 0, max: 7200000 });

  it('UI is visible if and only if all five conditions are met', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.oneof(fc.constant(null), arbPositiveLimit),
        fc.boolean(),
        fc.boolean(),
        arbElapsedSeconds,
        (gameActive, turnTimeLimit, isRoomOwner, isActivePlayer, elapsedSeconds) => {
          const result = shouldShowForceAbandonUI({
            gameActive,
            turnTimeLimit,
            isRoomOwner,
            isActivePlayer,
            elapsedSeconds,
          });

          const allConditionsMet =
            gameActive &&
            turnTimeLimit !== null &&
            isRoomOwner &&
            !isActivePlayer &&
            elapsedSeconds > turnTimeLimit;

          expect(result).toBe(allConditionsMet);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('UI is never visible when turnTimeLimit is null (unlimited)', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        arbElapsedSeconds,
        (gameActive, isRoomOwner, isActivePlayer, elapsedSeconds) => {
          const result = shouldShowForceAbandonUI({
            gameActive,
            turnTimeLimit: null,
            isRoomOwner,
            isActivePlayer,
            elapsedSeconds,
          });

          expect(result).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('UI is never visible when the current user is the active player', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.oneof(fc.constant(null), arbPositiveLimit),
        fc.boolean(),
        arbElapsedSeconds,
        (gameActive, turnTimeLimit, isRoomOwner, elapsedSeconds) => {
          const result = shouldShowForceAbandonUI({
            gameActive,
            turnTimeLimit,
            isRoomOwner,
            isActivePlayer: true,
            elapsedSeconds,
          });

          expect(result).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('UI is never visible when the current user is not the room owner', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.oneof(fc.constant(null), arbPositiveLimit),
        fc.boolean(),
        arbElapsedSeconds,
        (gameActive, turnTimeLimit, isActivePlayer, elapsedSeconds) => {
          const result = shouldShowForceAbandonUI({
            gameActive,
            turnTimeLimit,
            isRoomOwner: false,
            isActivePlayer,
            elapsedSeconds,
          });

          expect(result).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('UI is never visible when no game is active', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(null), arbPositiveLimit),
        fc.boolean(),
        fc.boolean(),
        arbElapsedSeconds,
        (turnTimeLimit, isRoomOwner, isActivePlayer, elapsedSeconds) => {
          const result = shouldShowForceAbandonUI({
            gameActive: false,
            turnTimeLimit,
            isRoomOwner,
            isActivePlayer,
            elapsedSeconds,
          });

          expect(result).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
