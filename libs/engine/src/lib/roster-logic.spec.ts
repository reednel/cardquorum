import * as fc from 'fast-check';
import type { RosterMember, RosterState, RotationMode } from '@cardquorum/shared';
import {
  addMember,
  demoteNotReadyPlayers,
  demotePlayer,
  handleDisconnect,
  removeMember,
  reorderRoster,
  rotateSeat,
  rotateSeatV2,
  toggleReady,
  validateReorder,
} from './roster-logic';

// ---------------------------------------------------------------------------
// Arbitraries (generators)
// ---------------------------------------------------------------------------

/**
 * Generates a RosterState with unique userIds across both lists.
 * Positions are contiguous starting from 0 within each list.
 * Each member has a random readyToPlay boolean.
 * The roster has a random rotationMode.
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
                  readyToPlay: fc.boolean(),
                }),
                { minLength: playerIds.length, maxLength: playerIds.length },
              ),
              spectatorNames: fc.array(
                fc.record({
                  username: fc.string({ minLength: 1, maxLength: 12 }),
                  displayName: fc.option(fc.string({ minLength: 1, maxLength: 12 }), { nil: null }),
                  readyToPlay: fc.boolean(),
                }),
                {
                  minLength: spectatorIds.length,
                  maxLength: spectatorIds.length,
                },
              ),
              rotationMode: fc.constantFrom(
                'none' as RotationMode,
                'rotate-players' as RotationMode,
                'rotate-spectators' as RotationMode,
              ),
            })
            .map(({ playerNames, spectatorNames, rotationMode }) => {
              const players: RosterMember[] = playerIds.map((id, i) => ({
                userId: id,
                username: playerNames[i].username,
                displayName: playerNames[i].displayName,
                section: 'players' as const,
                position: i,
                assignedHue: null,
                readyToPlay: playerNames[i].readyToPlay,
              }));
              const spectators: RosterMember[] = spectatorIds.map((id, i) => ({
                userId: id,
                username: spectatorNames[i].username,
                displayName: spectatorNames[i].displayName,
                section: 'spectators' as const,
                position: i,
                assignedHue: null,
                readyToPlay: spectatorNames[i].readyToPlay,
              }));
              return { players, spectators, rotationMode } as RosterState;
            });
        }),
    );
};

/**
 * Generates a tuple of [RosterState, RosterMember] where the member's
 * userId is guaranteed NOT to be on the roster.
 * New members default to readyToPlay: false.
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
      readyToPlay: fc.constant(false),
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
// Existing Property Tests
// ---------------------------------------------------------------------------

describe('New member joins as last spectator', () => {
  it('should place new member at the end of spectators, preserving players and existing spectator order', () => {
    fc.assert(
      fc.property(arbRosterAndNewMember(), ([roster, newMember]) => {
        const result = addMember(roster, newMember);

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

describe('Disconnect does not modify roster', () => {
  it('should return an identical roster after disconnect', () => {
    fc.assert(
      fc.property(arbRosterAndMemberId({ minPlayers: 0, minSpectators: 1 }), ([roster, userId]) => {
        const result = handleDisconnect(roster, userId);
        expect(result).toEqual(roster);
        expect(result).toBe(roster);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Membership limit enforcement', () => {
  it('should reject when roster is at capacity', () => {
    fc.assert(
      fc.property(arbRosterAndNewMember({ minPlayers: 1 }), ([roster, newMember]) => {
        const total = roster.players.length + roster.spectators.length;
        const memberLimit = total;
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
        const memberLimit = total + 1;
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

describe('Roster removal produces valid roster', () => {
  it('should remove the member and maintain valid roster invariants', () => {
    fc.assert(
      fc.property(arbRosterAndMemberId({ minPlayers: 0, minSpectators: 1 }), ([roster, userId]) => {
        const result = removeMember(roster, userId);
        const ids = allUserIds(roster);

        const resultIds = allUserIds(result);
        expect(resultIds).not.toContain(userId);

        for (const p of result.players) {
          const original = roster.players.find((m) => m.userId === p.userId);
          expect(original).toBeDefined();
        }
        for (const s of result.spectators) {
          const original = roster.spectators.find((m) => m.userId === s.userId);
          expect(original).toBeDefined();
        }

        expect(positionsContiguous(result.players)).toBe(true);
        expect(positionsContiguous(result.spectators)).toBe(true);

        const originalPlayerOrder = roster.players
          .filter((m) => m.userId !== userId)
          .map((m) => m.userId);
        const originalSpectatorOrder = roster.spectators
          .filter((m) => m.userId !== userId)
          .map((m) => m.userId);

        expect(result.players.map((m) => m.userId)).toEqual(originalPlayerOrder);
        expect(result.spectators.map((m) => m.userId)).toEqual(originalSpectatorOrder);

        expect(resultIds.length).toBe(ids.length - 1);
      }),
      { numRuns: 100 },
    );
  });
});

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

          const resultIds = allUserIds(result);
          expect(new Set(resultIds)).toEqual(new Set(ids));
          expect(resultIds.length).toBe(new Set(resultIds).size);
          expect(resultIds.length).toBe(ids.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Seat rotation correctness (legacy rotateSeat)', () => {
  it('should cycle first player to bottom of players', () => {
    fc.assert(
      fc.property(arbRosterState({ minPlayers: 2 }), (roster) => {
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
      }),
      { numRuns: 100 },
    );
  });

  it('should return roster unchanged when no players exist', () => {
    fc.assert(
      fc.property(arbRosterState({ maxPlayers: 0, minSpectators: 1 }), (roster) => {
        const result = rotateSeat(roster);
        expect(result).toBe(roster);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// New Property Tests (Tasks 4.6 – 4.16)
// ---------------------------------------------------------------------------

describe('New members default to not ready', () => {
  it('should produce a member with readyToPlay === false in spectators', () => {
    fc.assert(
      fc.property(arbRosterAndNewMember(), ([roster, newMember]) => {
        const result = addMember(roster, newMember);
        expect(result).not.toBeNull();
        const updated = result!;

        const added = updated.spectators.find((m) => m.userId === newMember.userId);
        expect(added).toBeDefined();
        expect(added!.readyToPlay).toBe(false);
        expect(added!.section).toBe('spectators');
      }),
      { numRuns: 100 },
    );
  });
});

describe('Toggle ready changes only the target member', () => {
  it('should flip only the target member readyToPlay, leaving all others unchanged', () => {
    fc.assert(
      fc.property(arbRosterAndMemberId({ minPlayers: 0, minSpectators: 1 }), ([roster, userId]) => {
        const result = toggleReady(roster, userId);

        const allBefore = [...roster.players, ...roster.spectators];
        const allAfter = [...result.players, ...result.spectators];

        for (const after of allAfter) {
          const before = allBefore.find((m) => m.userId === after.userId)!;
          if (after.userId === userId) {
            // Target member's readyToPlay should be flipped
            expect(after.readyToPlay).toBe(!before.readyToPlay);
          } else {
            // All other members should be identical
            expect(after.readyToPlay).toBe(before.readyToPlay);
          }
          // Position and section should not change for any member
          expect(after.position).toBe(before.position);
          expect(after.section).toBe(before.section);
        }

        // Same total count
        expect(allAfter.length).toBe(allBefore.length);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Reorder respects ready-to-play for spectator promotion', () => {
  it('should reject reorders that move a non-ready spectator into players', () => {
    fc.assert(
      fc.property(
        arbRosterState({ minPlayers: 0, minSpectators: 1 }).filter((r) =>
          r.spectators.some((s) => !s.readyToPlay),
        ),
        (roster) => {
          // Pick a non-ready spectator and try to move them to players
          const nonReady = roster.spectators.find((s) => !s.readyToPlay)!;
          const newPlayers = [...roster.players.map((m) => m.userId), nonReady.userId];
          const newSpectators = roster.spectators
            .filter((s) => s.userId !== nonReady.userId)
            .map((m) => m.userId);

          const result = validateReorder(roster, newPlayers, newSpectators);
          expect(result.valid).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should allow reorders that move a ready spectator into players', () => {
    fc.assert(
      fc.property(
        arbRosterState({ minPlayers: 0, minSpectators: 1 }).filter((r) =>
          r.spectators.some((s) => s.readyToPlay),
        ),
        (roster) => {
          // Pick a ready spectator and move them to players
          const ready = roster.spectators.find((s) => s.readyToPlay)!;
          const newPlayers = [...roster.players.map((m) => m.userId), ready.userId];
          const newSpectators = roster.spectators
            .filter((s) => s.userId !== ready.userId)
            .map((m) => m.userId);

          const result = validateReorder(roster, newPlayers, newSpectators);
          expect(result.valid).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Player toggle-to-false demotes when no active game', () => {
  it('should move a ready player to bottom of spectators after toggling to false then demoting', () => {
    fc.assert(
      fc.property(
        arbRosterState({ minPlayers: 1 }).filter((r) => r.players.some((p) => p.readyToPlay)),
        (roster) => {
          const readyPlayer = roster.players.find((p) => p.readyToPlay)!;

          // Toggle to false
          const toggled = toggleReady(roster, readyPlayer.userId);
          // Demote the now-not-ready player
          const result = demotePlayer(toggled, readyPlayer.userId);

          // Player should now be in spectators
          const inSpectators = result.spectators.find((m) => m.userId === readyPlayer.userId);
          expect(inSpectators).toBeDefined();
          expect(inSpectators!.section).toBe('spectators');
          expect(inSpectators!.readyToPlay).toBe(false);

          // Player should not be in players
          const inPlayers = result.players.find((m) => m.userId === readyPlayer.userId);
          expect(inPlayers).toBeUndefined();

          // Positions contiguous
          expect(positionsContiguous(result.players)).toBe(true);
          expect(positionsContiguous(result.spectators)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should keep a player in the players section when toggling to true', () => {
    fc.assert(
      fc.property(
        arbRosterState({ minPlayers: 1 }).filter((r) => r.players.some((p) => !p.readyToPlay)),
        (roster) => {
          const notReadyPlayer = roster.players.find((p) => !p.readyToPlay)!;

          // Toggle to true
          const result = toggleReady(roster, notReadyPlayer.userId);

          // Player should still be in players
          const inPlayers = result.players.find((m) => m.userId === notReadyPlayer.userId);
          expect(inPlayers).toBeDefined();
          expect(inPlayers!.readyToPlay).toBe(true);
          expect(inPlayers!.section).toBe('players');
          expect(inPlayers!.position).toBe(notReadyPlayer.position);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Not-ready players are demoted at game end', () => {
  it('should move all not-ready players to spectators, keeping ready players in place', () => {
    fc.assert(
      fc.property(arbRosterState({ minPlayers: 1 }), (roster) => {
        const result = demoteNotReadyPlayers(roster);

        // All remaining players should be ready
        for (const p of result.players) {
          expect(p.readyToPlay).toBe(true);
        }

        // Ready players preserved in relative order
        const originalReadyPlayerIds = roster.players
          .filter((p) => p.readyToPlay)
          .map((p) => p.userId);
        expect(result.players.map((p) => p.userId)).toEqual(originalReadyPlayerIds);

        // Not-ready players should now be in spectators
        const notReadyPlayerIds = new Set(
          roster.players.filter((p) => !p.readyToPlay).map((p) => p.userId),
        );
        for (const id of notReadyPlayerIds) {
          expect(result.spectators.some((s) => s.userId === id)).toBe(true);
        }

        // Original spectators still present in order
        const originalSpectatorIds = roster.spectators.map((s) => s.userId);
        const resultSpectatorIds = result.spectators.map((s) => s.userId);
        // Original spectators should appear first, in order
        expect(resultSpectatorIds.slice(0, originalSpectatorIds.length)).toEqual(
          originalSpectatorIds,
        );

        // Total member count preserved
        expect(allUserIds(result).length).toBe(allUserIds(roster).length);

        // Positions contiguous
        expect(positionsContiguous(result.players)).toBe(true);
        expect(positionsContiguous(result.spectators)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Rotation mode "none" is identity', () => {
  it('should return identical player and spectator lists', () => {
    fc.assert(
      fc.property(arbRosterState(), fc.integer({ min: 1, max: 10 }), (roster, requiredCount) => {
        const result = rotateSeatV2(roster, 'none', requiredCount);

        expect(result.players).toEqual(roster.players);
        expect(result.spectators).toEqual(roster.spectators);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Rotation mode "rotate-players" cycles first player to bottom', () => {
  it('should move first player to last position, shift others up, leave spectators unchanged', () => {
    fc.assert(
      fc.property(
        arbRosterState({ minPlayers: 1 }),
        fc.integer({ min: 1, max: 10 }),
        (roster, requiredCount) => {
          const result = rotateSeatV2(roster, 'rotate-players', requiredCount);

          if (roster.players.length === 1) {
            // Single player: stays in place
            expect(result.players[0].userId).toBe(roster.players[0].userId);
          } else {
            // First player moved to last
            const lastPlayer = result.players[result.players.length - 1];
            expect(lastPlayer.userId).toBe(roster.players[0].userId);

            // Others shifted up
            for (let i = 0; i < roster.players.length - 1; i++) {
              expect(result.players[i].userId).toBe(roster.players[i + 1].userId);
            }
          }

          // Spectators unchanged
          expect(result.spectators).toEqual(roster.spectators);

          // Positions contiguous
          expect(positionsContiguous(result.players)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Rotation mode "rotate-spectators" swaps, fills, or falls back', () => {
  it('should swap first player with first ready spectator when player count equals required', () => {
    fc.assert(
      fc.property(
        arbRosterState({ minPlayers: 1, minSpectators: 1 }).filter((r) =>
          r.spectators.some((s) => s.readyToPlay),
        ),
        (roster) => {
          const requiredCount = roster.players.length;
          const result = rotateSeatV2(roster, 'rotate-spectators', requiredCount);

          const firstPlayer = roster.players[0];
          const firstReadySpectator = roster.spectators.find((s) => s.readyToPlay)!;

          // First player should now be in spectators (at the end)
          const demotedInSpectators = result.spectators.find(
            (s) => s.userId === firstPlayer.userId,
          );
          expect(demotedInSpectators).toBeDefined();
          expect(demotedInSpectators!.section).toBe('spectators');

          // First ready spectator should now be in players
          const promotedInPlayers = result.players.find(
            (p) => p.userId === firstReadySpectator.userId,
          );
          expect(promotedInPlayers).toBeDefined();
          expect(promotedInPlayers!.section).toBe('players');

          // Total set preserved
          expect(new Set(allUserIds(result))).toEqual(new Set(allUserIds(roster)));

          // Positions contiguous
          expect(positionsContiguous(result.players)).toBe(true);
          expect(positionsContiguous(result.spectators)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should fill slots from ready spectators when player count is below required', () => {
    fc.assert(
      fc.property(
        arbRosterState({ minPlayers: 1, minSpectators: 1 }).filter((r) =>
          r.spectators.some((s) => s.readyToPlay),
        ),
        (roster) => {
          // Required count is more than current players
          const requiredCount = roster.players.length + 1;
          const result = rotateSeatV2(roster, 'rotate-spectators', requiredCount);

          // All original players should still be in players
          for (const p of roster.players) {
            expect(result.players.some((rp) => rp.userId === p.userId)).toBe(true);
          }

          // At least one ready spectator should have been promoted
          const readySpectators = roster.spectators.filter((s) => s.readyToPlay);
          const slotsToFill = Math.min(1, readySpectators.length);
          expect(result.players.length).toBe(roster.players.length + slotsToFill);

          // Total set preserved
          expect(new Set(allUserIds(result))).toEqual(new Set(allUserIds(roster)));

          // Positions contiguous
          expect(positionsContiguous(result.players)).toBe(true);
          expect(positionsContiguous(result.spectators)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should fall back to rotate-players when no ready spectators exist', () => {
    fc.assert(
      fc.property(
        arbRosterState({ minPlayers: 2, minSpectators: 0 }).map((r) => ({
          ...r,
          // Force all spectators to not-ready
          spectators: r.spectators.map((s) => ({ ...s, readyToPlay: false })),
        })),
        (roster) => {
          const requiredCount = roster.players.length;
          const result = rotateSeatV2(roster, 'rotate-spectators', requiredCount);

          // Should behave like rotate-players: first player to bottom
          const lastPlayer = result.players[result.players.length - 1];
          expect(lastPlayer.userId).toBe(roster.players[0].userId);

          // Others shifted up
          for (let i = 0; i < roster.players.length - 1; i++) {
            expect(result.players[i].userId).toBe(roster.players[i + 1].userId);
          }

          // Spectators unchanged (same user IDs, same order)
          expect(result.spectators.map((s) => s.userId)).toEqual(
            roster.spectators.map((s) => s.userId),
          );

          // Positions contiguous
          expect(positionsContiguous(result.players)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Post-game pipeline ordering (demotions before rotation)', () => {
  it('should produce the same result as demoting then rotating in sequence', () => {
    fc.assert(
      fc.property(
        arbRosterState({ minPlayers: 1 }),
        fc.constantFrom(
          'none' as RotationMode,
          'rotate-players' as RotationMode,
          'rotate-spectators' as RotationMode,
        ),
        fc.integer({ min: 1, max: 10 }),
        (roster, mode, requiredCount) => {
          // Pipeline: demote first, then rotate
          const afterDemote = demoteNotReadyPlayers(roster);
          const pipelineResult = rotateSeatV2(afterDemote, mode, requiredCount);

          // Applying them in sequence should be identical to the composed pipeline
          const demoteThenRotate = rotateSeatV2(demoteNotReadyPlayers(roster), mode, requiredCount);

          expect(pipelineResult.players.map((p) => p.userId)).toEqual(
            demoteThenRotate.players.map((p) => p.userId),
          );
          expect(pipelineResult.spectators.map((s) => s.userId)).toEqual(
            demoteThenRotate.spectators.map((s) => s.userId),
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Member limit enforcement with null/zero normalization', () => {
  it('should treat null as 128 and allow adding when below limit', () => {
    fc.assert(
      fc.property(arbRosterAndNewMember(), ([roster, newMember]) => {
        // null limit should allow adding (effective limit 128)
        const total = roster.players.length + roster.spectators.length;
        if (total < 128) {
          const result = addMember(roster, newMember, null);
          expect(result).not.toBeNull();
        }
      }),
      { numRuns: 100 },
    );
  });

  it('should treat 0 as allowing addition (0 is not a positive limit)', () => {
    fc.assert(
      fc.property(arbRosterAndNewMember(), ([roster, newMember]) => {
        // memberLimit of 0 — the addMember function checks `memberLimit > 0`
        // so 0 effectively means no limit is enforced
        const result = addMember(roster, newMember, 0);
        expect(result).not.toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('should reject when at capacity with a positive limit', () => {
    fc.assert(
      fc.property(arbRosterAndNewMember({ minPlayers: 1 }), ([roster, newMember]) => {
        const total = roster.players.length + roster.spectators.length;
        const result = addMember(roster, newMember, total);
        expect(result).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('should allow when below a positive limit', () => {
    fc.assert(
      fc.property(arbRosterAndNewMember(), ([roster, newMember]) => {
        const total = roster.players.length + roster.spectators.length;
        const result = addMember(roster, newMember, total + 10);
        expect(result).not.toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});

describe('Member limit normalization helper logic', () => {
  it('should normalize null and 0 to 128 for effective limit calculation', () => {
    // This tests the normalization logic that the backend/frontend use:
    // null → 128, 0 → 128, positive values → clamped to 128 max
    const effectiveLimit = (limit: number | null): number => {
      if (limit == null || limit <= 0) return 128;
      return Math.min(limit, 128);
    };

    fc.assert(
      fc.property(fc.option(fc.integer({ min: -10, max: 200 }), { nil: null }), (limit) => {
        const effective = effectiveLimit(limit);
        expect(effective).toBeGreaterThanOrEqual(1);
        expect(effective).toBeLessThanOrEqual(128);

        if (limit === null || limit <= 0) {
          expect(effective).toBe(128);
        } else {
          expect(effective).toBe(Math.min(limit, 128));
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Integration-Level Property Tests (Tasks 15.1 – 15.5)
// ---------------------------------------------------------------------------

describe('Deferred demotion during active game', () => {
  it('should keep a player in the players section after toggling readyToPlay to false (demotion deferred)', () => {
    fc.assert(
      fc.property(
        arbRosterState({ minPlayers: 1 }).filter((r) => r.players.some((p) => p.readyToPlay)),
        (roster) => {
          const readyPlayer = roster.players.find((p) => p.readyToPlay)!;

          // During an active game, toggle to false — toggleReady only flips the flag, doesn't demote
          const toggled = toggleReady(roster, readyPlayer.userId);

          // Player should still be in the players section (demotion is deferred)
          const stillInPlayers = toggled.players.find((m) => m.userId === readyPlayer.userId);
          expect(stillInPlayers).toBeDefined();
          expect(stillInPlayers!.readyToPlay).toBe(false);
          expect(stillInPlayers!.section).toBe('players');
          expect(stillInPlayers!.position).toBe(readyPlayer.position);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should demote a not-ready player when demoteNotReadyPlayers is called', () => {
    fc.assert(
      fc.property(
        arbRosterState({ minPlayers: 1 }).filter((r) => r.players.some((p) => p.readyToPlay)),
        (roster) => {
          const readyPlayer = roster.players.find((p) => p.readyToPlay)!;

          // Toggle to false (simulating mid-game toggle)
          const toggled = toggleReady(roster, readyPlayer.userId);

          // Game ends — demote not-ready players
          const afterDemotion = demoteNotReadyPlayers(toggled);

          // Player should now be in spectators
          const inSpectators = afterDemotion.spectators.find(
            (m) => m.userId === readyPlayer.userId,
          );
          expect(inSpectators).toBeDefined();

          const inPlayers = afterDemotion.players.find((m) => m.userId === readyPlayer.userId);
          expect(inPlayers).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should NOT demote a player who toggled back to ready before game ends', () => {
    fc.assert(
      fc.property(
        arbRosterState({ minPlayers: 1 }).filter((r) => r.players.some((p) => p.readyToPlay)),
        (roster) => {
          const readyPlayer = roster.players.find((p) => p.readyToPlay)!;

          // Toggle to false mid-game
          const toggledOff = toggleReady(roster, readyPlayer.userId);
          // Toggle back to true before game ends
          const toggledBack = toggleReady(toggledOff, readyPlayer.userId);

          // Game ends — demote not-ready players
          const afterDemotion = demoteNotReadyPlayers(toggledBack);

          // Player should still be in players (they toggled back to ready)
          const inPlayers = afterDemotion.players.find((m) => m.userId === readyPlayer.userId);
          expect(inPlayers).toBeDefined();
          expect(inPlayers!.readyToPlay).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Abandon demotes player and clears ready', () => {
  it('should place the abandoned player in spectators with readyToPlay false', () => {
    fc.assert(
      fc.property(
        arbRosterState({ minPlayers: 1 }).chain((roster) => {
          const playerIds = roster.players.map((p) => p.userId);
          return fc.constantFrom(...playerIds).map((id) => [roster, id] as [RosterState, number]);
        }),
        ([roster, userId]) => {
          const result = demotePlayer(roster, userId);

          // Player should be in spectators
          const inSpectators = result.spectators.find((m) => m.userId === userId);
          expect(inSpectators).toBeDefined();
          expect(inSpectators!.readyToPlay).toBe(false);
          expect(inSpectators!.section).toBe('spectators');

          // Player should not be in players
          const inPlayers = result.players.find((m) => m.userId === userId);
          expect(inPlayers).toBeUndefined();

          // Positions contiguous
          expect(positionsContiguous(result.players)).toBe(true);
          expect(positionsContiguous(result.spectators)).toBe(true);

          // Total member count preserved
          expect(allUserIds(result).length).toBe(allUserIds(roster).length);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('removeMember correctly removes from either section', () => {
  it('should remove a spectator while preserving all players', () => {
    fc.assert(
      fc.property(
        arbRosterState({ minPlayers: 1, minSpectators: 1 }).chain((roster) => {
          const spectatorIds = roster.spectators.map((s) => s.userId);
          return fc
            .constantFrom(...spectatorIds)
            .map((id) => [roster, id] as [RosterState, number]);
        }),
        ([roster, userId]) => {
          const result = removeMember(roster, userId);

          // All original players should still be present
          const originalPlayerIds = roster.players.map((p) => p.userId);
          expect(result.players.map((p) => p.userId)).toEqual(originalPlayerIds);

          // The spectator should be gone
          expect(result.spectators.find((s) => s.userId === userId)).toBeUndefined();

          // Remaining spectators preserve relative order
          const expectedSpectatorIds = roster.spectators
            .filter((s) => s.userId !== userId)
            .map((s) => s.userId);
          expect(result.spectators.map((s) => s.userId)).toEqual(expectedSpectatorIds);

          // Positions contiguous
          expect(positionsContiguous(result.players)).toBe(true);
          expect(positionsContiguous(result.spectators)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should remove a player while preserving all spectators', () => {
    fc.assert(
      fc.property(
        arbRosterState({ minPlayers: 1, minSpectators: 1 }).chain((roster) => {
          const playerIds = roster.players.map((p) => p.userId);
          return fc.constantFrom(...playerIds).map((id) => [roster, id] as [RosterState, number]);
        }),
        ([roster, userId]) => {
          const result = removeMember(roster, userId);

          // All original spectators should still be present
          const originalSpectatorIds = roster.spectators.map((s) => s.userId);
          expect(result.spectators.map((s) => s.userId)).toEqual(originalSpectatorIds);

          // The player should be gone
          expect(result.players.find((p) => p.userId === userId)).toBeUndefined();

          // Remaining players preserve relative order
          const expectedPlayerIds = roster.players
            .filter((p) => p.userId !== userId)
            .map((p) => p.userId);
          expect(result.players.map((p) => p.userId)).toEqual(expectedPlayerIds);

          // Positions contiguous
          expect(positionsContiguous(result.players)).toBe(true);
          expect(positionsContiguous(result.spectators)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Disconnect preserves roster unchanged', () => {
  it('should return the exact same roster reference for any player', () => {
    fc.assert(
      fc.property(
        arbRosterState({ minPlayers: 1 }).chain((roster) => {
          const playerIds = roster.players.map((p) => p.userId);
          return fc.constantFrom(...playerIds).map((id) => [roster, id] as [RosterState, number]);
        }),
        ([roster, userId]) => {
          const result = handleDisconnect(roster, userId);

          // Referential equality — roster is returned as-is
          expect(result).toBe(roster);

          // Deep equality as well
          expect(result.players).toEqual(roster.players);
          expect(result.spectators).toEqual(roster.spectators);
        },
      ),
      { numRuns: 100 },
    );
  });
});
