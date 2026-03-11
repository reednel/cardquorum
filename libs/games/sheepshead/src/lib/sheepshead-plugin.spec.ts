import { SheepsheadPlugin } from './sheepshead-plugin';
import { SheepsheadConfig, SheepsheadState, UserID } from './types';
import { DECK } from './constants';

function makeConfig(overrides: Partial<SheepsheadConfig> = {}): SheepsheadConfig {
  return {
    name: 'called-ace',
    playerCount: 5,
    handSize: 6,
    blindSize: 2,
    pickerRule: 'autonomous',
    partnerRule: 'called-ace',
    noPick: 'leaster',
    cracking: false,
    blitzing: false,
    doubleOnTheBump: false,
    partnerOffTheHook: false,
    noAceFaceTrump: false,
    multiplicityLimit: null,
    callOwnAce: null,
    ...overrides,
  };
}

describe('SheepsheadPlugin', () => {
  let plugin: SheepsheadPlugin;

  beforeEach(() => {
    plugin = new SheepsheadPlugin();
  });

  describe('validateConfig', () => {
    it('accepts valid config', () => {
      expect(plugin.validateConfig(makeConfig())).toBe(true);
    });

    it('accepts all valid partner rules', () => {
      for (const rule of [
        'called-ace',
        'jd',
        'jc',
        'qc-qs',
        'qs-jc',
        'first-trick',
        'qc-7d',
        'left-of-picker',
        null,
      ]) {
        expect(plugin.validateConfig(makeConfig({ partnerRule: rule as any }))).toBe(true);
      }
    });

    it('rejects invalid partner rule', () => {
      expect(plugin.validateConfig(makeConfig({ partnerRule: 'jack-of-diamonds' as any }))).toBe(
        false,
      );
      expect(plugin.validateConfig(makeConfig({ partnerRule: 'none' as any }))).toBe(false);
    });

    it('accepts all valid picker rules', () => {
      for (const rule of ['autonomous', 'left-of-dealer', null]) {
        expect(plugin.validateConfig(makeConfig({ pickerRule: rule as any }))).toBe(true);
      }
    });

    it('rejects invalid picker rule', () => {
      expect(plugin.validateConfig(makeConfig({ pickerRule: 'random' as any }))).toBe(false);
    });

    it('rejects non-object', () => {
      expect(plugin.validateConfig(null)).toBe(false);
      expect(plugin.validateConfig('string')).toBe(false);
    });

    it('rejects invalid playerCount', () => {
      expect(plugin.validateConfig(makeConfig({ playerCount: 1 as any }))).toBe(false);
      expect(plugin.validateConfig(makeConfig({ playerCount: 9 as any }))).toBe(false);
    });

    it('rejects missing boolean fields', () => {
      const config = { ...makeConfig() } as Record<string, unknown>;
      delete config['cracking'];
      expect(plugin.validateConfig(config)).toBe(false);
    });
  });

  describe('createInitialState', () => {
    it('creates correct structure', () => {
      const config = makeConfig();
      const state = plugin.createInitialState(config, [1, 2, 3]);

      expect(state.players).toHaveLength(3);
      expect(state.phase).toBe('deal');
      expect(state.trickNumber).toBe(0);
      expect(state.activePlayer).toBeNull();
      expect(state.tricks).toEqual([]);
      expect(state.noPick).toBeNull();
    });

    it('player IDs match input', () => {
      const state = plugin.createInitialState(makeConfig(), [10, 20, 30]);
      expect(state.players.map((p) => p.userID)).toEqual([10, 20, 30]);
    });
  });

  describe('getPlayerView', () => {
    it('hides other players hands', () => {
      const config = makeConfig();
      const state = plugin.createInitialState(config, [1, 2, 3]);
      // Simulate dealt hands
      const dealt: SheepsheadState = {
        ...state,
        phase: 'play',
        players: state.players.map((p, i) => ({
          ...p,
          hand: DECK.slice(i * 10, i * 10 + 10),
        })),
      };

      const view = plugin.getPlayerView(dealt, 1);
      expect(view.players![0].hand).toHaveLength(10); // own hand visible
      expect(view.players![1].hand).toHaveLength(0); // other hidden
      expect(view.players![2].hand).toHaveLength(0); // other hidden
    });

    it('hides blind during deal/pick phases', () => {
      const config = makeConfig();
      const state = plugin.createInitialState(config, [1, 2, 3]);
      const withBlind: SheepsheadState = {
        ...state,
        phase: 'pick',
        blind: DECK.slice(0, 2),
      };

      const view = plugin.getPlayerView(withBlind, 1);
      expect(view.blind).toEqual([]);
    });

    it('shows blind after pick phase', () => {
      const config = makeConfig();
      const state = plugin.createInitialState(config, [1, 2, 3]);
      const blind = DECK.slice(0, 2);
      const inPlay: SheepsheadState = {
        ...state,
        phase: 'play',
        blind,
      };

      const view = plugin.getPlayerView(inPlay, 1);
      expect(view.blind).toEqual(blind);
    });

    it('hides buried from non-picker', () => {
      const config = makeConfig();
      const state = plugin.createInitialState(config, [1, 2, 3]);
      const inPlay: SheepsheadState = {
        ...state,
        phase: 'play',
        buried: DECK.slice(0, 2),
        players: state.players.map((p) => ({
          ...p,
          role: p.userID === 2 ? ('picker' as const) : ('opposition' as const),
        })),
      };

      expect(plugin.getPlayerView(inPlay, 1).buried).toBeNull();
      expect(plugin.getPlayerView(inPlay, 2).buried).toEqual(DECK.slice(0, 2));
    });
  });

  describe('isGameOver', () => {
    it('returns true when phase is score', () => {
      const state = plugin.createInitialState(makeConfig(), [1, 2, 3]);
      expect(plugin.isGameOver({ ...state, phase: 'score' })).toBe(true);
    });

    it('returns false for other phases', () => {
      const state = plugin.createInitialState(makeConfig(), [1, 2, 3]);
      expect(plugin.isGameOver(state)).toBe(false); // 'deal'
      expect(plugin.isGameOver({ ...state, phase: 'play' })).toBe(false);
    });
  });

  describe('integration: full game flow', () => {
    it('deal → pick → bury → play → score', () => {
      const config = makeConfig({ partnerRule: 'jd' });
      const userIDs: UserID[] = [1, 2, 3];

      let state = plugin.createInitialState(config, userIDs);
      let store = plugin.createInitialStore(config, userIDs);

      // Deal
      [state, store] = plugin.applyEvent(state, store, { type: 'deal' });
      expect(state.phase).toBe('pick');
      expect(state.activePlayer).toBe(2);

      // Player 2 picks
      [state, store] = plugin.applyEvent(state, store, { type: 'pick', userID: 2 });
      expect(state.phase).toBe('bury');
      expect(state.players[1].role).toBe('picker');

      // Player 2 buries 2 cards
      const toBury = state.players[1].hand.slice(0, 2);
      [state, store] = plugin.applyEvent(state, store, {
        type: 'bury',
        userID: 2,
        payload: { cards: toBury },
      });
      expect(state.phase).toBe('play');
      expect(state.buried).toEqual(toBury);
      expect(state.trickNumber).toBe(1);

      // Play all tricks
      let trickCount = 0;
      while (state.phase === 'play') {
        const activePlayer = state.activePlayer!;
        const playerIdx = state.players.findIndex((p) => p.userID === activePlayer);
        const hand = state.players[playerIdx].hand;
        const currentTrick = state.tricks[state.tricks.length - 1];

        // Pick the first legal card
        const { legalPlays } = require('./tricks');
        const legal = legalPlays(hand, currentTrick);
        const cardToPlay = legal[0];

        [state, store] = plugin.applyEvent(state, store, {
          type: 'play_card',
          userID: activePlayer,
          payload: { card: cardToPlay },
        });

        if (state.phase === 'play' && state.tricks.length > trickCount + 1) {
          trickCount = state.tricks.length - 1;
        }
      }

      expect(state.phase).toBe('score');

      // Score
      [state, store] = plugin.applyEvent(state, store, {
        type: 'game_scored',
        payload: { scoreDeltas: [], gotSchneidered: false, gotSchwarzed: false },
      });

      // All players should have score deltas
      for (const p of state.players) {
        expect(p.scoreDelta).not.toBeNull();
      }

      // Score deltas should sum to 0 (zero-sum game)
      const totalDelta = state.players.reduce((sum, p) => sum + (p.scoreDelta ?? 0), 0);
      expect(totalDelta).toBe(0);

      // Game should be over
      expect(plugin.isGameOver(state)).toBe(true);

      // Store should have final data
      expect(store.tricks.length).toBeGreaterThan(0);
      expect(store.blind.length).toBeGreaterThan(0);
    });
  });
});
