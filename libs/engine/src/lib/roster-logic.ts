import type { RosterMember, RosterState, RotationMode } from '@cardquorum/shared';

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
 * Legacy rotation — cycles first player to bottom of players list.
 * Kept for backward compatibility. Use rotateSeatV2 for new code.
 */
export function rotateSeat(roster: RosterState): RosterState {
  if (roster.players.length === 0) {
    return roster;
  }

  const [firstPlayer, ...restPlayers] = roster.players;
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

/**
 * Toggle readyToPlay for a single member. Returns updated roster.
 * Works for members in either players or spectators section.
 */
export function toggleReady(roster: RosterState, userId: number): RosterState {
  const flipReady = (members: RosterMember[]): RosterMember[] =>
    members.map((m) => (m.userId === userId ? { ...m, readyToPlay: !m.readyToPlay } : m));

  return {
    ...roster,
    players: flipReady(roster.players),
    spectators: flipReady(roster.spectators),
  };
}

/**
 * Demote a player to the bottom of spectators.
 * Sets readyToPlay to false. Reindexes positions.
 */
export function demotePlayer(roster: RosterState, userId: number): RosterState {
  const player = roster.players.find((m) => m.userId === userId);
  if (!player) {
    return roster;
  }

  const remainingPlayers = roster.players
    .filter((m) => m.userId !== userId)
    .map((m, i) => ({ ...m, position: i }));

  const demoted: RosterMember = {
    ...player,
    section: 'spectators' as const,
    readyToPlay: false,
    position: roster.spectators.length,
  };

  const newSpectators = [...roster.spectators, demoted].map((m, i) => ({ ...m, position: i }));

  return {
    ...roster,
    players: remainingPlayers,
    spectators: newSpectators,
  };
}

/**
 * Demote all players with readyToPlay === false to spectators.
 * Preserves relative order of remaining players and existing spectators.
 */
export function demoteNotReadyPlayers(roster: RosterState): RosterState {
  const readyPlayers: RosterMember[] = [];
  const demotedPlayers: RosterMember[] = [];

  for (const p of roster.players) {
    if (p.readyToPlay) {
      readyPlayers.push(p);
    } else {
      demotedPlayers.push({ ...p, section: 'spectators' as const, readyToPlay: false });
    }
  }

  const newPlayers = readyPlayers.map((m, i) => ({ ...m, position: i }));
  const newSpectators = [...roster.spectators, ...demotedPlayers].map((m, i) => ({
    ...m,
    position: i,
  }));

  return {
    ...roster,
    players: newPlayers,
    spectators: newSpectators,
  };
}

/**
 * V2 rotation supporting three modes.
 * - 'none': no changes (identity)
 * - 'rotate-players': cycle first player to bottom of players
 * - 'rotate-spectators': swap/fill/fallback logic based on ready spectators
 */
export function rotateSeatV2(
  roster: RosterState,
  mode: RotationMode,
  requiredPlayerCount: number,
): RosterState {
  if (mode === 'none' || roster.players.length === 0) {
    return roster;
  }

  if (mode === 'rotate-players') {
    const [first, ...rest] = roster.players;
    const newPlayers = [...rest, first].map((m, i) => ({ ...m, position: i }));
    return { ...roster, players: newPlayers };
  }

  // mode === 'rotate-spectators'
  const readySpectators = roster.spectators.filter((s) => s.readyToPlay);

  // No ready spectators → fall back to rotate-players behavior
  if (readySpectators.length === 0) {
    const [first, ...rest] = roster.players;
    const newPlayers = [...rest, first].map((m, i) => ({ ...m, position: i }));
    return { ...roster, players: newPlayers };
  }

  const playerCount = roster.players.length;

  if (playerCount >= requiredPlayerCount) {
    // Swap: move first player to bottom of spectators, first ready spectator into players
    const [firstPlayer, ...restPlayers] = roster.players;
    const firstReadySpectator = readySpectators[0];

    const promoted: RosterMember = {
      ...firstReadySpectator,
      section: 'players' as const,
    };

    const demoted: RosterMember = {
      ...firstPlayer,
      section: 'spectators' as const,
    };

    const newPlayers = [...restPlayers, promoted].map((m, i) => ({ ...m, position: i }));

    const newSpectators = [
      ...roster.spectators.filter((s) => s.userId !== firstReadySpectator.userId),
      demoted,
    ].map((m, i) => ({ ...m, position: i }));

    return { ...roster, players: newPlayers, spectators: newSpectators };
  }

  // playerCount < requiredPlayerCount: fill available slots from ready spectators
  const slotsToFill = requiredPlayerCount - playerCount;
  const toPromote = readySpectators.slice(0, slotsToFill);
  const promoteIds = new Set(toPromote.map((s) => s.userId));

  const promoted = toPromote.map((s) => ({
    ...s,
    section: 'players' as const,
  }));

  const newPlayers = [...roster.players, ...promoted].map((m, i) => ({ ...m, position: i }));
  const newSpectators = roster.spectators
    .filter((s) => !promoteIds.has(s.userId))
    .map((m, i) => ({ ...m, position: i }));

  return { ...roster, players: newPlayers, spectators: newSpectators };
}

/**
 * Validate a reorder request, rejecting moves of non-ready spectators into players.
 */
export function validateReorder(
  roster: RosterState,
  newPlayers: number[],
  newSpectators: number[],
): { valid: true } | { valid: false; reason: string } {
  // Build a map of current spectators and their readyToPlay status
  const spectatorReadyMap = new Map<number, boolean>();
  for (const s of roster.spectators) {
    spectatorReadyMap.set(s.userId, s.readyToPlay);
  }

  // Check if any current spectator is being moved to players without being ready
  for (const playerId of newPlayers) {
    const wasSpectator = spectatorReadyMap.has(playerId);
    if (wasSpectator && !spectatorReadyMap.get(playerId)) {
      return { valid: false, reason: 'Cannot move non-ready spectator to players' };
    }
  }

  return { valid: true };
}
