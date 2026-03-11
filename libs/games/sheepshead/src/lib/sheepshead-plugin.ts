import { GamePlugin } from '@cardquorum/engine';
import {
  SheepsheadConfig,
  SheepsheadState,
  SheepsheadStore,
  SheepsheadEvent,
  SheepsheadEventType,
  UserID,
  BlitzState,
  CardName,
} from './types';
import {
  handleDeal,
  handlePick,
  handleBury,
  handleCall,
  handlePlayCard,
  handleScore,
} from './phases';

/** Check if the called card has been played in any trick. */
function calledCardPlayed(state: SheepsheadState): boolean {
  if (!state.calledCard || state.calledCard === 'alone') return false;
  return state.tricks.some((t) => t.plays.some((p) => p.card.name === state.calledCard));
}

/* TODO: make this useful (at time of wiring in user side) */
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
    activePlayer: null,
    blind: [],
    buried: [],
    calledCard: null,
    hole: null,
    tricks: [],
    crack: null,
    blitz: null,
    previousGameDouble: null,
    noPick: null,
    redeals: [],
  };
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
      return ['deal'];
    case 'pick':
      if (state.activePlayer === userID) {
        actions.push('pick', 'pass');
      }
      // Crack: opposition player who didn't get a chance to pick can crack
      if (config.cracking && !state.crack && player?.role === 'opposition') {
        actions.push('crack');
      }
      // Re-crack: picker or partner can re-crack an existing crack
      if (
        config.cracking &&
        state.crack &&
        !state.crack.reCrackedBy &&
        (player?.role === 'picker' || player?.role === 'partner')
      ) {
        actions.push('re_crack');
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
      // Blitz: before first card is played, a player holding both black or red queens can blitz
      if (
        config.blitzing &&
        state.crack &&
        !state.blitz &&
        state.trickNumber === 1 &&
        state.tricks.length === 1 &&
        state.tricks[0].plays.length === 0 &&
        player
      ) {
        const hasBlackQueens =
          player.hand.some((c) => c.name === 'qc') && player.hand.some((c) => c.name === 'qs');
        const hasRedQueens =
          player.hand.some((c) => c.name === 'qh') && player.hand.some((c) => c.name === 'qd');
        if (hasBlackQueens || hasRedQueens) {
          actions.push('blitz');
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
      switch (result.outcome) {
        case 'continue':
          return result.state;
        case 'redeal': {
          const userIDs = state.players.map((p) => p.userID);
          const freshState = createInitialState(config, userIDs);
          return handleDeal(freshState, config);
        }
        case 'doubler-redeal': {
          const userIDs = state.players.map((p) => p.userID);
          const freshState = createInitialState(config, userIDs);
          freshState.previousGameDouble = true;
          freshState.redeals = result.redeals;
          return handleDeal(freshState, config);
        }
      }
      break; // unreachable, but satisfies no-fallthrough
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

  // Schwanzer: all hands are face-up (showdown)
  const isSchwanzer = state.noPick === 'schwanzer';

  // Each player only sees their own hand (unless schwanzer)
  const players = isSchwanzer
    ? state.players
    : state.players.map((p) => {
        if (p.userID === userID) return p;

        // Called-ace: hide partner role until the called card has been played
        const hideRole =
          config.partnerRule === 'called-ace' &&
          state.phase === 'play' &&
          p.role === 'partner' &&
          state.calledCard &&
          state.calledCard !== 'alone' &&
          !calledCardPlayed(state);

        return {
          ...p,
          hand: [],
          role: hideRole ? ('opposition' as const) : p.role,
        };
      });

  // Blind is face-down during deal and pick phases
  const blind = state.phase === 'deal' || state.phase === 'pick' ? [] : state.blind;

  // Buried cards are only visible to the picker
  const buried = isPicker ? state.buried : null;

  // Hole card identity: only the picker knows during play;
  // after scoring, everyone can see it.
  const hole =
    state.phase === 'score' || isPicker
      ? state.hole
      : state.hole
        ? ('hidden' as unknown as CardName)
        : null;

  // Hide hole card identity in tricks from everyone except the trick-taker
  const tricks = state.hole
    ? state.tricks.map((t) => {
        const holePlay = t.plays.find((p) => p.isHoleCard);
        if (!holePlay) return t;
        // During scoring, reveal to all
        if (state.phase === 'score') return t;
        // Trick-taker can see the hole card
        if (t.winner === userID) return t;
        // Everyone else sees a blank card
        return {
          ...t,
          plays: t.plays.map((p) =>
            p.isHoleCard
              ? { ...p, card: { ...p.card, name: 'hidden' as CardName, points: 0 as any } }
              : p,
          ),
        };
      })
    : state.tricks;

  return { ...state, players, blind, buried, hole, tricks };
}

function isGameOver(state: SheepsheadState): boolean {
  return state.phase === 'score';
}

function buildStore(config: SheepsheadConfig, state: SheepsheadState): SheepsheadStore {
  return {
    players: state.players.map((p) => ({
      userID: p.userID,
      role: p.role,
      won: p.scoreDelta !== null ? p.scoreDelta > 0 : null,
      scoreDelta: p.scoreDelta,
    })),
    blind: state.blind ?? [],
    buried: state.buried ?? [],
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
