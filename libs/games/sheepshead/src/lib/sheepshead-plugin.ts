import { GamePlugin } from '@cardquorum/engine';
import {
  SheepsheadConfig,
  SheepsheadState,
  SheepsheadStore,
  SheepsheadEvent,
  SheepsheadEventType,
  UserID,
  BlitzState,
} from './types';
import { PHASE } from './constants';
import {
  handleDeal,
  handlePick,
  handleBury,
  handleCall,
  handlePlayCard,
  handleScore,
} from './phases';
import { isTrump } from './cards';

/**
 * Sheepshead game plugin. Implements the generic GamePlugin interface
 * so the engine can orchestrate Sheepshead games without knowing the rules.
 */
export class SheepsheadPlugin
  implements GamePlugin<SheepsheadConfig, SheepsheadState, SheepsheadStore, SheepsheadEvent>
{
  readonly gameType = 'sheepshead';

  /** Stored config, set when createInitialState is called. */
  private config: SheepsheadConfig | null = null;

  validateConfig(config: unknown): config is SheepsheadConfig {
    if (typeof config !== 'object' || config === null) return false;

    const c = config as Record<string, unknown>;
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
      (c['cardsRemoved'] === undefined ||
        (Array.isArray(c['cardsRemoved']) &&
          c['cardsRemoved'].every((v: unknown) => typeof v === 'string')))
    );
  }

  createInitialState(config: SheepsheadConfig, userIDs: UserID[]): SheepsheadState {
    this.config = config;
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
      phase: PHASE.deal,
      trickNumber: 0,
      activePlayer: null,
      blind: [],
      buried: [],
      calledSuit: null,
      tricks: [],
      crack: null,
      blitz: null,
      previousGameDouble: null,
      noPick: null,
    };
  }

  createInitialStore(config: SheepsheadConfig, userIDs: UserID[]): SheepsheadStore {
    return {
      players: userIDs.map((id) => ({ userID: id, role: null, won: null, scoreDelta: null })),
      blind: [],
      buried: [],
      calledSuit: null,
      tricks: [],
      crack: null,
      blitz: null,
      previousGameDouble: null,
      noPick: null,
    };
  }

  getValidActions(state: SheepsheadState, userID: UserID): SheepsheadEventType[] {
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
        if (this.config?.cracking && !state.crack && player?.role === 'opposition') {
          actions.push('crack');
        }
        // Re-crack: picker or partner can re-crack an existing crack
        if (
          this.config?.cracking &&
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
          this.config?.blitzing &&
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

  applyEvent(
    state: SheepsheadState,
    store: SheepsheadStore,
    event: SheepsheadEvent,
  ): [SheepsheadState, SheepsheadStore] {
    if (!this.config) {
      throw new Error('Plugin not initialized — call createInitialState first');
    }

    switch (event.type) {
      case 'deal':
        return handleDeal(state, store, this.config);
      case 'pick':
      case 'pass': {
        const result = handlePick(state, store, event, this.config);
        if (result === null) {
          // Re-deal needed — create fresh state and deal
          const userIDs = state.players.map((p) => p.userID);
          const freshState = this.createInitialState(this.config, userIDs);
          const freshStore = this.createInitialStore(this.config, userIDs);
          return handleDeal(freshState, freshStore, this.config);
        }
        // Doubler: state has previousGameDouble set, trigger re-deal with that flag preserved
        if (result[0].previousGameDouble && result[0].phase !== 'score') {
          const userIDs = state.players.map((p) => p.userID);
          const freshState = this.createInitialState(this.config, userIDs);
          freshState.previousGameDouble = true;
          const freshStore = this.createInitialStore(this.config, userIDs);
          freshStore.previousGameDouble = true;
          return handleDeal(freshState, freshStore, this.config);
        }
        return result;
      }
      case 'bury':
        return handleBury(state, store, event, this.config);
      case 'call_ace':
        return handleCall(state, store, event);
      case 'play_card':
        return handlePlayCard(state, store, event, this.config);
      case 'game_scored':
        return handleScore(state, store, this.config);
      case 'crack':
        return [
          { ...state, crack: { crackedBy: event.userID, reCrackedBy: null } },
          { ...store, crack: { crackedBy: event.userID, reCrackedBy: null } },
        ];
      case 're_crack': {
        if (!state.crack || !store.crack) {
          throw new Error('Cannot re-crack without an existing crack');
        }
        return [
          { ...state, crack: { ...state.crack, reCrackedBy: event.userID } },
          { ...store, crack: { ...store.crack, reCrackedBy: event.userID } },
        ];
      }
      case 'blitz': {
        if (state.blitz || store.blitz) {
          throw new Error('Blitz already declared');
        }
        const blitz: BlitzState = { type: event.payload.blitzType, blitzedBy: event.userID };
        return [
          { ...state, blitz },
          { ...store, blitz },
        ];
      }
      case 'trick_won':
      case 'game_over':
        // These are informational events, not state-changing
        return [state, store];
      default:
        return [state, store];
    }
  }

  getPlayerView(state: SheepsheadState, userID: UserID): Partial<SheepsheadState> {
    const thisPlayer = state.players.find((p) => p.userID === userID);
    const isPicker = thisPlayer?.role === 'picker';

    // Schwanzer: all hands are face-up (showdown)
    const isSchwanzer = state.noPick === 'schwanzer';

    // Each player only sees their own hand (unless schwanzer)
    const players = isSchwanzer
      ? state.players
      : state.players.map((p) => {
          if (p.userID === userID) return p;

          // Called-ace: hide partner role until the called ace has been played
          const hideRole =
            this.config?.partnerRule === 'called-ace' &&
            state.phase === 'play' &&
            p.role === 'partner' &&
            state.calledSuit &&
            !this.calledAcePlayed(state);

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

    return { ...state, players, blind, buried };
  }

  isGameOver(state: SheepsheadState): boolean {
    return state.phase === 'score';
  }

  /** Check if the called ace has been played in any trick. */
  private calledAcePlayed(state: SheepsheadState): boolean {
    if (!state.calledSuit) return false;
    const aceName = `a${state.calledSuit[0]}`;
    return state.tricks.some((t) => t.plays.some((p) => p.card.name === aceName));
  }
}
