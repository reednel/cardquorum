import { GamePlugin } from '@cardquorum/engine';
import { SheepsheadConfigSchema } from './config';
import {
  handleBury,
  handleCall,
  handleDeal,
  handlePick,
  handlePlayCard,
  handleScore,
  handleTrickAdvance,
} from './phases';
import { legalPlays } from './tricks';
import {
  BlitzState,
  Card,
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
        actions.push('play_card');
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
): SheepsheadState {
  switch (event.type) {
    case 'deal':
      return handleDeal(state, config);
    case 'pick':
    case 'pass': {
      const result = handlePick(state, event, config);
      if (result.outcome === 'doubler-redeal') {
        const userIDs = state.players.map((p) => p.userID);
        const freshState = createInitialState(config, userIDs);
        freshState.previousGameDouble = true;
        freshState.redeals = result.redeals;
        return handleDeal(freshState, config);
      }
      return result.state;
    }
    case 'bury':
      return handleBury(state, event, config);
    case 'call_ace':
      return handleCall(state, event, config);
    case 'play_card':
      return handlePlayCard(state, event, config);
    case 'game_scored':
      return handleScore(state, config);
    case 'crack':
      return { ...state, crack: { crackedBy: event.userID, reCrackedBy: null } };
    case 're_crack': {
      if (!state.crack) {
        throw new Error('Cannot re-crack without an existing crack');
      }
      return { ...state, crack: { ...state.crack, reCrackedBy: event.userID } };
    }
    case 'blitz': {
      if (state.blitz) {
        throw new Error('Blitz already declared');
      }
      const blitz: BlitzState = { type: event.payload.blitzType, blitzedBy: event.userID };
      return { ...state, blitz };
    }
    case 'trick_advance':
      return handleTrickAdvance(state);
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
      role: null,
      hand: state.noPick === 'schwanzer' ? p.hand : Array(p.hand.length).fill(null),
      tricksWon: 0,
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
    if (config.name === 'partner-draft') {
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
  const hole = null;

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

  return {
    ...state,
    players,
    blind,
    buried,
    hole,
    tricks,
    legalCardNames,
    dealerUserID: state.players[0]?.userID ?? null,
  } as Partial<SheepsheadState> & { legalCardNames: string[] | null; dealerUserID: number | null };
}

function isGameOver(state: SheepsheadState): boolean {
  return state.phase === 'score' && state.players[0].scoreDelta !== null;
}

function buildStore(config: SheepsheadConfig, state: SheepsheadState): SheepsheadStore {
  return {
    players: state.players.map((p) => ({
      userID: p.userID,
      role: p.role,
      won: p.scoreDelta !== null ? p.scoreDelta > 0 : null,
      scoreDelta: p.scoreDelta,
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
};
