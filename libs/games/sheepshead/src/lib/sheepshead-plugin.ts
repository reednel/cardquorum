import { GamePlugin } from '@cardquorum/engine';
import {
  SheepsheadConfig,
  SheepsheadState,
  SheepsheadStore,
  SheepsheadEvent,
  SheepsheadEventType,
  UserID,
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
      (c['multiplicityLimit'] === null || typeof c['multiplicityLimit'] === 'number')
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
    switch (state.phase) {
      case 'deal':
        return ['deal'];
      case 'pick':
        if (state.activePlayer === userID) return ['pick', 'pass'];
        if (
          this.config?.cracking &&
          state.players.find((p) => p.userID === userID)?.role === 'opposition'
        ) {
          return ['crack'];
        }
        return [];
      case 'bury':
        return state.activePlayer === userID ? ['bury'] : [];
      case 'call':
        return state.activePlayer === userID ? ['call_ace'] : [];
      case 'play':
        return state.activePlayer === userID ? ['play_card'] : [];
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

    // Each player only sees their own hand
    const players = state.players.map((p) => (p.userID === userID ? p : { ...p, hand: [] }));

    // Blind is face-down during deal and pick phases
    const blind = state.phase === 'deal' || state.phase === 'pick' ? [] : state.blind;

    // Buried cards are only visible to the picker
    const buried = isPicker ? state.buried : null;

    return { ...state, players, blind, buried };
  }

  isGameOver(state: SheepsheadState): boolean {
    return state.phase === 'score';
  }
}
