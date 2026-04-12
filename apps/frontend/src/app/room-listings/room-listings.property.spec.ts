import * as fc from 'fast-check';

/**
 * Pure logic extracted from DetailsPopoverComponent template:
 *   {{ room().ownerDisplayName || room().ownerUsername }}
 */
function resolveOwnerDisplay(ownerDisplayName: string, ownerUsername: string): string {
  return ownerDisplayName || ownerUsername;
}

/**
 * Pure logic extracted from RoomTableComponent.isRoomFull:
 *   room.memberLimit != null && room.memberLimit > 0
 *     && room.rosterCount >= room.memberLimit && !room.isOnRoster
 */
function isRoomFull(memberLimit: number | null, rosterCount: number, isOnRoster: boolean): boolean {
  return memberLimit != null && memberLimit > 0 && rosterCount >= memberLimit && !isOnRoster;
}

describe('Owner display name fallback', () => {
  it('displays ownerDisplayName when it is a non-empty string', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 50 }),
        (displayName, username) => {
          expect(resolveOwnerDisplay(displayName, username)).toBe(displayName);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('falls back to ownerUsername when ownerDisplayName is empty', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 50 }), (username) => {
        expect(resolveOwnerDisplay('', username)).toBe(username);
      }),
      { numRuns: 100 },
    );
  });

  it('always returns exactly one of displayName or username', () => {
    const displayNameArb = fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 50 }));
    const usernameArb = fc.string({ minLength: 1, maxLength: 50 });

    fc.assert(
      fc.property(displayNameArb, usernameArb, (displayName, username) => {
        const result = resolveOwnerDisplay(displayName, username);
        expect(result.length).toBeGreaterThan(0);
        const isDisplayName = displayName !== '' && result === displayName;
        const isUsername = displayName === '' && result === username;
        expect(isDisplayName || isUsername).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Full room button state', () => {
  const memberLimitArb = fc.oneof(
    fc.constant(null),
    fc.constant(0),
    fc.integer({ min: 1, max: 100 }),
  );
  const rosterCountArb = fc.integer({ min: 0, max: 100 });
  const isOnRosterArb = fc.boolean();

  it('room is full only when memberLimit > 0, rosterCount >= memberLimit, and user is not on roster', () => {
    fc.assert(
      fc.property(
        memberLimitArb,
        rosterCountArb,
        isOnRosterArb,
        (memberLimit, rosterCount, isOnRoster) => {
          const result = isRoomFull(memberLimit, rosterCount, isOnRoster);
          const expected =
            memberLimit != null && memberLimit > 0 && rosterCount >= memberLimit && !isOnRoster;
          expect(result).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('room is never full when memberLimit is null', () => {
    fc.assert(
      fc.property(rosterCountArb, isOnRosterArb, (rosterCount, isOnRoster) => {
        expect(isRoomFull(null, rosterCount, isOnRoster)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('room is never full when memberLimit is 0', () => {
    fc.assert(
      fc.property(rosterCountArb, isOnRosterArb, (rosterCount, isOnRoster) => {
        expect(isRoomFull(0, rosterCount, isOnRoster)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('room is never full when user is already on the roster', () => {
    fc.assert(
      fc.property(memberLimitArb, rosterCountArb, (memberLimit, rosterCount) => {
        expect(isRoomFull(memberLimit, rosterCount, true)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('room is not full when rosterCount is below memberLimit', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 100 }), isOnRosterArb, (memberLimit, isOnRoster) => {
        const rosterCount = fc.sample(fc.integer({ min: 0, max: memberLimit - 1 }), 1)[0];
        expect(isRoomFull(memberLimit, rosterCount, isOnRoster)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
