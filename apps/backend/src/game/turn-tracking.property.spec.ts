import * as fc from 'fast-check';

/**
 * Pure function that replicates the turn tracking logic from GameService.applyAction.
 *
 * Given the previous active player, the new active player (from plugin state after action),
 * the previous turnStartTimestamp, and the new event's createdAt timestamp:
 * - If the active player changed, returns the new event's createdAt as the turnStartTimestamp
 * - If the active player did not change, returns the previous turnStartTimestamp unchanged
 */
function computeTurnTimestamp(params: {
  previousActivePlayer: number | null;
  newActivePlayer: number | null;
  previousTurnStartTimestamp: Date;
  eventCreatedAt: Date;
}): { turnStartTimestamp: Date; activePlayerUserId: number | null } {
  const { previousActivePlayer, newActivePlayer, previousTurnStartTimestamp, eventCreatedAt } =
    params;

  if (newActivePlayer !== previousActivePlayer) {
    return {
      turnStartTimestamp: eventCreatedAt,
      activePlayerUserId: newActivePlayer,
    };
  }

  return {
    turnStartTimestamp: previousTurnStartTimestamp,
    activePlayerUserId: previousActivePlayer,
  };
}

describe('Turn timestamp tracking correctness', () => {
  // Arbitraries
  const playerIdArb = fc.integer({ min: 1, max: 1000 });
  const timestampArb = fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') });

  it('updates turnStartTimestamp to event createdAt when active player changes', () => {
    fc.assert(
      fc.property(
        playerIdArb,
        playerIdArb,
        timestampArb,
        timestampArb,
        (previousPlayer, newPlayer, previousTimestamp, eventCreatedAt) => {
          // Ensure the players are actually different
          fc.pre(previousPlayer !== newPlayer);

          const result = computeTurnTimestamp({
            previousActivePlayer: previousPlayer,
            newActivePlayer: newPlayer,
            previousTurnStartTimestamp: previousTimestamp,
            eventCreatedAt,
          });

          expect(result.turnStartTimestamp).toEqual(eventCreatedAt);
          expect(result.activePlayerUserId).toBe(newPlayer);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('preserves turnStartTimestamp when active player does not change', () => {
    fc.assert(
      fc.property(
        playerIdArb,
        timestampArb,
        timestampArb,
        (activePlayer, previousTimestamp, eventCreatedAt) => {
          const result = computeTurnTimestamp({
            previousActivePlayer: activePlayer,
            newActivePlayer: activePlayer,
            previousTurnStartTimestamp: previousTimestamp,
            eventCreatedAt,
          });

          expect(result.turnStartTimestamp).toEqual(previousTimestamp);
          expect(result.activePlayerUserId).toBe(activePlayer);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('handles transition from null active player (game start) to a real player', () => {
    fc.assert(
      fc.property(playerIdArb, timestampArb, timestampArb, (newPlayer, prevTs, eventTs) => {
        const result = computeTurnTimestamp({
          previousActivePlayer: null,
          newActivePlayer: newPlayer,
          previousTurnStartTimestamp: prevTs,
          eventCreatedAt: eventTs,
        });

        expect(result.turnStartTimestamp).toEqual(eventTs);
        expect(result.activePlayerUserId).toBe(newPlayer);
      }),
      { numRuns: 100 },
    );
  });

  it('handles transition to null active player (scoring phase)', () => {
    fc.assert(
      fc.property(playerIdArb, timestampArb, timestampArb, (previousPlayer, prevTs, eventTs) => {
        const result = computeTurnTimestamp({
          previousActivePlayer: previousPlayer,
          newActivePlayer: null,
          previousTurnStartTimestamp: prevTs,
          eventCreatedAt: eventTs,
        });

        // null !== previousPlayer, so timestamp should update
        expect(result.turnStartTimestamp).toEqual(eventTs);
        expect(result.activePlayerUserId).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('null-to-null active player preserves timestamp (no change)', () => {
    fc.assert(
      fc.property(timestampArb, timestampArb, (prevTs, eventTs) => {
        const result = computeTurnTimestamp({
          previousActivePlayer: null,
          newActivePlayer: null,
          previousTurnStartTimestamp: prevTs,
          eventCreatedAt: eventTs,
        });

        expect(result.turnStartTimestamp).toEqual(prevTs);
        expect(result.activePlayerUserId).toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});
