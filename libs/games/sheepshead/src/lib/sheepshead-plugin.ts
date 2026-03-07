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

/**
 * Sheepshead game plugin. Implements the generic GamePlugin interface
 * so the engine can orchestrate Sheepshead games without knowing the rules.
 *
 * TODO: implement each method as game logic is built out.
 */
export class SheepsheadPlugin
  implements GamePlugin<SheepsheadConfig, SheepsheadState, SheepsheadStore, SheepsheadEvent>
{
  readonly gameType = 'sheepshead';

  validateConfig(config: unknown): config is SheepsheadConfig {
    if (typeof config !== 'object' || config === null) return false;

    const c = config as Record<string, unknown>;
    if (typeof c['playerCount'] !== 'number') return false;
    if (c['playerCount'] < 2 || c['playerCount'] > 8) return false;
    if (!['jack-of-diamonds', 'called-ace', 'none'].includes(c['partnerRule'] as string)) {
      return false;
    }

    return (
      typeof c['leasters'] === 'boolean' &&
      typeof c['doublers'] === 'boolean' &&
      typeof c['cracking'] === 'boolean' &&
      typeof c['blitzing'] === 'boolean' &&
      typeof c['noAceFaceTrump'] === 'boolean'
    );
  }

  createInitialState(config: SheepsheadConfig, userIDs: UserID[]): SheepsheadState {
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
      isLeaster: null,
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
      isLeaster: null,
    };
  }

  getValidActions(_state: SheepsheadState, _userID: UserID): SheepsheadEventType[] {
    /* TODO: return valid actions based on current phase and active player */
    return [];
  }

  applyEvent(
    state: SheepsheadState,
    store: SheepsheadStore,
    _event: SheepsheadEvent,
  ): [SheepsheadState, SheepsheadStore] {
    /* TODO: dispatch to phase-specific handlers */
    return [state, store];
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

  isGameOver(_state: SheepsheadState): boolean {
    /* TODO: check end condition */
    return false;
  }
}
