import { cardsEqual, isTrump, sumPoints } from './cards';
import { FAIL_ACES, FAIL_TENS, TRUMP_ORDER } from './constants';
import { createShuffledDeck, deal, hasNoAceFaceTrump } from './dealing';
import { assignPartnerByRule, determinePartnerCalledAce } from './partners';
import { gotSchwarzed, pickingTeamPoints, scoreMultiplier } from './scoring';
import { evaluateTrick, legalPlays } from './tricks';
import {
  BuryEvent,
  CallAceEvent,
  Card,
  CardName,
  PassEvent,
  PickEvent,
  PickPhaseResult,
  PlayCardEvent,
  SheepsheadConfig,
  SheepsheadState,
  TrickState,
  UserID,
} from './types';

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
 * Retries automatically if noAceFaceTrump is enabled and a hand qualifies.
 */
export function handleDeal(state: SheepsheadState, config: SheepsheadConfig): SheepsheadState {
  const maxRetries = 100;
  let hands: Card[][] = [];
  let blind: Card[] = [];

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const deck = createShuffledDeck(config.cardsRemoved);
    const dealt = deal(deck, config);

    if (config.noAceFaceTrump && hasNoAceFaceTrump(dealt.hands)) {
      continue; // redeal
    }

    hands = dealt.hands;
    blind = dealt.blind;
    break;
  }

  if (hands.length === 0) {
    throw new Error('Unable to deal a valid hand after maximum retries');
  }

  let players = state.players.map((p, i) => ({
    ...p,
    hand: hands[i],
  }));

  const firstPlayerIdx = nextPlayerIndex(0, config.playerCount);

  // No picking round — assign partners by card holdings and go straight to play
  if (config.pickerRule === null) {
    if (config.partnerRule) {
      const stateWithRoles = assignPartnerByRule({ ...state, players }, config.partnerRule);
      players = stateWithRoles.players;
    }
    return {
      ...state,
      players,
      phase: 'play',
      blind,
      activePlayer: players[firstPlayerIdx].userID,
      trickNumber: 1,
      tricks: [{ plays: [], winner: null }],
    };
  }

  // Forced pick — player left of dealer must pick, go straight to bury
  if (config.pickerRule === 'left-of-dealer') {
    players[firstPlayerIdx].role = 'picker';
    players[firstPlayerIdx].hand = [...players[firstPlayerIdx].hand, ...blind];

    return {
      ...state,
      players,
      phase: 'bury',
      blind,
      activePlayer: players[firstPlayerIdx].userID,
    };
  }

  // Autonomous — normal pick phase
  return {
    ...state,
    players,
    phase: 'pick',
    blind,
    activePlayer: players[firstPlayerIdx].userID,
  };
}

/**
 * Pick phase: handle pick or pass decisions.
 * Returns a discriminated result indicating the outcome.
 */
export function handlePick(
  state: SheepsheadState,
  event: PickEvent | PassEvent,
  config: SheepsheadConfig,
): PickPhaseResult {
  const playerIdx = seatIndex(state, event.userID);

  if (event.type === 'pick') {
    const blind = state.blind ?? [];

    // Partner-draft: split blind between picker and partner (left of picker)
    if (config.name === 'partner-draft') {
      const half = Math.floor(blind.length / 2);
      const pickerBlind = blind.slice(0, half);
      const partnerBlind = blind.slice(half);
      const partnerIdx = nextPlayerIndex(playerIdx, state.players.length);

      const players = state.players.map((p, i) => {
        if (i === playerIdx) {
          return { ...p, role: 'picker' as const, hand: [...p.hand, ...pickerBlind] };
        }
        if (i === partnerIdx) {
          return { ...p, role: 'partner' as const, hand: [...p.hand, ...partnerBlind] };
        }
        return { ...p, role: 'opposition' as const };
      });

      return {
        outcome: 'continue',
        state: { ...state, players, phase: 'bury', activePlayer: event.userID },
      };
    }

    // Standard pick: picker takes the entire blind
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

    return {
      outcome: 'continue',
      state: { ...state, players, phase: 'bury', activePlayer: event.userID },
    };
  }

  // Pass: advance to next player
  const nextIdx = nextPlayerIndex(playerIdx, state.players.length);

  // Check if we've gone all the way around (next player is the first player after dealer)
  const firstPlayerIdx = nextPlayerIndex(0, state.players.length);
  if (nextIdx === firstPlayerIdx) {
    // All players passed — handle based on noPick rule
    switch (config.noPick!) {
      case 'forced-pick': {
        // Last player (the one who just passed) is forced to pick
        const blind = state.blind ?? [];
        const players = state.players.map((p, i) => {
          if (i === playerIdx) {
            return { ...p, role: 'picker' as const, hand: [...p.hand, ...blind] };
          }
          return p;
        });
        return {
          outcome: 'continue',
          state: { ...state, players, phase: 'bury', activePlayer: event.userID },
        };
      }
      case 'leaster':
      case 'moster':
      case 'mittler':
      case 'schneidster': {
        // Everyone plays for themselves
        const players = state.players.map((p) => ({
          ...p,
          role: 'opposition' as const,
        }));
        return {
          outcome: 'continue',
          state: {
            ...state,
            players,
            phase: 'play',
            noPick: config.noPick,
            activePlayer: players[firstPlayerIdx].userID,
            trickNumber: 1,
            tricks: [{ plays: [], winner: null }],
          },
        };
      }
      case 'schwanzer': {
        // Showdown — no tricks played, go straight to score
        const players = state.players.map((p) => ({
          ...p,
          role: 'opposition' as const,
        }));
        return {
          outcome: 'continue',
          state: {
            ...state,
            players,
            phase: 'score',
            noPick: 'schwanzer',
            activePlayer: null,
            scheduledEvents: [{ event: { type: 'game_scored' }, delayMs: 0 }],
          },
        };
      }
      case 'doubler': {
        // Re-deal with doubled stakes — record the hands that were passed on
        const redealRecord = {
          hands: state.players.map((p) => ({ userID: p.userID, hand: [...p.hand] })),
          blind: [...(state.blind ?? [])],
        };
        return {
          outcome: 'doubler-redeal',
          redeals: [...(state.redeals ?? []), redealRecord],
        };
      }
    }
  }

  return {
    outcome: 'continue',
    state: { ...state, activePlayer: state.players[nextIdx].userID },
  };
}

/**
 * Bury phase: player buries cards.
 * For partner-draft (left-of-picker), picker buries first, then partner.
 * Otherwise, only the picker buries, then transition to call or play.
 */
export function handleBury(
  state: SheepsheadState,
  event: BuryEvent,
  config: SheepsheadConfig,
): SheepsheadState {
  const buriedCards = event.payload.cards;
  const playerIdx = seatIndex(state, event.userID);
  const playerHand = state.players[playerIdx].hand;

  // Partner-draft: each player buries half the blind size
  const buryCount =
    config.name === 'partner-draft' ? Math.floor(config.blindSize / 2) : config.blindSize;

  if (buriedCards.length !== buryCount) {
    throw new Error(`Must bury exactly ${buryCount} cards, got ${buriedCards.length}`);
  }

  // Validate all buried cards are in the player's hand
  for (const bc of buriedCards) {
    if (!playerHand.some((c) => cardsEqual(c, bc))) {
      throw new Error(`Cannot bury ${bc.name} — not in hand`);
    }
  }

  // Remove buried cards from player's hand
  const newHand = playerHand.filter((c) => !buriedCards.some((b) => cardsEqual(b, c)));

  const players = state.players.map((p, i) => {
    if (i === playerIdx) return { ...p, hand: newHand };
    return p;
  });

  // Append to any previously buried cards (partner-draft has two bury actions)
  const buried = [...(state.buried ?? []), ...buriedCards];

  // Partner-draft: after picker buries, check if partner still needs to bury
  if (config.name === 'partner-draft') {
    const partner = players.find((p) => p.role === 'partner');
    if (partner && partner.hand.length > config.handSize) {
      return { ...state, players, buried, activePlayer: partner.userID };
    }
    // Both have buried — transition to play
    const firstPlayerIdx = nextPlayerIndex(0, state.players.length);
    return {
      ...state,
      players,
      buried,
      phase: 'play',
      activePlayer: players[firstPlayerIdx].userID,
      trickNumber: 1,
      tricks: [{ plays: [], winner: null }],
    };
  }

  if (config.partnerRule === 'called-ace') {
    // Need to call an ace — transition to call phase
    return { ...state, players, buried, phase: 'call', activePlayer: event.userID };
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
  return {
    ...newState,
    phase: 'play',
    activePlayer: newState.players[firstPlayerIdx].userID,
    trickNumber: 1,
    tricks: [{ plays: [], winner: null }],
  };
}

/**
 * Call phase: picker calls a card (ace, 10, or alone), partner determined (hidden).
 * Validates the call based on the picker's hand and buried cards.
 */
export function handleCall(
  state: SheepsheadState,
  event: CallAceEvent,
  config: SheepsheadConfig,
): SheepsheadState {
  const calledCard = event.payload.card;
  const pickerIdx = state.players.findIndex((p) => p.role === 'picker');
  const pickerHand = state.players[pickerIdx].hand;
  const buriedCards = state.buried ?? [];

  // Going alone — no partner
  if (calledCard === 'alone') {
    const players = state.players.map((p) =>
      p.role === 'picker' ? p : { ...p, role: 'opposition' as const },
    );
    const firstPlayerIdx = nextPlayerIndex(0, state.players.length);
    return {
      ...state,
      players,
      calledCard: 'alone',
      phase: 'play',
      activePlayer: players[firstPlayerIdx].userID,
      trickNumber: 1,
      tricks: [{ plays: [], winner: null }],
    };
  }

  // Validate calling a 10: picker must hold all 3 fail aces
  if (FAIL_TENS.includes(calledCard)) {
    const hasAllFailAces = FAIL_ACES.every((a) => pickerHand.some((c) => c.name === a));
    if (!hasAllFailAces) {
      throw new Error('Cannot call a 10 without holding all 3 fail aces');
    }
  }

  // Validate calling an ace: picker must not hold or have buried it (unless callOwnAce)
  if (FAIL_ACES.includes(calledCard) && !config.callOwnAce) {
    const pickerHasCard =
      pickerHand.some((c) => c.name === calledCard) ||
      buriedCards.some((c) => c.name === calledCard);
    if (pickerHasCard) {
      throw new Error(`Cannot call ${calledCard} — picker holds or buried it`);
    }
  }

  // Handle hole card (unknown ace condition)
  let hole: Card | null = null;
  let updatedPlayers = state.players;
  if (event.payload.holeCard) {
    hole = event.payload.holeCard;
    // Remove hole card from picker's hand
    updatedPlayers = state.players.map((p, i) => {
      if (i === pickerIdx) {
        return { ...p, hand: p.hand.filter((c) => !cardsEqual(c, hole!)) };
      }
      return p;
    });
  }

  // Determine partner — holder of the called card
  const partnerID = determinePartnerCalledAce(
    { ...state, players: updatedPlayers },
    calledCard as CardName,
  );

  const players = updatedPlayers.map((p) => {
    if (p.role === 'picker') return p;
    if (partnerID !== null && p.userID === partnerID) {
      return { ...p, role: 'partner' as const };
    }
    return { ...p, role: 'opposition' as const };
  });

  const firstPlayerIdx = nextPlayerIndex(0, state.players.length);

  return {
    ...state,
    players,
    calledCard,
    hole,
    phase: 'play',
    activePlayer: players[firstPlayerIdx].userID,
    trickNumber: 1,
    tricks: [{ plays: [], winner: null }],
  };
}

/**
 * Play phase: player plays a card to the current trick.
 */
export function handlePlayCard(
  state: SheepsheadState,
  event: PlayCardEvent,
  config: SheepsheadConfig,
): SheepsheadState {
  const card = event.payload.card;
  const playerIdx = seatIndex(state, event.userID);
  const currentTrickIdx = state.tricks.length - 1;
  const currentTrick = state.tricks[currentTrickIdx];

  const { cards: legal, playHoleCard } = legalPlays(state, config, event.userID);

  if (playHoleCard) {
    // Picker must play the hole card — validate the event card matches
    const holeCard = state.hole!;
    if (!cardsEqual(card, holeCard)) {
      throw new Error(`Must play hole card ${holeCard.name} when called suit is led`);
    }

    // Add hole card play to trick (face-down, no trick-taking power)
    const updatedTrick: TrickState = {
      ...currentTrick,
      plays: [...currentTrick.plays, { player: event.userID, card: holeCard, isHoleCard: true }],
    };

    const tricks = state.tricks.map((t, i) => (i === currentTrickIdx ? updatedTrick : t));

    // Clear hole from state
    const newState = { ...state, tricks, hole: null };

    // Check if trick is complete — continue with normal trick completion logic
    if (updatedTrick.plays.length === state.players.length) {
      return completeTrick(newState, updatedTrick, currentTrickIdx, tricks, state.players, config);
    }

    const nextIdx = nextPlayerIndex(playerIdx, state.players.length);
    return { ...newState, activePlayer: state.players[nextIdx].userID };
  }

  // Validate card is legal
  if (!legal.some((c) => cardsEqual(c, card))) {
    throw new Error(`Illegal play: ${card.name} by player ${event.userID}`);
  }

  // Remove card from player's hand
  const newHand = state.players[playerIdx].hand.filter((c) => !cardsEqual(c, card));
  const players = state.players.map((p, i) => {
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
    return completeTrick(state, updatedTrick, currentTrickIdx, tricks, players, config);
  }

  // Trick not complete — advance to next player
  const nextIdx = nextPlayerIndex(playerIdx, state.players.length);
  return { ...state, players, tricks, activePlayer: players[nextIdx].userID };
}

/**
 * Complete a trick: evaluate winner, update stats, set scheduledEvents for trick_advance.
 * Does NOT start a new trick or transition to score — that is handled by handleTrickAdvance.
 */
function completeTrick(
  state: SheepsheadState,
  updatedTrick: TrickState,
  currentTrickIdx: number,
  tricks: TrickState[],
  currentPlayers: SheepsheadState['players'],
  config: SheepsheadConfig,
): SheepsheadState {
  const winnerID = evaluateTrick(updatedTrick);
  const completedTrick: TrickState = { ...updatedTrick, winner: winnerID };

  const trickCards = completedTrick.plays.map((p) => p.card);
  const trickPoints = sumPoints(trickCards);

  // Update winner's stats
  let players = currentPlayers.map((p) => {
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

  // First-trick partner rule: winner of trick 1 becomes the partner
  if (config.partnerRule === 'first-trick' && state.trickNumber === 1) {
    players = players.map((p) => {
      if (p.role === 'picker') return p;
      if (p.userID === winnerID) return { ...p, role: 'partner' as const };
      return { ...p, role: 'opposition' as const };
    });
  }

  const completedTricks = tricks.map((t, i) => (i === currentTrickIdx ? completedTrick : t));

  // Leaster final trick: award blind points to winner BEFORE setting scheduledEvents
  const totalCards = players.reduce((sum, p) => sum + p.hand.length, 0);
  if (totalCards === 0 && state.noPick === 'leaster' && state.blind && state.blind.length > 0) {
    const blindPoints = sumPoints(state.blind);
    players = players.map((p) => {
      if (p.userID === winnerID) {
        return {
          ...p,
          pointsWon: p.pointsWon + blindPoints,
          cardsWon: [...p.cardsWon, ...state.blind!],
        };
      }
      return p;
    });
  }

  // Return pending state — trick is complete but no advancement yet
  return {
    ...state,
    players,
    tricks: completedTricks,
    activePlayer: null,
    scheduledEvents: [{ event: { type: 'trick_advance' }, delayMs: 2000 }],
  };
}

/**
 * Handle trick_advance event: start a new trick or transition to score.
 * Called after the trick-completion pause timer fires.
 */
export function handleTrickAdvance(state: SheepsheadState): SheepsheadState {
  const totalCards = state.players.reduce((sum, p) => sum + p.hand.length, 0);
  const lastTrick = state.tricks[state.tricks.length - 1];

  if (totalCards > 0) {
    // Cards remain — start a new trick
    return {
      ...state,
      scheduledEvents: undefined,
      trickNumber: state.trickNumber + 1,
      activePlayer: lastTrick.winner,
      tricks: [...state.tricks, { plays: [], winner: null }],
    };
  }

  // No cards remain — transition to score phase and chain scoring
  return {
    ...state,
    scheduledEvents: [{ event: { type: 'game_scored' }, delayMs: 0 }],
    phase: 'score' as const,
    activePlayer: null,
  };
}

/**
 * Score phase: compute final scores for all players.
 */
export function handleScore(state: SheepsheadState, config: SheepsheadConfig): SheepsheadState {
  switch (state.noPick) {
    case 'leaster':
      return handleLeasterScore(state);
    case 'moster':
      return handleMosterScore(state);
    case 'mittler':
      return handleMittlerScore(state);
    case 'schneidster':
      return handleSchneidsterScore(state);
    case 'schwanzer':
      return handleSchwanzerScore(state);
    default:
      break;
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

  // Partner off the hook: if picking team lost, took no tricks, and rule is enabled,
  // partner pays nothing — picker absorbs partner's share
  const partnerOffTheHook =
    config.partnerOffTheHook && !pickerWon && hasPartner && gotSchwarzed(state);

  const players = state.players.map((p, i) => {
    let scoreDelta = 0;

    if (i === pickerIdx) {
      if (partnerOffTheHook) {
        // Picker absorbs the partner's share too
        scoreDelta = sign * oppositionCount * baseScore;
      } else {
        const partnerShare = hasPartner ? baseScore : 0;
        scoreDelta = sign * (oppositionCount * baseScore - partnerShare);
      }
    } else if (i === partnerIdx) {
      scoreDelta = partnerOffTheHook ? 0 : sign * baseScore;
    } else {
      // Opposition
      scoreDelta = -sign * baseScore;
    }

    return { ...p, scoreDelta };
  });

  return { ...state, players };
}

/**
 * Leasters scoring: each player plays for themselves.
 * The player who takes the fewest points while still taking at least one trick wins.
 * If one player takes every trick (all others took none), that player wins.
 */
function handleLeasterScore(state: SheepsheadState): SheepsheadState {
  const eligible = state.players.filter((p) => p.tricksWon > 0);
  const winnerID = eligible.reduce((best, p) => (p.pointsWon < best.pointsWon ? p : best)).userID;

  const loserCount = state.players.length - 1;

  const players = state.players.map((p) => ({
    ...p,
    scoreDelta: p.userID === winnerID ? loserCount : -1,
  }));

  return { ...state, players };
}

/**
 * Moster scoring: the player who takes the most points is the only loser.
 * If a player takes every trick, they win instead.
 */
function handleMosterScore(state: SheepsheadState): SheepsheadState {
  const mostPoints = state.players.reduce((worst, p) =>
    p.pointsWon > worst.pointsWon ? p : worst,
  );

  // If the player with the most points took every trick, they win instead
  const totalTricks = state.players.reduce((sum, p) => sum + p.tricksWon, 0);
  const tookEveryTrick = mostPoints.tricksWon === totalTricks && totalTricks > 0;

  const winnerCount = state.players.length - 1;

  let players;
  if (tookEveryTrick) {
    // Player who took every trick wins
    players = state.players.map((p) => ({
      ...p,
      scoreDelta: p.userID === mostPoints.userID ? winnerCount : -1,
    }));
  } else {
    // Player with most points loses
    players = state.players.map((p) => ({
      ...p,
      scoreDelta: p.userID === mostPoints.userID ? -winnerCount : 1,
    }));
  }

  return { ...state, players };
}

/**
 * Mittler scoring: the player with the middle score wins.
 * For odd player counts, the positional middle of the sorted order.
 * For even player counts, ties among players can create a single middle
 * when the number of distinct score groups is odd.
 * If no single middle exists, or multiple players share the middle score, it's a wash.
 */
function handleMittlerScore(state: SheepsheadState): SheepsheadState {
  const sorted = [...state.players].sort((a, b) => a.pointsWon - b.pointsWon);
  const n = sorted.length;

  let middleScore: number;

  if (n % 2 === 1) {
    middleScore = sorted[Math.floor(n / 2)].pointsWon;
  } else {
    // Even player count — check distinct score groups for a single middle
    const distinctScores = [...new Set(sorted.map((p) => p.pointsWon))];
    if (distinctScores.length % 2 === 0) {
      const players = state.players.map((p) => ({ ...p, scoreDelta: 0 }));
      return { ...state, players };
    }
    middleScore = distinctScores[Math.floor(distinctScores.length / 2)];
  }

  // If multiple players share the middle score, it's a wash
  const middlePlayers = state.players.filter((p) => p.pointsWon === middleScore);
  if (middlePlayers.length !== 1) {
    const players = state.players.map((p) => ({ ...p, scoreDelta: 0 }));
    return { ...state, players };
  }

  const winnerID = middlePlayers[0].userID;
  const loserCount = n - 1;

  const players = state.players.map((p) => ({
    ...p,
    scoreDelta: p.userID === winnerID ? loserCount : -1,
  }));

  return { ...state, players };
}

/**
 * Schneidster scoring: the player closest to 30 points without going over wins.
 * If two players tie for closest, it's a wash (all 0).
 */
function handleSchneidsterScore(state: SheepsheadState): SheepsheadState {
  const eligible = state.players.filter((p) => p.pointsWon <= 30);

  if (eligible.length === 0) {
    // Nobody at or under 30 — wash
    const players = state.players.map((p) => ({ ...p, scoreDelta: 0 }));
    return { ...state, players };
  }

  const bestScore = Math.max(...eligible.map((p) => p.pointsWon));
  const tiedForBest = eligible.filter((p) => p.pointsWon === bestScore);

  if (tiedForBest.length > 1) {
    // Tie — wash
    const players = state.players.map((p) => ({ ...p, scoreDelta: 0 }));
    return { ...state, players };
  }

  const winnerID = tiedForBest[0].userID;
  const loserCount = state.players.length - 1;

  const players = state.players.map((p) => ({
    ...p,
    scoreDelta: p.userID === winnerID ? loserCount : -1,
  }));

  return { ...state, players };
}

/**
 * Schwanzer scoring: cards are laid face-up; no tricks are played.
 * The player with the greatest trump power loses.
 * Trump power: Queens = 3, Jacks = 2, Diamonds = 1.
 */
function handleSchwanzerScore(state: SheepsheadState): SheepsheadState {
  function trumpPower(player: SheepsheadState['players'][number]): number {
    return player.hand.reduce((power, c) => {
      if (!isTrump(c)) return power;
      if (c.rank === 'queen') return power + 3;
      if (c.rank === 'jack') return power + 2;
      return power + 1; // diamonds
    }, 0);
  }

  // Find the player's highest trump card (lowest index in TRUMP_ORDER = strongest)
  function highestTrumpRank(player: SheepsheadState['players'][number]): number {
    let best = TRUMP_ORDER.length; // worse than any trump
    for (const c of player.hand) {
      const idx = TRUMP_ORDER.indexOf(c.name);
      if (idx !== -1 && idx < best) best = idx;
    }
    return best;
  }

  const loserID = state.players.reduce((worst, p) => {
    const pPower = trumpPower(p);
    const wPower = trumpPower(worst);
    if (pPower > wPower) return p;
    if (pPower === wPower) {
      // Tiebreaker: player with highest trump card (lowest index) loses
      return highestTrumpRank(p) < highestTrumpRank(worst) ? p : worst;
    }
    return worst;
  }).userID;

  const winnerCount = state.players.length - 1;

  const players = state.players.map((p) => ({
    ...p,
    scoreDelta: p.userID === loserID ? -winnerCount : 1,
  }));

  return { ...state, players };
}
