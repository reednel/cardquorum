import * as fc from 'fast-check';

/**
 * Pure validation function for force-abandon requests.
 * Mirrors the validation logic in GameService.forceAbandonGame.
 */
function validateForceAbandon(params: {
  requestingUserId: number;
  targetUserId: number;
  roomOwnerId: number;
  activePlayerUserId: number;
  turnTimeLimit: number | null;
  elapsedSeconds: number;
}): { accepted: boolean; error?: string } {
  const {
    requestingUserId,
    targetUserId,
    roomOwnerId,
    activePlayerUserId,
    turnTimeLimit,
    elapsedSeconds,
  } = params;

  if (requestingUserId !== roomOwnerId) {
    return { accepted: false, error: 'Only the room owner can force-abandon' };
  }

  if (targetUserId !== activePlayerUserId) {
    return { accepted: false, error: 'Target player is not the current active player' };
  }

  if (turnTimeLimit == null) {
    return { accepted: false, error: 'Force-abandon is not enabled for this room' };
  }

  if (elapsedSeconds <= turnTimeLimit) {
    return { accepted: false, error: 'Turn time limit has not yet elapsed' };
  }

  return { accepted: true };
}

describe('Force-abandon server validation', () => {
  const arbUserId = fc.integer({ min: 1, max: 10000 });
  const arbTurnTimeLimit = fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 3596400 }));
  const arbElapsedSeconds = fc.double({ min: 0, max: 7200000, noNaN: true });

  it('accepts request if and only if all four conditions are met', () => {
    fc.assert(
      fc.property(
        arbUserId,
        arbUserId,
        arbUserId,
        arbUserId,
        arbTurnTimeLimit,
        arbElapsedSeconds,
        (
          requestingUserId,
          targetUserId,
          roomOwnerId,
          activePlayerUserId,
          turnTimeLimit,
          elapsedSeconds,
        ) => {
          const result = validateForceAbandon({
            requestingUserId,
            targetUserId,
            roomOwnerId,
            activePlayerUserId,
            turnTimeLimit,
            elapsedSeconds,
          });

          const allConditionsMet =
            requestingUserId === roomOwnerId &&
            targetUserId === activePlayerUserId &&
            turnTimeLimit !== null &&
            elapsedSeconds > turnTimeLimit;

          expect(result.accepted).toBe(allConditionsMet);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns an error message when the request is rejected', () => {
    fc.assert(
      fc.property(
        arbUserId,
        arbUserId,
        arbUserId,
        arbUserId,
        arbTurnTimeLimit,
        arbElapsedSeconds,
        (
          requestingUserId,
          targetUserId,
          roomOwnerId,
          activePlayerUserId,
          turnTimeLimit,
          elapsedSeconds,
        ) => {
          const result = validateForceAbandon({
            requestingUserId,
            targetUserId,
            roomOwnerId,
            activePlayerUserId,
            turnTimeLimit,
            elapsedSeconds,
          });

          if (!result.accepted) {
            expect(result.error).toBeDefined();
            expect(typeof result.error).toBe('string');
            expect(result.error!.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('does not return an error message when the request is accepted', () => {
    fc.assert(
      fc.property(arbUserId, fc.integer({ min: 1, max: 3596400 }), (userId, turnTimeLimit) => {
        const elapsedSeconds = turnTimeLimit + 1;

        const result = validateForceAbandon({
          requestingUserId: userId,
          targetUserId: userId,
          roomOwnerId: userId,
          activePlayerUserId: userId,
          turnTimeLimit,
          elapsedSeconds,
        });

        expect(result.accepted).toBe(true);
        expect(result.error).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  it('rejects when requester is not the room owner', () => {
    fc.assert(
      fc.property(
        arbUserId,
        arbUserId.filter((id) => id > 1),
        fc.integer({ min: 1, max: 3596400 }),
        (targetAndActive, roomOwnerId, turnTimeLimit) => {
          // Ensure requester differs from owner
          const requestingUserId = roomOwnerId === 1 ? 2 : roomOwnerId - 1;
          const elapsedSeconds = turnTimeLimit + 1;

          const result = validateForceAbandon({
            requestingUserId,
            targetUserId: targetAndActive,
            roomOwnerId,
            activePlayerUserId: targetAndActive,
            turnTimeLimit,
            elapsedSeconds,
          });

          expect(result.accepted).toBe(false);
          expect(result.error).toBe('Only the room owner can force-abandon');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects when target is not the active player', () => {
    fc.assert(
      fc.property(
        arbUserId,
        arbUserId,
        fc.integer({ min: 1, max: 3596400 }),
        (ownerId, activePlayerUserId, turnTimeLimit) => {
          // Ensure target differs from active player
          const targetUserId = activePlayerUserId === 1 ? 2 : activePlayerUserId - 1;
          const elapsedSeconds = turnTimeLimit + 1;

          const result = validateForceAbandon({
            requestingUserId: ownerId,
            targetUserId,
            roomOwnerId: ownerId,
            activePlayerUserId,
            turnTimeLimit,
            elapsedSeconds,
          });

          expect(result.accepted).toBe(false);
          expect(result.error).toBe('Target player is not the current active player');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects when turn time limit is null (unlimited)', () => {
    fc.assert(
      fc.property(arbUserId, arbElapsedSeconds, (userId, elapsedSeconds) => {
        const result = validateForceAbandon({
          requestingUserId: userId,
          targetUserId: userId,
          roomOwnerId: userId,
          activePlayerUserId: userId,
          turnTimeLimit: null,
          elapsedSeconds,
        });

        expect(result.accepted).toBe(false);
        expect(result.error).toBe('Force-abandon is not enabled for this room');
      }),
      { numRuns: 100 },
    );
  });

  it('rejects when elapsed time has not exceeded the turn time limit', () => {
    fc.assert(
      fc.property(arbUserId, fc.integer({ min: 2, max: 3596400 }), (userId, turnTimeLimit) => {
        // Elapsed time is less than or equal to the limit
        const elapsedSeconds = turnTimeLimit - 1;

        const result = validateForceAbandon({
          requestingUserId: userId,
          targetUserId: userId,
          roomOwnerId: userId,
          activePlayerUserId: userId,
          turnTimeLimit,
          elapsedSeconds,
        });

        expect(result.accepted).toBe(false);
        expect(result.error).toBe('Turn time limit has not yet elapsed');
      }),
      { numRuns: 100 },
    );
  });

  it('rejects when elapsed time exactly equals the turn time limit', () => {
    fc.assert(
      fc.property(arbUserId, fc.integer({ min: 1, max: 3596400 }), (userId, turnTimeLimit) => {
        const result = validateForceAbandon({
          requestingUserId: userId,
          targetUserId: userId,
          roomOwnerId: userId,
          activePlayerUserId: userId,
          turnTimeLimit,
          elapsedSeconds: turnTimeLimit,
        });

        expect(result.accepted).toBe(false);
        expect(result.error).toBe('Turn time limit has not yet elapsed');
      }),
      { numRuns: 100 },
    );
  });
});
