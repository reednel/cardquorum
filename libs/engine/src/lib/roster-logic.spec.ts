import * as fc from 'fast-check';
import type { RosterMember, RosterState } from '@cardquorum/shared';
import {
  addMember,
  handleDisconnect,
  removeMember,
  reorderRoster,
  rotateSeat,
} from './roster-logic';

// ---------------------------------------------------------------------------
// Arbitraries (generators)
// ---------------------------------------------------------------------------

/**
 * Generates a RosterState with unique userIds across both lists.
 * Positions are contiguous starting from 0 within each list.
 */
const arbRosterState = (
  opts: {
    minPlayers?: number;
    maxPlayers?: number;
    minSpectators?: number;
    maxSpectators?: number;
  } = {},
): fc.Arbitrary<RosterState> => {
  const minP = opts.minPlayers ?? 0;
  const maxP = opts.maxPlayers ?? 10;
  const minS = opts.minSpectators ?? 0;
  const maxS = opts.maxSpectators ?? 10;

  return fc
    .uniqueArray(fc.integer({ min: 1, max: 100_000 }), {
      minLength: minP + minS,
      maxLength: maxP + maxS,
    })
    .chain((ids) =>
      fc
        .integer({
          min: Math.max(minP, ids.length - maxS),
          max: Math.min(ids.length - minS, maxP),
        })
        .chain((splitAt) => {
          const playerIds = ids.slice(0, splitAt);
          const spectatorIds = ids.slice(splitAt);

          return fc
            .record({
              playerNames: fc.array(
                fc.record({
                  username: fc.string({ minLength: 1, maxLength: 12 }),
                  displayName: fc.option(fc.string({ minLength: 1, maxLength: 12 }), { nil: null }),
                }),
                { minLength: playerIds.length, maxLength: playerIds.length },
              ),
              spectatorNames: fc.array(
                fc.record({
                  username: fc.string({ minLength: 1, maxLength: 12 }),
                  displayName: fc.option(fc.string({ minLength: 1, maxLength: 12 }), { nil: null }),
                }),
                {
                  minLength: spectatorIds.length,
                  maxLength: spectatorIds.length,
                },
              ),
              rotatePlayers: fc.boolean(),
            })
            .map(({ playerNames, spectatorNames, rotatePlayers }) => {
              const players: RosterMember[] = playerIds.map((id, i) => ({
                userId: id,
                username: playerNames[i].username,
                displayName: playerNames[i].displayName,
                section: 'players' as const,
                position: i,
                assignedHue: null,
              }));
              const spectators: RosterMember[] = spectatorIds.map((id, i) => ({
                userId: id,
                username: spectatorNames[i].username,
                displayName: spectatorNames[i].displayName,
                section: 'spectators' as const,
                position: i,
                assignedHue: null,
              }));
              return { players, spectators, rotatePlayers } as RosterState;
            });
        }),
    );
};

/**
 * Generates a tuple of [RosterState, RosterMember] where the member's
 * userId is guaranteed NOT to be on the roster.
 */
const arbRosterAndNewMember = (
  opts: Parameters<typeof arbRosterState>[0] = {},
): fc.Arbitrary<[RosterState, RosterMember]> =>
  arbRosterState(opts).chain((roster) => {
    const existingIds = new Set([
      ...roster.players.map((m) => m.userId),
      ...roster.spectators.map((m) => m.userId),
    ]);
    const newMemberArb = fc.record({
      userId: fc.integer({ min: 1, max: 200_000 }).filter((id) => !existingIds.has(id)),
      username: fc.string({ minLength: 1, maxLength: 12 }),
      displayName: fc.option(fc.string({ minLength: 1, maxLength: 12 }), {
        nil: null,
      }),
      section: fc.constant('spectators' as const),
      position: fc.constant(0),
      assignedHue: fc.constant(null as number | null),
    });
    return newMemberArb.map((m) => [roster, m] as [RosterState, RosterMember]);
  });

/**
 * Generates a tuple of [RosterState, userId] where userId is guaranteed
 * to be a member of the roster.
 */
const arbRosterAndMemberId = (
  opts: Parameters<typeof arbRosterState>[0] = {},
): fc.Arbitrary<[RosterState, number]> =>
  arbRosterState(opts).chain((roster) => {
    const ids = [...roster.players.map((m) => m.userId), ...roster.spectators.map((m) => m.userId)];
    return fc.constantFrom(...ids).map((id) => [roster, id] as [RosterState, number]);
  });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const allUserIds = (roster: RosterState): number[] => [
  ...roster.players.map((m) => m.userId),
  ...roster.spectators.map((m) => m.userId),
];

const positionsContiguous = (members: RosterMember[]): boolean =>
  members.every((m, i) => m.position === i);

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

/**
 * For any existing roster state and any user not already on the roster
 * (and below the membership limit), adding that user should place them
 * at the last position in the spectators list, leaving the players list
 * and existing spectator order unchanged.
 */
describe('New member joins as last spectator', () => {
  it('should place new member at the end of spectators, preserving players and existing spectator order', () => {
    fc.assert(
      fc.property(arbRosterAndNewMember(), ([roster, newMember]) => {
        const result = addMember(roster, newMember);

        // Should succeed (no limit)
        expect(result).not.toBeNull();
        const updated = result!;

        // Players list unchanged
        expect(updated.players).toEqual(roster.players);

        // Existing spectators preserved in order
        expect(updated.spectators.slice(0, roster.spectators.length)).toEqual(roster.spectators);

        // New member is last spectator
        const lastSpectator = updated.spectators[updated.spectators.length - 1];
        expect(lastSpectator.userId).toBe(newMember.userId);
        expect(lastSpectator.section).toBe('spectators');
        expect(lastSpectator.position).toBe(roster.spectators.length);

        // Spectators grew by exactly 1
        expect(updated.spectators.length).toBe(roster.spectators.length + 1);
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * For any roster state and any member on the roster, simulating a
 * WebSocket disconnect should produce an identical roster.
 */
describe('Disconnect does not modify roster', () => {
  it('should return an identical roster after disconnect', () => {
    fc.assert(
      fc.property(arbRosterAndMemberId({ minPlayers: 0, minSpectators: 1 }), ([roster, userId]) => {
        const result = handleDisconnect(roster, userId);
        expect(result).toEqual(roster);
        // Verify referential identity (truly no-op)
        expect(result).toBe(roster);
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * For any room with a membership limit M and a roster containing exactly M
 * members, attempting to add a new member should be rejected (return null).
 * For any room with fewer than M members (or no limit), adding should succeed.
 */
describe('Membership limit enforcement', () => {
  it('should reject when roster is at capacity', () => {
    fc.assert(
      fc.property(arbRosterAndNewMember({ minPlayers: 1 }), ([roster, newMember]) => {
        const total = roster.players.length + roster.spectators.length;
        const memberLimit = total; // exactly at capacity
        const result = addMember(roster, newMember, memberLimit);
        expect(result).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('should succeed when roster is below capacity', () => {
    fc.assert(
      fc.property(arbRosterAndNewMember(), ([roster, newMember]) => {
        const total = roster.players.length + roster.spectators.length;
        const memberLimit = total + 1; // room for one more
        const result = addMember(roster, newMember, memberLimit);
        expect(result).not.toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('should succeed when no limit is set (null)', () => {
    fc.assert(
      fc.property(arbRosterAndNewMember(), ([roster, newMember]) => {
        const result = addMember(roster, newMember, null);
        expect(result).not.toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * For any roster state and any member on the roster, removing that member
 * should produce a roster where:
 * (a) the removed member does not appear in either list,
 * (b) all other members remain in their original section,
 * (c) positions are contiguous starting from 0,
 * (d) the relative order of remaining members is preserved.
 */
describe('Roster removal produces valid roster', () => {
  it('should remove the member and maintain valid roster invariants', () => {
    fc.assert(
      fc.property(arbRosterAndMemberId({ minPlayers: 0, minSpectators: 1 }), ([roster, userId]) => {
        const result = removeMember(roster, userId);
        const ids = allUserIds(roster);

        // (a) Removed member not in either list
        const resultIds = allUserIds(result);
        expect(resultIds).not.toContain(userId);

        // (b) All other members remain in their original section
        for (const p of result.players) {
          const original = roster.players.find((m) => m.userId === p.userId);
          expect(original).toBeDefined();
        }
        for (const s of result.spectators) {
          const original = roster.spectators.find((m) => m.userId === s.userId);
          expect(original).toBeDefined();
        }

        // (c) Positions are contiguous starting from 0
        expect(positionsContiguous(result.players)).toBe(true);
        expect(positionsContiguous(result.spectators)).toBe(true);

        // (d) Relative order preserved
        const originalPlayerOrder = roster.players
          .filter((m) => m.userId !== userId)
          .map((m) => m.userId);
        const originalSpectatorOrder = roster.spectators
          .filter((m) => m.userId !== userId)
          .map((m) => m.userId);

        expect(result.players.map((m) => m.userId)).toEqual(originalPlayerOrder);
        expect(result.spectators.map((m) => m.userId)).toEqual(originalSpectatorOrder);

        // Total count decreased by 1
        expect(resultIds.length).toBe(ids.length - 1);
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * For any roster state and any valid reorder operation, the resulting roster
 * should contain exactly the same set of user IDs as before, with no
 * duplicates and no missing members.
 */
describe('Reorder preserves membership invariant', () => {
  it('should preserve the exact same set of user IDs after a valid reorder', () => {
    fc.assert(
      fc.property(
        arbRosterState({ minPlayers: 1, minSpectators: 1 }).chain((roster) => {
          const ids = allUserIds(roster);
          return fc
            .tuple(
              fc.shuffledSubarray(ids, {
                minLength: ids.length,
                maxLength: ids.length,
              }),
              fc.integer({ min: 0, max: ids.length }),
            )
            .map(
              ([shuffled, splitAt]) =>
                [roster, shuffled, splitAt] as [RosterState, number[], number],
            );
        }),
        ([roster, shuffled, splitAt]) => {
          const ids = allUserIds(roster);
          const newPlayers = shuffled.slice(0, splitAt);
          const newSpectators = shuffled.slice(splitAt);

          const result = reorderRoster(roster, newPlayers, newSpectators);

          // Same set of user IDs
          const resultIds = allUserIds(result);
          expect(new Set(resultIds)).toEqual(new Set(ids));

          // No duplicates
          expect(resultIds.length).toBe(new Set(resultIds).size);

          // Same total count
          expect(resultIds.length).toBe(ids.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * For any roster with at least one player:
 * - If rotatePlayers enabled and spectators non-empty: first player moves to
 *   bottom of spectators, first spectator moves to bottom of players
 * - If rotatePlayers disabled OR spectators empty: first player moves to
 *   bottom of players, spectators unchanged
 * - Total set of members is preserved
 */
describe('Seat rotation correctness', () => {
  it('should rotate correctly when rotatePlayers enabled and spectators non-empty', () => {
    fc.assert(
      fc.property(
        arbRosterState({ minPlayers: 1, minSpectators: 1 }).map((r) => ({
          ...r,
          rotatePlayers: true,
        })),
        (roster) => {
          const result = rotateSeat(roster);

          const firstPlayer = roster.players[0];
          const firstSpectator = roster.spectators[0];

          // First player moved to bottom of spectators
          const lastSpectator = result.spectators[result.spectators.length - 1];
          expect(lastSpectator.userId).toBe(firstPlayer.userId);
          expect(lastSpectator.section).toBe('spectators');

          // First spectator moved to bottom of players
          const lastPlayer = result.players[result.players.length - 1];
          expect(lastPlayer.userId).toBe(firstSpectator.userId);
          expect(lastPlayer.section).toBe('players');

          // Total set preserved
          const beforeIds = new Set(allUserIds(roster));
          const afterIds = new Set(allUserIds(result));
          expect(afterIds).toEqual(beforeIds);

          // Same total count (no duplicates, no missing)
          expect(allUserIds(result).length).toBe(allUserIds(roster).length);

          // Positions contiguous
          expect(positionsContiguous(result.players)).toBe(true);
          expect(positionsContiguous(result.spectators)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should cycle first player to bottom of players when rotatePlayers disabled', () => {
    fc.assert(
      fc.property(
        arbRosterState({ minPlayers: 2 }).map((r) => ({
          ...r,
          rotatePlayers: false,
        })),
        (roster) => {
          const result = rotateSeat(roster);

          const firstPlayer = roster.players[0];

          // First player moved to bottom of players
          const lastPlayer = result.players[result.players.length - 1];
          expect(lastPlayer.userId).toBe(firstPlayer.userId);

          // Spectators unchanged
          expect(result.spectators).toEqual(roster.spectators);

          // Total set preserved
          const beforeIds = new Set(allUserIds(roster));
          const afterIds = new Set(allUserIds(result));
          expect(afterIds).toEqual(beforeIds);

          // Positions contiguous
          expect(positionsContiguous(result.players)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should cycle first player to bottom of players when spectators empty (even if toggle on)', () => {
    fc.assert(
      fc.property(
        arbRosterState({ minPlayers: 2, maxSpectators: 0 }).map((r) => ({
          ...r,
          rotatePlayers: true,
        })),
        (roster) => {
          expect(roster.spectators.length).toBe(0);

          const result = rotateSeat(roster);

          const firstPlayer = roster.players[0];

          // First player moved to bottom of players
          const lastPlayer = result.players[result.players.length - 1];
          expect(lastPlayer.userId).toBe(firstPlayer.userId);

          // Spectators still empty
          expect(result.spectators).toEqual([]);

          // Total set preserved
          expect(new Set(allUserIds(result))).toEqual(new Set(allUserIds(roster)));

          // Positions contiguous
          expect(positionsContiguous(result.players)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
