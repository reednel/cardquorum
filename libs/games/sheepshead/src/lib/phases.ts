import {
  SheepsheadConfig,
  SheepsheadState,
  SheepsheadStore,
  PickEvent,
  PassEvent,
  BuryEvent,
  CallAceEvent,
  PlayCardEvent,
  UserID,
  TrickState,
} from './types';
import { PHASE } from './constants';
import { createShuffledDeck, deal } from './dealing';
import { cardsEqual, sumPoints } from './cards';
import { evaluateTrick, legalPlays } from './tricks';
import { pickingTeamPoints, scoreMultiplier } from './scoring';
import { determinePartnerCalledAce, assignPartnerByRule } from './partners';

type Result = [SheepsheadState, SheepsheadStore];

/**
 * Get the next player index in seat order (wraps around).
 */
function nextPlayerIndex(currentIndex: number, playerCount: number): number {
  return (currentIndex + 1) % playerCount;
}

/**
 * Find the seat index for a given userID.
 */
function seatIndex(state: SheepsheadState, userID: UserID): number {
  return state.players.findIndex((p) => p.userID === userID);
}

/**
 * Deal phase: shuffle deck, deal cards, set blind, transition to pick.
 */
export function handleDeal(
  state: SheepsheadState,
  store: SheepsheadStore,
  config: SheepsheadConfig,
): Result {
  const deck = createShuffledDeck();
  const { hands, blind } = deal(deck, config);

  const players = state.players.map((p, i) => ({
    ...p,
    hand: hands[i],
  }));

  // Player after dealer (index 0) goes first
  const firstPlayerIdx = nextPlayerIndex(0, config.playerCount);
  const activePlayer = players[firstPlayerIdx].userID;

  return [
    { ...state, players, phase: PHASE.pick, blind, activePlayer },
    { ...store, blind: [...blind] },
  ];
}

/**
 * Pick phase: handle pick or pass decisions.
 * Returns null if all players pass and a re-deal is needed (engine handles re-creation).
 */
export function handlePick(
  state: SheepsheadState,
  store: SheepsheadStore,
  event: PickEvent | PassEvent,
  config: SheepsheadConfig,
): Result | null {
  const playerIdx = seatIndex(state, event.userID);

  if (event.type === 'pick') {
    // Player picks up the blind
    const blind = state.blind ?? [];
    const players = state.players.map((p, i) => {
      if (i === playerIdx) {
        return {
          ...p,
          role: 'picker' as const,
          hand: [...p.hand, ...blind],
        };
      }
      return p;
    });

    return [{ ...state, players, phase: PHASE.bury, activePlayer: event.userID }, store];
  }

  // Pass: advance to next player
  const nextIdx = nextPlayerIndex(playerIdx, state.players.length);

  // Check if we've gone all the way around (next player is the first player after dealer)
  const firstPlayerIdx = nextPlayerIndex(0, state.players.length);
  if (nextIdx === firstPlayerIdx) {
    // All players passed
    if (config.noPick === 'leaster') {
      // Leasters: everyone plays for themselves
      const players = state.players.map((p) => ({
        ...p,
        role: 'opposition' as const,
      }));
      return [
        {
          ...state,
          players,
          phase: PHASE.play,
          noPick: 'leaster',
          activePlayer: players[firstPlayerIdx].userID,
          trickNumber: 1,
          tricks: [{ plays: [], winner: null }],
        },
        { ...store, noPick: 'leaster' },
      ];
    }

    // Re-deal needed (doublers or standard)
    return null;
  }

  return [{ ...state, activePlayer: state.players[nextIdx].userID }, store];
}

/**
 * Bury phase: picker buries cards, then transition to call or play.
 */
export function handleBury(
  state: SheepsheadState,
  store: SheepsheadStore,
  event: BuryEvent,
  config: SheepsheadConfig,
): Result {
  const buriedCards = event.payload.cards;
  const pickerIdx = seatIndex(state, event.userID);

  // Remove buried cards from picker's hand
  const newHand = state.players[pickerIdx].hand.filter(
    (c) => !buriedCards.some((b) => cardsEqual(b, c)),
  );

  const players = state.players.map((p, i) => {
    if (i === pickerIdx) return { ...p, hand: newHand };
    return p;
  });

  const buried = buriedCards;

  if (config.partnerRule === 'called-ace') {
    // Need to call an ace — transition to call phase
    return [
      { ...state, players, buried, phase: PHASE.call, activePlayer: event.userID },
      { ...store, buried: [...buried] },
    ];
  }

  // Assign partner by rule and transition to play
  let newState: SheepsheadState = { ...state, players, buried };

  // Assign roles: picker already set, assign opposition to everyone else initially
  newState = {
    ...newState,
    players: newState.players.map((p) =>
      p.role === 'picker' ? p : { ...p, role: 'opposition' as const },
    ),
  };

  // Then try to assign partner by rule
  if (config.partnerRule) {
    newState = assignPartnerByRule(newState, config.partnerRule);
  }

  const firstPlayerIdx = nextPlayerIndex(0, state.players.length);
  return [
    {
      ...newState,
      phase: PHASE.play,
      activePlayer: newState.players[firstPlayerIdx].userID,
      trickNumber: 1,
      tricks: [{ plays: [], winner: null }],
    },
    { ...store, buried: [...buried] },
  ];
}

/**
 * Call phase: picker calls an ace suit, partner determined (hidden).
 */
export function handleCall(
  state: SheepsheadState,
  store: SheepsheadStore,
  event: CallAceEvent,
): Result {
  const calledSuit = event.payload.suit;

  // Determine partner (holder of called ace) — don't reveal yet
  const partnerID = determinePartnerCalledAce(state, calledSuit);

  const players = state.players.map((p) => {
    if (p.role === 'picker') return p;
    if (partnerID !== null && p.userID === partnerID) {
      return { ...p, role: 'partner' as const };
    }
    return { ...p, role: 'opposition' as const };
  });

  const firstPlayerIdx = nextPlayerIndex(0, state.players.length);

  return [
    {
      ...state,
      players,
      calledSuit,
      phase: PHASE.play,
      activePlayer: players[firstPlayerIdx].userID,
      trickNumber: 1,
      tricks: [{ plays: [], winner: null }],
    },
    { ...store, calledSuit },
  ];
}

/**
 * Play phase: player plays a card to the current trick.
 */
export function handlePlayCard(
  state: SheepsheadState,
  store: SheepsheadStore,
  event: PlayCardEvent,
  _config: SheepsheadConfig,
): Result {
  const card = event.payload.card;
  const playerIdx = seatIndex(state, event.userID);
  const currentTrickIdx = state.tricks.length - 1;
  const currentTrick = state.tricks[currentTrickIdx];

  // Validate card is legal
  const legal = legalPlays(state.players[playerIdx].hand, currentTrick);
  if (!legal.some((c) => cardsEqual(c, card))) {
    throw new Error(`Illegal play: ${card.name} by player ${event.userID}`);
  }

  // Remove card from player's hand
  const newHand = state.players[playerIdx].hand.filter((c) => !cardsEqual(c, card));
  let players = state.players.map((p, i) => {
    if (i === playerIdx) return { ...p, hand: newHand };
    return p;
  });

  // Add play to current trick
  const updatedTrick: TrickState = {
    ...currentTrick,
    plays: [...currentTrick.plays, { player: event.userID, card }],
  };

  const tricks = state.tricks.map((t, i) => (i === currentTrickIdx ? updatedTrick : t));

  // Check if trick is complete
  if (updatedTrick.plays.length === state.players.length) {
    // Evaluate winner
    const winnerID = evaluateTrick(updatedTrick);
    const completedTrick: TrickState = { ...updatedTrick, winner: winnerID };

    const trickCards = completedTrick.plays.map((p) => p.card);
    const trickPoints = sumPoints(trickCards);

    // Update winner's stats
    players = players.map((p) => {
      if (p.userID === winnerID) {
        return {
          ...p,
          tricksWon: p.tricksWon + 1,
          pointsWon: p.pointsWon + trickPoints,
          cardsWon: [...p.cardsWon, ...trickCards],
        };
      }
      return p;
    });

    const completedTricks = tricks.map((t, i) => (i === currentTrickIdx ? completedTrick : t));

    // Copy completed trick to store
    const storeTricks = [...store.tricks, completedTrick];

    // Check if all tricks played
    const totalCards = players.reduce((sum, p) => sum + p.hand.length, 0);
    if (totalCards === 0) {
      // All tricks played — transition to score
      return [
        { ...state, players, tricks: completedTricks, phase: PHASE.score, activePlayer: null },
        { ...store, tricks: storeTricks },
      ];
    }

    // Start new trick, winner leads
    return [
      {
        ...state,
        players,
        tricks: [...completedTricks, { plays: [], winner: null }],
        trickNumber: (state.trickNumber ?? 0) + 1,
        activePlayer: winnerID,
      },
      { ...store, tricks: storeTricks },
    ];
  }

  // Trick not complete — advance to next player
  const nextIdx = nextPlayerIndex(playerIdx, state.players.length);
  return [{ ...state, players, tricks, activePlayer: players[nextIdx].userID }, store];
}

/**
 * Score phase: compute final scores for all players.
 */
export function handleScore(
  state: SheepsheadState,
  store: SheepsheadStore,
  config: SheepsheadConfig,
): Result {
  if (state.noPick === 'leaster') {
    return handleLeasterScore(state, store);
  }

  const pickerPts = pickingTeamPoints(state);
  const pickerWon = pickerPts >= 61;
  const multiplier = scoreMultiplier(state, config);

  // Find picker and partner
  const pickerIdx = state.players.findIndex((p) => p.role === 'picker');
  const partnerIdx = state.players.findIndex((p) => p.role === 'partner');
  const oppositionCount = state.players.filter((p) => p.role === 'opposition').length;
  const hasPartner = partnerIdx !== -1;

  // Zero-sum scoring:
  // Each opponent pays/receives baseScore.
  // If partner: partner gets/pays baseScore, picker gets/pays the remainder.
  // If no partner: picker gets/pays all.
  const baseScore = multiplier;
  const sign = pickerWon ? 1 : -1;

  const players = state.players.map((p, i) => {
    let scoreDelta = 0;

    if (i === pickerIdx) {
      const partnerShare = hasPartner ? baseScore : 0;
      scoreDelta = sign * (oppositionCount * baseScore - partnerShare);
    } else if (i === partnerIdx) {
      scoreDelta = sign * baseScore;
    } else {
      // Opposition
      scoreDelta = -sign * baseScore;
    }

    return { ...p, scoreDelta };
  });

  const storePlayers = store.players.map((sp) => {
    const statePlayer = players.find((p) => p.userID === sp.userID);
    return {
      ...sp,
      role: statePlayer?.role ?? null,
      won: statePlayer ? statePlayer.scoreDelta !== null && statePlayer.scoreDelta > 0 : null,
      scoreDelta: statePlayer?.scoreDelta ?? null,
    };
  });

  return [
    { ...state, players },
    { ...store, players: storePlayers },
  ];
}

/**
 * Leasters scoring: each player plays for themselves.
 * The player who takes the fewest points wins.
 * If a player takes no tricks, the player who takes the most points wins.
 */
function handleLeasterScore(state: SheepsheadState, store: SheepsheadStore): Result {
  // In leasters, the player with the fewest points wins
  // unless someone took no tricks — then the player with the most points wins
  const noTrickPlayers = state.players.filter((p) => p.tricksWon === 0);

  let winnerID: UserID;
  if (noTrickPlayers.length > 0) {
    // Someone took no tricks — player with most points wins
    winnerID = state.players.reduce((best, p) => (p.pointsWon > best.pointsWon ? p : best)).userID;
  } else {
    // Player with fewest points wins
    winnerID = state.players.reduce((best, p) => (p.pointsWon < best.pointsWon ? p : best)).userID;
  }

  const loserCount = state.players.length - 1;

  const players = state.players.map((p) => ({
    ...p,
    scoreDelta: p.userID === winnerID ? loserCount : -1,
  }));

  const storePlayers = store.players.map((sp) => {
    const statePlayer = players.find((p) => p.userID === sp.userID);
    return {
      ...sp,
      won: statePlayer?.userID === winnerID ? true : false,
      scoreDelta: statePlayer?.scoreDelta ?? null,
    };
  });

  return [
    { ...state, players },
    { ...store, players: storePlayers },
  ];
}
