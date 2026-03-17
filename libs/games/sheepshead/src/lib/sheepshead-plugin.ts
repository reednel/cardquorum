import { GamePlugin } from '@cardquorum/engine';
import {
  handleBury,
  handleCall,
  handleDeal,
  handlePick,
  handlePlayCard,
  handleScore,
} from './phases';
import {
  BlitzState,
  SheepsheadConfig,
  SheepsheadEvent,
  SheepsheadEventType,
  SheepsheadState,
  SheepsheadStore,
  TrickState,
  UserID,
} from './types';

/* Make this useful (at time of wiring in user side) */
function validateConfig(config: unknown): config is SheepsheadConfig {
  if (typeof config !== 'object' || config === null) return false;

  const c = config as Record<string, unknown>;
  if (typeof c['name'] !== 'string' || /\s/.test(c['name'] as string)) return false;
  if (typeof c['playerCount'] !== 'number') return false;
  if (c['playerCount'] < 2 || c['playerCount'] > 8) return false;

  const validPickerRules = ['autonomous', 'left-of-dealer', null];
  if (!validPickerRules.includes(c['pickerRule'] as string | null)) return false;

  const validPartnerRules = [
    'called-ace',
    'jd',
    'jc',
    'qc-qs',
    'qs-jc',
    'first-trick',
    'qc-7d',
    'left-of-picker',
    null,
  ];
  if (!validPartnerRules.includes(c['partnerRule'] as string | null)) return false;

  const validNoPick = [
    'forced-pick',
    'leaster',
    'moster',
    'mittler',
    'schneidster',
    'doubler',
    'schwanzer',
    null,
  ];
  if (!validNoPick.includes(c['noPick'] as string | null)) return false;

  if (typeof c['handSize'] !== 'number' || typeof c['blindSize'] !== 'number') return false;

  return (
    typeof c['cracking'] === 'boolean' &&
    typeof c['blitzing'] === 'boolean' &&
    typeof c['doubleOnTheBump'] === 'boolean' &&
    typeof c['partnerOffTheHook'] === 'boolean' &&
    typeof c['noAceFaceTrump'] === 'boolean' &&
    (c['multiplicityLimit'] === null || typeof c['multiplicityLimit'] === 'number') &&
    (c['callOwnAce'] === null || typeof c['callOwnAce'] === 'boolean') &&
    (c['cardsRemoved'] === undefined ||
      (Array.isArray(c['cardsRemoved']) &&
        c['cardsRemoved'].every((v: unknown) => typeof v === 'string')))
  );
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
      return ['game_scored'];
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

  // Each player only sees their own hand (unless schwanzer)
  const players = state.players.map((p) => {
    if (p.userID === userID) return p;

    return {
      userID: p.userID,
      role: null,
      hand: state.noPick === 'schwanzer' ? p.hand : [],
      tricksWon: 0,
      pointsWon: 0,
      cardsWon: [],
      scoreDelta: null,
    };
  });

  // Partner-draft: each player sees only their half of the blind during bury.
  let blind: typeof state.blind = [];
  if (state.phase === 'bury' && state.blind) {
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
  const tricks: TrickState[] = [];

  return { ...state, players, blind, buried, hole, tricks };
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
