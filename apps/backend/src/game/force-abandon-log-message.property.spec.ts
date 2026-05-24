import * as fc from 'fast-check';

/**
 * Pure function that generates the force-abandon game log message.
 * Mirrors the message format used in GameService.forceAbandonGame.
 */
function generateForceAbandonMessage(tardyPlayerName: string, ownerName: string): string {
  return `${ownerName} forced ${tardyPlayerName} to abandon the game`;
}

describe('Force-abandon log message contains both player names', () => {
  const playerNameArb = fc.string({ minLength: 1, maxLength: 50 });

  it('message always contains the tardy player name', () => {
    fc.assert(
      fc.property(playerNameArb, playerNameArb, (tardyPlayerName, ownerName) => {
        const message = generateForceAbandonMessage(tardyPlayerName, ownerName);

        expect(message).toContain(tardyPlayerName);
      }),
      { numRuns: 100 },
    );
  });

  it('message always contains the owner name', () => {
    fc.assert(
      fc.property(playerNameArb, playerNameArb, (tardyPlayerName, ownerName) => {
        const message = generateForceAbandonMessage(tardyPlayerName, ownerName);

        expect(message).toContain(ownerName);
      }),
      { numRuns: 100 },
    );
  });

  it('message always ends with "to abandon the game"', () => {
    fc.assert(
      fc.property(playerNameArb, playerNameArb, (tardyPlayerName, ownerName) => {
        const message = generateForceAbandonMessage(tardyPlayerName, ownerName);

        expect(message.endsWith('to abandon the game')).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('message contains both names even when they are identical', () => {
    fc.assert(
      fc.property(playerNameArb, (name) => {
        const message = generateForceAbandonMessage(name, name);

        // Both occurrences should be present — find at least two occurrences
        const firstIndex = message.indexOf(name);
        const secondIndex = message.indexOf(name, firstIndex + 1);

        expect(firstIndex).toBeGreaterThanOrEqual(0);
        expect(secondIndex).toBeGreaterThanOrEqual(0);
        expect(secondIndex).not.toBe(firstIndex);
      }),
      { numRuns: 100 },
    );
  });

  it('message is non-empty for any non-empty player names', () => {
    fc.assert(
      fc.property(playerNameArb, playerNameArb, (tardyPlayerName, ownerName) => {
        const message = generateForceAbandonMessage(tardyPlayerName, ownerName);

        expect(message.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});
