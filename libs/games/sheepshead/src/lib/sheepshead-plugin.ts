import { GamePlugin } from '@cardquorum/engine';
import { SheepsheadConfig, SheepsheadState, SheepsheadEvent, SheepsheadEventType } from './types';

/**
 * Sheepshead game plugin. Implements the generic GamePlugin interface
 * so the engine can orchestrate Sheepshead games without knowing the rules.
 *
 * TODO: implement each method as game logic is built out.
 */
export class SheepsheadPlugin
  implements GamePlugin<SheepsheadConfig, SheepsheadState, SheepsheadEvent>
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
      typeof c['crack'] === 'boolean' &&
      typeof c['blitzing'] === 'boolean'
    );
  }

  createInitialState(config: SheepsheadConfig, _playerIds: number[]): SheepsheadState {
    return {
      scores: new Array(config.playerCount).fill(0),
      handNumber: 0,
      doublerCount: 0,
      currentHand: null,
    };
  }

  getValidActions(_state: SheepsheadState, _playerId: number): SheepsheadEventType[] {
    /* TODO: return valid actions based on current phase and active player */
    return [];
  }

  applyEvent(state: SheepsheadState, _event: SheepsheadEvent): SheepsheadState {
    /* TODO: dispatch to phase-specific handlers */
    return state;
  }

  getPlayerView(state: SheepsheadState, playerId: number): Partial<SheepsheadState> {
    if (!state.currentHand) return state;

    /* Hide other players' hands and the blind (unless picker) */
    const hand = state.currentHand;
    const maskedHands = hand.hands.map((h, i) => (i === playerId ? h : []));
    const maskedBlind = hand.picker === playerId ? hand.blind : [];
    const maskedBuried = hand.picker === playerId ? hand.buried : [];

    return {
      ...state,
      currentHand: {
        ...hand,
        hands: maskedHands,
        blind: maskedBlind,
        buried: maskedBuried,
      },
    };
  }

  isGameOver(_state: SheepsheadState): boolean {
    /* TODO: check end condition */
    return false;
  }
}
