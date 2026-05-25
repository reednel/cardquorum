import { ApplyEventResult, GamePlugin, PlayerStatRow } from '@cardquorum/engine';
import { formatCard } from './cards';
import { SheepsheadConfigSchema } from './config';
import { DECK } from './constants';
import {
  handleBury,
  handleCall,
  handleDeal,
  handlePick,
  handlePlayCard,
  handlePlayHole,
  handleScore,
  handleTrickAdvance,
  legalCallOptions,
  requiresHoleCard,
} from './phases';
import { scoreMultiplier } from './scoring';
import { legalPlays } from './tricks';
import {
  BlitzState,
  Card,
  DealEventPayload,
  SheepsheadConfig,
  SheepsheadEvent,
  SheepsheadEventType,
  SheepsheadState,
  SheepsheadStore,
  TrickState,
  UserID,
} from './types';

function validateConfig(config: unknown): config is SheepsheadConfig {
  return SheepsheadConfigSchema.safeParse(config).success;
}

function createInitialState(config: SheepsheadConfig, userIDs: UserID[]): SheepsheadState {
  return {
    players: userIDs.map((id) => ({
      userID: id,
      role: null,
      hand: [],
      tricksWon: 0,
      pointsWon: 0,
      cardsWon: [],
      scoreDelta: null,
    })),
    phase: 'deal',
    trickNumber: 0,
    activePlayer: userIDs[0],
    blind: [],
    buried: [],
    calledCard: null,
    hole: null,
    tricks: [],
    crack: null,
    blitz: null,
    previousGameDouble: null,
    noPick: null,
    redeals: null,
  };
}

/**
 * Whether a player had a chance to pick/pass during the pick phase.
 * Pick order goes from seat 1 (left of dealer) clockwise back to seat 0.
 * Players up to and including the picker in this order had a chance.
 */
function hadChanceToPick(state: SheepsheadState, playerIdx: number): boolean {
  const pickerIdx = state.players.findIndex((p) => p.role === 'picker');
  if (pickerIdx === -1) return false;
  const n = state.players.length;
  // Position in pick order: seat 1 is position 0, seat 2 is position 1, ..., seat 0 is last
  const playerPickPos = (playerIdx - 1 + n) % n;
  const pickerPickPos = (pickerIdx - 1 + n) % n;
  return playerPickPos <= pickerPickPos;
}

function getValidActions(
  config: SheepsheadConfig,
  state: SheepsheadState,
  userID: UserID,
): SheepsheadEventType[] {
  const player = state.players.find((p) => p.userID === userID);
  const actions: SheepsheadEventType[] = [];

  switch (state.phase) {
    case 'deal':
      return state.activePlayer === userID ? ['deal'] : [];
    case 'pick':
      if (state.activePlayer === userID) {
        actions.push('pick');
        // In forced-pick, the dealer (last in pick order) cannot pass
        const playerIdx = state.players.findIndex((p) => p.userID === userID);
        if (!(config.noPick === 'forced-pick' && playerIdx === 0)) {
          actions.push('pass');
        }
      }
      return actions;
    case 'bury':
      return state.activePlayer === userID ? ['bury'] : [];
    case 'call':
      return state.activePlayer === userID ? ['call_ace'] : [];
    case 'play': {
      // Pending state: last trick has a winner and no subsequent empty trick exists
      if (state.tricks.length > 0 && state.tricks[state.tricks.length - 1].winner !== null) {
        return [];
      }

      if (state.activePlayer === userID) {
        // Check if the picker must play the hole card
        const { playHoleCard } = legalPlays(state, config, userID);
        if (playHoleCard) {
          actions.push('play_hole');
        } else {
          actions.push('play_card');
        }
      }

      // Before first card: crack, re-crack, and blitz are available
      const beforeFirstCard =
        state.trickNumber === 1 && state.tricks.length === 1 && state.tricks[0].plays.length === 0;

      if (beforeFirstCard) {
        // Crack: opposition player who didn't get a chance to pick
        if (config.cracking && !state.crack && player?.role === 'opposition') {
          const playerIdx = state.players.findIndex((p) => p.userID === userID);
          if (!hadChanceToPick(state, playerIdx)) {
            actions.push('crack');
          }
        }

        // Re-crack: picker or partner can respond to a crack
        if (
          config.cracking &&
          state.crack &&
          !state.crack.reCrackedBy &&
          (player?.role === 'picker' || player?.role === 'partner')
        ) {
          actions.push('re_crack');
        }

        // Blitz: any player holding both black or red queens
        if (config.blitzing && !state.blitz && player) {
          const hasBlackQueens =
            player.hand.some((c) => c.name === 'qc') && player.hand.some((c) => c.name === 'qs');
          const hasRedQueens =
            player.hand.some((c) => c.name === 'qh') && player.hand.some((c) => c.name === 'qd');
          if (hasBlackQueens || hasRedQueens) {
            actions.push('blitz');
          }
        }
      }

      return actions;
    }
    case 'score':
      return [];
    default:
      return [];
  }
}

function applyEvent(
  config: SheepsheadConfig,
  state: SheepsheadState,
  event: SheepsheadEvent,
): ApplyEventResult<SheepsheadState> {
  switch (event.type) {
    case 'deal': {
      // Replay path: if payload already contains hands and blind, use them deterministically
      const { state: newState, dealPayload } = handleDeal(state, config, event.payload);
      // If the event already had a payload (replay), no sideEffects needed
      // If it didn't (live play), return the generated deal as sideEffects for storage
      const hasDealData = event.payload?.hands && event.payload?.blind;
      return hasDealData ? { state: newState } : { state: newState, sideEffects: dealPayload };
    }
    case 'pick':
    case 'pass': {
      const result = handlePick(state, event, config);
      if (result.outcome === 'doubler-redeal') {
        const userIDs = state.players.map((p) => p.userID);
        const freshState = createInitialState(config, userIDs);
        freshState.previousGameDouble = true;
        freshState.redeals = result.redeals;
        // Replay path: if event has a dealPayload (stored sideEffects), use it
        const replayPayload = (event as { dealPayload?: DealEventPayload }).dealPayload;
        const { state: newState, dealPayload } = handleDeal(freshState, config, replayPayload);
        // If replay payload was provided, no sideEffects needed; otherwise return for storage
        return replayPayload
          ? { state: newState }
          : { state: newState, sideEffects: { dealPayload } };
      }
      return { state: result.state };
    }
    case 'bury':
      return { state: handleBury(state, event, config) };
    case 'call_ace':
      return { state: handleCall(state, event, config) };
    case 'play_card':
      return { state: handlePlayCard(state, event, config) };
    case 'play_hole':
      return { state: handlePlayHole(state, event, config) };
    case 'game_scored':
      return { state: handleScore(state, config) };
    case 'crack':
      return { state: { ...state, crack: { crackedBy: event.userID, reCrackedBy: null } } };
    case 're_crack': {
      if (!state.crack) {
        throw new Error('Cannot re-crack without an existing crack');
      }
      return { state: { ...state, crack: { ...state.crack, reCrackedBy: event.userID } } };
    }
    case 'blitz': {
      if (state.blitz) {
        throw new Error('Blitz already declared');
      }
      const blitz: BlitzState = { type: event.payload.blitzType, blitzedBy: event.userID };
      return { state: { ...state, blitz } };
    }
    case 'trick_advance':
      return { state: handleTrickAdvance(state) };
    default:
      throw new Error(`Unknown event type: ${(event as { type: string }).type}`);
  }
}

function getPlayerView(
  config: SheepsheadConfig,
  state: SheepsheadState,
  userID: UserID,
): Partial<SheepsheadState> {
  const thisPlayer = state.players.find((p) => p.userID === userID);
  const isPicker = thisPlayer?.role === 'picker';

  // Rotate the player array so the viewing player is at index 0.
  // This ensures every player sees opponents in a consistent clockwise order.
  const myIdx = state.players.findIndex((p) => p.userID === userID);
  const rotated =
    myIdx > 0
      ? [...state.players.slice(myIdx), ...state.players.slice(0, myIdx)]
      : [...state.players];

  // Each player only sees their own hand (unless schwanzer or score phase)
  const players = rotated.map((p) => {
    if (p.userID === userID) return p;

    // In score phase, reveal roles and scores to all players
    if (state.phase === 'score') {
      return {
        ...p,
        hand: Array(p.hand.length).fill(null),
        cardsWon: [],
      };
    }

    return {
      userID: p.userID,
      role: p.role === 'picker' ? 'picker' : null,
      hand: state.noPick === 'schwanzer' ? p.hand : Array(p.hand.length).fill(null),
      tricksWon: state.phase === 'play' ? p.tricksWon : 0,
      pointsWon: 0,
      cardsWon: [],
      scoreDelta: null,
    };
  });

  // Blind visibility per phase:
  // - Deal: face-down placeholders for the deck visual
  // - Pick: face-down placeholders (no card data leaked)
  // - Bury: picker sees actual cards; partner-draft splits between picker/partner
  let blind: (Card | null)[] | null = [];
  if (state.phase === 'deal') {
    blind = Array(config.blindSize).fill(null);
  } else if (state.phase === 'pick') {
    blind = state.blind ? state.blind.map(() => null) : [];
  } else if (state.phase === 'bury' && state.blind) {
    if (config.partnerDraft === true) {
      const half = Math.floor(state.blind.length / 2);
      if (isPicker) {
        blind = state.blind.slice(0, half);
      } else if (thisPlayer?.role === 'partner') {
        blind = state.blind.slice(half);
      }
    } else if (isPicker) {
      blind = state.blind;
    }
  }
  const buried = state.buried ? [] : null;
  // Hole card: all players see whether it exists (face-down), but not what it is
  const hasHoleCard = state.hole !== null;

  // Include only the current (in-progress) trick so the client can render
  // played cards on the table. Completed tricks are hidden.
  // During trick-completion pause (last trick has winner, no empty trick follows),
  // include the completed trick so players can see the cards and winner.
  const isPendingState =
    state.phase === 'play' &&
    state.tricks.length > 0 &&
    state.tricks[state.tricks.length - 1].winner !== null;

  let tricks: TrickState[] = [];
  if (state.phase === 'play' && state.tricks.length > 0) {
    if (isPendingState) {
      tricks = [state.tricks[state.tricks.length - 1]];
    } else {
      const current = state.tricks[state.tricks.length - 1];
      if (current && current.winner === null) {
        tricks = [current];
      }
    }
  }

  // Include legal card names so the client can dim illegal cards.
  // During trick-completion pause, no cards are playable.
  let legalCardNames: string[] | null = null;
  if (isPendingState) {
    legalCardNames = null;
  } else if (state.phase === 'play' && state.activePlayer === userID && state.tricks.length > 0) {
    const { cards } = legalPlays(state, config, userID);
    legalCardNames = cards.map((c) => c.name);
  }

  // Include legal callable cards so the client only shows valid call options.
  let legalCallableCards: string[] | null = null;
  let holeCardRequired: string[] | null = null;
  if (state.phase === 'call' && state.activePlayer === userID && isPicker) {
    const pickerPlayer = state.players.find((p) => p.role === 'picker')!;
    legalCallableCards = legalCallOptions(pickerPlayer.hand, state.buried ?? [], config);
    // Identify which callable cards trigger the unknown ace condition
    holeCardRequired = legalCallableCards.filter(
      (card) => card !== 'alone' && requiresHoleCard(pickerPlayer.hand, card),
    );
  }

  return {
    ...state,
    players,
    blind,
    buried,
    hole: null,
    hasHoleCard,
    tricks,
    legalCardNames,
    legalCallableCards,
    holeCardRequired,
    dealerUserID: state.players[0]?.userID ?? null,
  } as Partial<SheepsheadState> & {
    hasHoleCard: boolean;
    legalCardNames: string[] | null;
    legalCallableCards: string[] | null;
    holeCardRequired: string[] | null;
    dealerUserID: number | null;
  };
}

function isGameOver(state: SheepsheadState): boolean {
  return state.phase === 'score' && state.players[0].scoreDelta !== null;
}

function buildStore(config: SheepsheadConfig, state: SheepsheadState): SheepsheadStore {
  const isSchwanzer = state.noPick === 'schwanzer';

  return {
    players: state.players.map((p) => ({
      userID: p.userID,
      role: p.role,
      won: p.scoreDelta !== null ? p.scoreDelta > 0 : null,
      scoreDelta: p.scoreDelta,
      points: isSchwanzer ? null : p.pointsWon,
    })),
    blind: state.blind,
    buried: state.buried,
    calledCard: state.calledCard,
    hole: state.hole,
    tricks: state.tricks,
    crack: state.crack,
    blitz: state.blitz,
    previousGameDouble: state.previousGameDouble,
    noPick: state.noPick,
    redeals: state.redeals,
  };
}

function onPlayerAbandon(
  config: SheepsheadConfig,
  state: SheepsheadState,
  userId: number,
): SheepsheadState {
  const multiplier = scoreMultiplier(state, config, false);
  const otherCount = state.players.length - 1;

  return {
    ...state,
    phase: 'score',
    activePlayer: null,
    players: state.players.map((p) => ({
      ...p,
      scoreDelta: p.userID === userId ? -(otherCount * multiplier) : multiplier,
    })),
  };
}

function getValidTargets(
  config: SheepsheadConfig,
  state: SheepsheadState,
  userID: number,
  sourceStackId: string,
  selectedCards: string[],
): string[] {
  const player = state.players.find((p) => p.userID === userID);
  if (!player) return [];

  // Dragging from the hole-card stack to trick-pile
  if (sourceStackId === 'hole-card') {
    if (state.phase !== 'play') return [];
    if (state.activePlayer !== userID) return [];
    const { playHoleCard } = legalPlays(state, config, userID);
    return playHoleCard ? ['trick-pile'] : [];
  }

  if (sourceStackId !== 'hand') return [];

  switch (state.phase) {
    case 'play': {
      if (state.activePlayer !== userID) return [];
      const { cards } = legalPlays(state, config, userID);
      const legalNames: Set<string> = new Set(cards.map((c) => c.name));
      if (selectedCards.every((c) => legalNames.has(c))) {
        return ['trick-pile'];
      }
      return [];
    }
    case 'bury': {
      if (state.activePlayer !== userID) return [];
      if (player.role !== 'picker') return [];
      const blindSize = config.blindSize ?? 2;
      const buryCount = config.partnerDraft === true ? Math.floor(blindSize / 2) : blindSize;
      if (selectedCards.length === buryCount) {
        return ['buried'];
      }
      return [];
    }
    case 'call': {
      // During call phase, picker can drop a card into the hole-card stack (unknown ace)
      if (state.activePlayer !== userID) return [];
      if (player.role !== 'picker') return [];
      if (selectedCards.length === 1) {
        return ['hole-card'];
      }
      return [];
    }
    default:
      return [];
  }
}

function describeEvent(
  event: SheepsheadEvent,
  _state: SheepsheadState,
  playerNames: Map<number, string>,
): string | null {
  switch (event.type) {
    case 'deal': {
      const name = playerNames.get(event.userID) ?? 'Unknown';
      return `${name} dealt`;
    }
    case 'pick': {
      const name = playerNames.get(event.userID) ?? 'Unknown';
      return `${name} picked`;
    }
    case 'pass': {
      const name = playerNames.get(event.userID) ?? 'Unknown';
      return `${name} passed`;
    }
    case 'bury': {
      const name = playerNames.get(event.userID) ?? 'Unknown';
      return `${name} buried`;
    }
    case 'call_ace': {
      const name = playerNames.get(event.userID) ?? 'Unknown';
      if (event.payload.card === 'alone') {
        return `${name} is going alone`;
      }
      const card = DECK.find((c) => c.name === event.payload.card);
      return `${name} called the ${card ? formatCard(card) : event.payload.card}`;
    }
    case 'crack': {
      const name = playerNames.get(event.userID) ?? 'Unknown';
      return `${name} cracked`;
    }
    case 're_crack': {
      const name = playerNames.get(event.userID) ?? 'Unknown';
      return `${name} re-cracked`;
    }
    case 'blitz': {
      const name = playerNames.get(event.userID) ?? 'Unknown';
      return `${name} declared ${event.payload.blitzType.replace('-', ' ')}`;
    }
    case 'play_card': {
      const name = playerNames.get(event.userID) ?? 'Unknown';
      return `${name} played the ${formatCard(event.payload.card)}`;
    }
    case 'play_hole': {
      const name = playerNames.get(event.userID) ?? 'Unknown';
      return `${name} played the unknown`;
    }
    case 'game_scored':
      return null;
    case 'trick_advance': {
      // Find the last completed trick (the one that was just won)
      const completedTrick = [..._state.tricks].reverse().find((t) => t.winner !== null);
      if (!completedTrick || completedTrick.winner === null) return null;
      const winnerName = playerNames.get(completedTrick.winner) ?? 'Unknown';
      return `${winnerName} took`;
    }
  }
}

function buildStats(_config: SheepsheadConfig, state: SheepsheadState): PlayerStatRow[] {
  return state.players.map((p) => ({
    userId: p.userID,
    won: p.scoreDelta !== null ? p.scoreDelta > 0 : null,
    scoreDelta: p.scoreDelta,
  }));
}

/**
 * Sheepshead game plugin. Implements the generic GamePlugin interface
 * so the engine can orchestrate Sheepshead games without knowing the rules.
 */
export const SheepsheadPlugin: GamePlugin<
  SheepsheadConfig,
  SheepsheadState,
  SheepsheadStore,
  SheepsheadEvent
> = {
  gameType: 'sheepshead',
  validateConfig,
  createInitialState,
  getValidActions,
  applyEvent,
  getPlayerView,
  isGameOver,
  buildStore,
  getValidTargets,
  onPlayerAbandon,
  describeEvent,
  buildStats,
};
