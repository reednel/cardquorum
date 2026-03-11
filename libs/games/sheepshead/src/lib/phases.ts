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
  Card,
  CardName,
  CalledCard,
  Suit,
} from './types';
import { DECK, TRUMP_ORDER } from './constants';
import { createShuffledDeck, deal, hasNoAceFaceTrump } from './dealing';
import { cardsEqual, isTrump, sumPoints } from './cards';
import { evaluateTrick, legalPlays } from './tricks';
import { pickingTeamPoints, gotSchwarzed, scoreMultiplier } from './scoring';
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
 * Retries automatically if noAceFaceTrump is enabled and a hand qualifies.
 */
export function handleDeal(
  state: SheepsheadState,
  store: SheepsheadStore,
  config: SheepsheadConfig,
): Result {
  const maxRetries = 100;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const deck = createShuffledDeck(config.cardsRemoved);
    const { hands, blind } = deal(deck, config);

    if (config.noAceFaceTrump && hasNoAceFaceTrump(hands)) {
      continue; // redeal
    }

    let players = state.players.map((p, i) => ({
      ...p,
      hand: hands[i],
    }));

    const firstPlayerIdx = nextPlayerIndex(0, config.playerCount);

    // No picking round — assign partners by card holdings and go straight to play
    if (config.pickerRule === null) {
      if (config.partnerRule) {
        const withRoles = assignPartnerByRule({ ...state, players }, config.partnerRule);
        players = withRoles.players;
      }
      return [
        {
          ...state,
          players,
          phase: 'play',
          blind,
          activePlayer: players[firstPlayerIdx].userID,
          trickNumber: 1,
          tricks: [{ plays: [], winner: null }],
        },
        { ...store, blind: [...blind] },
      ];
    }

    // Forced pick — player left of dealer must pick, go straight to bury
    if (config.pickerRule === 'left-of-dealer') {
      players = players.map((p, i) => {
        if (i === firstPlayerIdx) {
          return { ...p, role: 'picker' as const, hand: [...p.hand, ...blind] };
        }
        return p;
      });
      return [
        {
          ...state,
          players,
          phase: 'bury',
          blind,
          activePlayer: players[firstPlayerIdx].userID,
        },
        { ...store, blind: [...blind] },
      ];
    }

    // Autonomous — normal pick phase
    return [
      { ...state, players, phase: 'pick', blind, activePlayer: players[firstPlayerIdx].userID },
      { ...store, blind: [...blind] },
    ];
  }

  // Fallback: deal without the check to avoid infinite loop
  const deck = createShuffledDeck(config.cardsRemoved);
  const { hands, blind } = deal(deck, config);
  const players = state.players.map((p, i) => ({ ...p, hand: hands[i] }));
  const firstPlayerIdx = nextPlayerIndex(0, config.playerCount);
  return [
    { ...state, players, phase: 'pick', blind, activePlayer: players[firstPlayerIdx].userID },
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

    return [{ ...state, players, phase: 'bury', activePlayer: event.userID }, store];
  }

  // Pass: advance to next player
  const nextIdx = nextPlayerIndex(playerIdx, state.players.length);

  // Check if we've gone all the way around (next player is the first player after dealer)
  const firstPlayerIdx = nextPlayerIndex(0, state.players.length);
  if (nextIdx === firstPlayerIdx) {
    // All players passed — handle based on noPick rule
    switch (config.noPick) {
      case 'forced-pick': {
        // Last player (the one who just passed) is forced to pick
        const blind = state.blind ?? [];
        const players = state.players.map((p, i) => {
          if (i === playerIdx) {
            return { ...p, role: 'picker' as const, hand: [...p.hand, ...blind] };
          }
          return p;
        });
        return [{ ...state, players, phase: 'bury', activePlayer: event.userID }, store];
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
        return [
          {
            ...state,
            players,
            phase: 'play',
            noPick: config.noPick,
            activePlayer: players[firstPlayerIdx].userID,
            trickNumber: 1,
            tricks: [{ plays: [], winner: null }],
          },
          { ...store, noPick: config.noPick },
        ];
      }
      case 'schwanzer': {
        // Showdown — no tricks played, go straight to score
        const players = state.players.map((p) => ({
          ...p,
          role: 'opposition' as const,
        }));
        return [
          {
            ...state,
            players,
            phase: 'score',
            noPick: 'schwanzer',
            activePlayer: null,
          },
          { ...store, noPick: 'schwanzer' },
        ];
      }
      case 'doubler': {
        // Re-deal with doubled stakes — record the hands that were passed on
        const redealRecord = {
          hands: state.players.map((p) => ({ userID: p.userID, hand: [...p.hand] })),
          blind: [...(state.blind ?? [])],
        };
        return [
          { ...state, previousGameDouble: true },
          { ...store, previousGameDouble: true, redeals: [...store.redeals, redealRecord] },
        ];
      }
      default:
        // Re-deal needed
        return null;
    }
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
      { ...state, players, buried, phase: 'call', activePlayer: event.userID },
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
      phase: 'play',
      activePlayer: newState.players[firstPlayerIdx].userID,
      trickNumber: 1,
      tricks: [{ plays: [], winner: null }],
    },
    { ...store, buried: [...buried] },
  ];
}

/** Get the suit of a called card. */
function calledCardSuit(calledCard: CalledCard): Suit | null {
  if (calledCard === 'alone') return null;
  const card = DECK.find((c) => c.name === calledCard);
  return card ? card.suit : null;
}

/** The three fail aces. */
const FAIL_ACES: CardName[] = ['ac', 'as', 'ah'];

/** The three fail 10s. */
const FAIL_TENS: CardName[] = ['xc', 'xs', 'xh'];

/** Fail suits (non-trump). */
const FAIL_SUITS: Suit[] = ['clubs', 'spades', 'hearts'];

/**
 * Call phase: picker calls a card (ace, 10, or alone), partner determined (hidden).
 * Validates the call based on the picker's hand and buried cards.
 */
export function handleCall(
  state: SheepsheadState,
  store: SheepsheadStore,
  event: CallAceEvent,
  config: SheepsheadConfig,
): Result {
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
    return [
      {
        ...state,
        players,
        calledCard: 'alone',
        phase: 'play',
        activePlayer: players[firstPlayerIdx].userID,
        trickNumber: 1,
        tricks: [{ plays: [], winner: null }],
      },
      { ...store, calledCard: 'alone' },
    ];
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
  let hole: CardName | null = null;
  let updatedPlayers = state.players;
  if (event.payload.holeCard) {
    hole = event.payload.holeCard;
    // Remove hole card from picker's hand
    updatedPlayers = state.players.map((p, i) => {
      if (i === pickerIdx) {
        return { ...p, hand: p.hand.filter((c) => c.name !== hole) };
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

  return [
    {
      ...state,
      players,
      calledCard,
      hole,
      phase: 'play',
      activePlayer: players[firstPlayerIdx].userID,
      trickNumber: 1,
      tricks: [{ plays: [], winner: null }],
    },
    { ...store, calledCard, hole },
  ];
}

/**
 * Whether the called suit has been led in any completed trick.
 */
function calledSuitHasBeenLed(state: SheepsheadState): boolean {
  if (!state.calledCard || state.calledCard === 'alone') return false;
  const suit = calledCardSuit(state.calledCard);
  if (!suit) return false;
  // Check completed tricks (those with a winner)
  return state.tricks.some(
    (t) =>
      t.plays.length > 0 &&
      !isTrump(t.plays[0].card) &&
      t.plays[0].card.suit === suit &&
      t.winner !== null,
  );
}

/**
 * Whether the current trick is being led with the called suit.
 */
function currentTrickLeadsCalledSuit(state: SheepsheadState, currentTrick: TrickState): boolean {
  if (!state.calledCard || state.calledCard === 'alone') return false;
  if (currentTrick.plays.length === 0) return false;
  const suit = calledCardSuit(state.calledCard);
  if (!suit) return false;
  const leadCard = currentTrick.plays[0].card;
  return !isTrump(leadCard) && leadCard.suit === suit;
}

/**
 * Apply called-ace constraints to narrow legal plays.
 * Returns the filtered set of legal cards, or null if the hole card must be played instead.
 */
function applyCalledAceConstraints(
  baseLegal: Card[],
  state: SheepsheadState,
  currentTrick: TrickState,
  playerRole: string | null,
  playerHand: Card[],
): { legal: Card[]; playHoleCard: boolean } {
  if (!state.calledCard || state.calledCard === 'alone') {
    return { legal: baseLegal, playHoleCard: false };
  }

  const suit = calledCardSuit(state.calledCard);
  if (!suit) return { legal: baseLegal, playHoleCard: false };

  const isFirstLead =
    !calledSuitHasBeenLed(state) && currentTrickLeadsCalledSuit(state, currentTrick);

  if (isFirstLead) {
    // Partner must play the called card
    if (playerRole === 'partner') {
      const calledCardInHand = baseLegal.find((c) => c.name === state.calledCard);
      if (calledCardInHand) {
        return { legal: [calledCardInHand], playHoleCard: false };
      }
    }

    // Picker with hole card: must play the hole card
    if (playerRole === 'picker' && state.hole) {
      return { legal: [], playHoleCard: true };
    }

    // Picker calling a 10: must play the ace of the called suit
    if (playerRole === 'picker' && FAIL_TENS.includes(state.calledCard)) {
      const aceOfSuit = ('a' + suit[0]) as CardName;
      const aceInHand = baseLegal.find((c) => c.name === aceOfSuit);
      if (aceInHand) {
        return { legal: [aceInHand], playHoleCard: false };
      }
    }
  }

  // Before the called suit has been led: picker cannot slough their last card of the called suit
  if (playerRole === 'picker' && !calledSuitHasBeenLed(state) && !isFirstLead && !state.hole) {
    const calledSuitCards = playerHand.filter((c) => !isTrump(c) && c.suit === suit);
    if (calledSuitCards.length === 1) {
      // Picker has exactly one card of the called suit — can't play it unless following suit
      const lastCard = calledSuitCards[0];
      const isFollowingSuit =
        currentTrick.plays.length > 0 &&
        !isTrump(currentTrick.plays[0].card) &&
        currentTrick.plays[0].card.suit === suit;
      if (!isFollowingSuit && baseLegal.length > 1) {
        return { legal: baseLegal.filter((c) => !cardsEqual(c, lastCard)), playHoleCard: false };
      }
    }
  }

  return { legal: baseLegal, playHoleCard: false };
}

/**
 * Play phase: player plays a card to the current trick.
 */
export function handlePlayCard(
  state: SheepsheadState,
  store: SheepsheadStore,
  event: PlayCardEvent,
  config: SheepsheadConfig,
): Result {
  const card = event.payload.card;
  const playerIdx = seatIndex(state, event.userID);
  const currentTrickIdx = state.tricks.length - 1;
  const currentTrick = state.tricks[currentTrickIdx];
  const playerRole = state.players[playerIdx].role;

  // Check if the hole card must be played instead
  const baseLegal = legalPlays(state.players[playerIdx].hand, currentTrick);
  const { legal, playHoleCard } =
    config.partnerRule === 'called-ace'
      ? applyCalledAceConstraints(
          baseLegal,
          state,
          currentTrick,
          playerRole,
          state.players[playerIdx].hand,
        )
      : { legal: baseLegal, playHoleCard: false };

  if (playHoleCard) {
    // Picker must play the hole card — validate the event card matches
    const holeCard = DECK.find((c) => c.name === state.hole);
    if (!holeCard || card.name !== holeCard.name) {
      throw new Error(`Must play hole card ${state.hole} when called suit is led`);
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
      return completeTrick(
        newState,
        store,
        updatedTrick,
        currentTrickIdx,
        tricks,
        state.players,
        config,
      );
    }

    const nextIdx = nextPlayerIndex(playerIdx, state.players.length);
    return [{ ...newState, activePlayer: state.players[nextIdx].userID }, store];
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
    return completeTrick(state, store, updatedTrick, currentTrickIdx, tricks, players, config);
  }

  // Trick not complete — advance to next player
  const nextIdx = nextPlayerIndex(playerIdx, state.players.length);
  return [{ ...state, players, tricks, activePlayer: players[nextIdx].userID }, store];
}

/**
 * Complete a trick: evaluate winner, update stats, check for game end.
 */
function completeTrick(
  state: SheepsheadState,
  store: SheepsheadStore,
  updatedTrick: TrickState,
  currentTrickIdx: number,
  tricks: TrickState[],
  currentPlayers: SheepsheadState['players'],
  config: SheepsheadConfig,
): Result {
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

  // Copy completed trick to store
  const storeTricks = [...store.tricks, completedTrick];

  // Check if all tricks played (account for hole card: picker may have fewer cards)
  const totalCards = players.reduce((sum, p) => sum + p.hand.length, 0);
  if (totalCards === 0) {
    // Leaster: last trick winner takes the blind points
    let finalPlayers = players;
    if (state.noPick === 'leaster' && state.blind && state.blind.length > 0) {
      const blindPoints = sumPoints(state.blind);
      finalPlayers = players.map((p) => {
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

    // All tricks played — transition to score
    return [
      {
        ...state,
        players: finalPlayers,
        tricks: completedTricks,
        phase: 'score',
        activePlayer: null,
      },
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

/**
 * Score phase: compute final scores for all players.
 */
export function handleScore(
  state: SheepsheadState,
  store: SheepsheadStore,
  config: SheepsheadConfig,
): Result {
  switch (state.noPick) {
    case 'leaster':
      return handleLeasterScore(state, store);
    case 'moster':
      return handleMosterScore(state, store);
    case 'mittler':
      return handleMittlerScore(state, store);
    case 'schneidster':
      return handleSchneidsterScore(state, store);
    case 'schwanzer':
      return handleSchwanzerScore(state, store);
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
 * Helper to build store players from state players for noPick scoring.
 */
function buildNoPickStorePlayers(
  store: SheepsheadStore,
  players: SheepsheadState['players'],
  winnerID: UserID | null,
): SheepsheadStore['players'] {
  return store.players.map((sp) => {
    const statePlayer = players.find((p) => p.userID === sp.userID);
    return {
      ...sp,
      won: statePlayer ? statePlayer.scoreDelta !== null && statePlayer.scoreDelta > 0 : false,
      scoreDelta: statePlayer?.scoreDelta ?? null,
    };
  });
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

/**
 * Moster scoring: the player who takes the most points is the only loser.
 * Everyone else wins. Zero-sum: loser pays 1 to each winner.
 */
function handleMosterScore(state: SheepsheadState, store: SheepsheadStore): Result {
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

  return [
    { ...state, players },
    { ...store, players: buildNoPickStorePlayers(store, players, null) },
  ];
}

/**
 * Mittler scoring: the player with the middle score wins.
 * If there's no single middle (even player count), it's a wash (all 0).
 * Zero-sum: winner receives 1 from each loser.
 */
function handleMittlerScore(state: SheepsheadState, store: SheepsheadStore): Result {
  const sorted = [...state.players].sort((a, b) => a.pointsWon - b.pointsWon);
  const n = sorted.length;

  // Even number of players — no single middle — wash
  if (n % 2 === 0) {
    const players = state.players.map((p) => ({ ...p, scoreDelta: 0 }));
    return [
      { ...state, players },
      { ...store, players: buildNoPickStorePlayers(store, players, null) },
    ];
  }

  const middleIdx = Math.floor(n / 2);
  const winnerID = sorted[middleIdx].userID;
  const loserCount = n - 1;

  const players = state.players.map((p) => ({
    ...p,
    scoreDelta: p.userID === winnerID ? loserCount : -1,
  }));

  return [
    { ...state, players },
    { ...store, players: buildNoPickStorePlayers(store, players, winnerID) },
  ];
}

/**
 * Schneidster scoring: the player closest to 30 points without going over wins.
 * If two players tie for closest, it's a wash (all 0).
 * Zero-sum: winner receives 1 from each loser.
 */
function handleSchneidsterScore(state: SheepsheadState, store: SheepsheadStore): Result {
  const eligible = state.players.filter((p) => p.pointsWon <= 30);

  if (eligible.length === 0) {
    // Nobody at or under 30 — wash
    const players = state.players.map((p) => ({ ...p, scoreDelta: 0 }));
    return [
      { ...state, players },
      { ...store, players: buildNoPickStorePlayers(store, players, null) },
    ];
  }

  const bestScore = Math.max(...eligible.map((p) => p.pointsWon));
  const tiedForBest = eligible.filter((p) => p.pointsWon === bestScore);

  if (tiedForBest.length > 1) {
    // Tie — wash
    const players = state.players.map((p) => ({ ...p, scoreDelta: 0 }));
    return [
      { ...state, players },
      { ...store, players: buildNoPickStorePlayers(store, players, null) },
    ];
  }

  const winnerID = tiedForBest[0].userID;
  const loserCount = state.players.length - 1;

  const players = state.players.map((p) => ({
    ...p,
    scoreDelta: p.userID === winnerID ? loserCount : -1,
  }));

  return [
    { ...state, players },
    { ...store, players: buildNoPickStorePlayers(store, players, winnerID) },
  ];
}

/**
 * Schwanzer scoring: cards are laid face-up; no tricks are played.
 * The player with the greatest trump power loses.
 * Trump power: Queens = 3, Jacks = 2, Diamonds = 1.
 * Zero-sum: loser pays 1 to each winner.
 */
function handleSchwanzerScore(state: SheepsheadState, store: SheepsheadStore): Result {
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

  return [
    { ...state, players },
    { ...store, players: buildNoPickStorePlayers(store, players, null) },
  ];
}
