import type { RosterMember, RosterState } from '@cardquorum/shared';

/**
 * Adds a member to the bottom of the spectators list.
 * Returns null if memberLimit is reached.
 */
export function addMember(
  roster: RosterState,
  member: RosterMember,
  memberLimit?: number | null,
): RosterState | null {
  const totalMembers = roster.players.length + roster.spectators.length;

  if (memberLimit != null && memberLimit > 0 && totalMembers >= memberLimit) {
    return null;
  }

  const position = roster.spectators.length;
  const newMember: RosterMember = {
    ...member,
    section: 'spectators',
    position,
  };

  return {
    ...roster,
    spectators: [...roster.spectators, newMember],
  };
}

/**
 * Removes a member from whichever list they're in.
 * Reindexes positions to be contiguous from 0.
 * Preserves relative order.
 */
export function removeMember(roster: RosterState, userId: number): RosterState {
  const reindex = (members: RosterMember[]): RosterMember[] =>
    members.filter((m) => m.userId !== userId).map((m, i) => ({ ...m, position: i }));

  return {
    ...roster,
    players: reindex(roster.players),
    spectators: reindex(roster.spectators),
  };
}

/**
 * Takes new ordered lists of user IDs and rebuilds the roster.
 * Validates all members are present (same set).
 * Returns the original roster unchanged if validation fails.
 */
export function reorderRoster(
  roster: RosterState,
  players: number[],
  spectators: number[],
): RosterState {
  const allCurrent = [
    ...roster.players.map((m) => m.userId),
    ...roster.spectators.map((m) => m.userId),
  ];
  const allNew = [...players, ...spectators];

  // Validate same set of members (no duplicates, no missing)
  if (allCurrent.length !== allNew.length) {
    return roster;
  }

  const currentSet = new Set(allCurrent);
  const newSet = new Set(allNew);

  if (newSet.size !== allNew.length) {
    return roster; // duplicates in new lists
  }

  for (const id of allNew) {
    if (!currentSet.has(id)) {
      return roster; // unknown member
    }
  }

  // Build a lookup from userId to member info
  const memberMap = new Map<number, RosterMember>();
  for (const m of [...roster.players, ...roster.spectators]) {
    memberMap.set(m.userId, m);
  }

  const newPlayers: RosterMember[] = players.map((id, i) => ({
    ...memberMap.get(id)!,
    section: 'players' as const,
    position: i,
  }));

  const newSpectators: RosterMember[] = spectators.map((id, i) => ({
    ...memberMap.get(id)!,
    section: 'spectators' as const,
    position: i,
  }));

  return {
    ...roster,
    players: newPlayers,
    spectators: newSpectators,
  };
}

/**
 * Rotates the seat order after a game ends.
 *
 * If rotatePlayers enabled AND spectators non-empty:
 *   Move first player to bottom of spectators, first spectator to bottom of players.
 * If rotatePlayers disabled OR spectators empty:
 *   Move first player to bottom of players.
 *
 * Preserves total member set.
 */
export function rotateSeat(roster: RosterState): RosterState {
  if (roster.players.length === 0) {
    return roster;
  }

  const [firstPlayer, ...restPlayers] = roster.players;

  if (roster.rotatePlayers && roster.spectators.length > 0) {
    const [firstSpectator, ...restSpectators] = roster.spectators;

    const newPlayers = [...restPlayers, { ...firstSpectator, section: 'players' as const }].map(
      (m, i) => ({ ...m, position: i }),
    );

    const newSpectators = [
      ...restSpectators,
      { ...firstPlayer, section: 'spectators' as const },
    ].map((m, i) => ({ ...m, position: i }));

    return {
      ...roster,
      players: newPlayers,
      spectators: newSpectators,
    };
  }

  // rotatePlayers disabled OR spectators empty: cycle first player to bottom
  const newPlayers = [...restPlayers, firstPlayer].map((m, i) => ({
    ...m,
    position: i,
  }));

  return {
    ...roster,
    players: newPlayers,
  };
}

/**
 * Identity function — disconnect does not modify roster per design.
 */
export function handleDisconnect(roster: RosterState, _userId: number): RosterState {
  return roster;
}
