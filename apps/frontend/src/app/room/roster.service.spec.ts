import * as fc from 'fast-check';
import type { RoomInviteResponse, RosterMember, RosterState } from '@cardquorum/shared';
import { computeInvitedList, computeStatus, formatRosterCount } from './roster.service';

// ---------------------------------------------------------------------------
// Arbitraries (generators)
// ---------------------------------------------------------------------------

const arbRosterMember = (
  userId: number,
  section: 'players' | 'spectators',
  position: number,
): RosterMember => ({
  userId,
  username: `user${userId}`,
  displayName: null,
  section,
  position,
  assignedHue: null,
});

const arbRosterState = (): fc.Arbitrary<RosterState> =>
  fc
    .uniqueArray(fc.integer({ min: 1, max: 100_000 }), {
      minLength: 0,
      maxLength: 15,
    })
    .chain((ids) =>
      fc.integer({ min: 0, max: ids.length }).map((splitAt) => {
        const playerIds = ids.slice(0, splitAt);
        const spectatorIds = ids.slice(splitAt);
        return {
          players: playerIds.map((id, i) => arbRosterMember(id, 'players', i)),
          spectators: spectatorIds.map((id, i) => arbRosterMember(id, 'spectators', i)),
          rotatePlayers: false,
        };
      }),
    );

const arbInvite = (userId: number): RoomInviteResponse => ({
  userId,
  username: `user${userId}`,
  displayName: null,
  invitedAt: new Date().toISOString(),
});

describe('Status dot reflects online presence', () => {
  it('computeStatus returns "online" iff userId is in the online set, "offline" otherwise', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000 }),
        fc.uniqueArray(fc.integer({ min: 1, max: 100_000 }), {
          minLength: 0,
          maxLength: 20,
        }),
        (userId, onlineIds) => {
          const onlineSet = new Set(onlineIds);
          const result = computeStatus(userId, onlineSet);

          if (onlineSet.has(userId)) {
            expect(result).toBe('online');
          } else {
            expect(result).toBe('offline');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Invited list equals invitees minus roster members', () => {
  it('computeInvitedList returns exactly those invitees not on the roster', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 100_000 }), {
          minLength: 0,
          maxLength: 20,
        }),
        arbRosterState(),
        (invitedIds, roster) => {
          const invites = invitedIds.map(arbInvite);
          const result = computeInvitedList(invites, roster);

          const rosterUserIds = new Set([
            ...roster.players.map((m) => m.userId),
            ...roster.spectators.map((m) => m.userId),
          ]);

          // Every returned invite should NOT be on the roster
          for (const inv of result) {
            expect(rosterUserIds.has(inv.userId)).toBe(false);
          }

          // Every invite NOT on the roster should be in the result
          const resultIds = new Set(result.map((r) => r.userId));
          for (const inv of invites) {
            if (!rosterUserIds.has(inv.userId)) {
              expect(resultIds.has(inv.userId)).toBe(true);
            }
          }

          // Result size should equal invitees minus those on roster
          const expectedCount = invites.filter((inv) => !rosterUserIds.has(inv.userId)).length;
          expect(result.length).toBe(expectedCount);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Roster count formatting', () => {
  it('formatRosterCount returns "N / M" when limit is positive, "N" when null or 0', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10_000 }),
        fc.oneof(fc.constant(null), fc.constant(0), fc.integer({ min: 1, max: 10_000 })),
        (count, limit) => {
          const result = formatRosterCount(count, limit);

          if (limit != null && limit > 0) {
            expect(result).toBe(`${count} / ${limit}`);
          } else {
            expect(result).toBe(`${count}`);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
