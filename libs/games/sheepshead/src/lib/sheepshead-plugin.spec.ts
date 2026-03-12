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
  describe('validateConfig', () => {
    it('accepts valid config', () => {
      expect(SheepsheadPlugin.validateConfig(makeConfig())).toBe(true);
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
        expect(SheepsheadPlugin.validateConfig(makeConfig({ partnerRule: rule as any }))).toBe(
          true,
        );
      }
    });

    it('rejects invalid partner rule', () => {
      expect(
        SheepsheadPlugin.validateConfig(makeConfig({ partnerRule: 'jack-of-diamonds' as any })),
      ).toBe(false);
      expect(SheepsheadPlugin.validateConfig(makeConfig({ partnerRule: 'none' as any }))).toBe(
        false,
      );
    });

    it('accepts all valid picker rules', () => {
      for (const rule of ['autonomous', 'left-of-dealer', null]) {
        expect(SheepsheadPlugin.validateConfig(makeConfig({ pickerRule: rule as any }))).toBe(true);
      }
    });

    it('rejects invalid picker rule', () => {
      expect(SheepsheadPlugin.validateConfig(makeConfig({ pickerRule: 'random' as any }))).toBe(
        false,
      );
    });

    it('rejects non-object', () => {
      expect(SheepsheadPlugin.validateConfig(null)).toBe(false);
      expect(SheepsheadPlugin.validateConfig('string')).toBe(false);
    });

    it('rejects invalid playerCount', () => {
      expect(SheepsheadPlugin.validateConfig(makeConfig({ playerCount: 1 as any }))).toBe(false);
      expect(SheepsheadPlugin.validateConfig(makeConfig({ playerCount: 9 as any }))).toBe(false);
    });

    it('rejects missing boolean fields', () => {
      const config = { ...makeConfig() } as Record<string, unknown>;
      delete config['cracking'];
      expect(SheepsheadPlugin.validateConfig(config)).toBe(false);
    });
  });

  describe('createInitialState', () => {
    it('creates correct structure', () => {
      const config = makeConfig();
      const state = SheepsheadPlugin.createInitialState(config, [1, 2, 3]);

      expect(state.players).toHaveLength(3);
      expect(state.phase).toBe('deal');
      expect(state.trickNumber).toBe(0);
      expect(state.activePlayer).toBeNull();
      expect(state.tricks).toEqual([]);
      expect(state.noPick).toBeNull();
    });

    it('player IDs match input', () => {
      const state = SheepsheadPlugin.createInitialState(makeConfig(), [10, 20, 30]);
      expect(state.players.map((p) => p.userID)).toEqual([10, 20, 30]);
    });
  });

  describe('getPlayerView', () => {
    it('hides other players hands', () => {
      const config = makeConfig();
      const state = SheepsheadPlugin.createInitialState(config, [1, 2, 3]);
      // Simulate dealt hands
      const dealt: SheepsheadState = {
        ...state,
        phase: 'play',
        players: state.players.map((p, i) => ({
          ...p,
          hand: DECK.slice(i * 10, i * 10 + 10),
        })),
      };

      const view = SheepsheadPlugin.getPlayerView(config, dealt, 1);
      expect(view.players![0].hand).toHaveLength(10); // own hand visible
      expect(view.players![1].hand).toHaveLength(0); // other hidden
      expect(view.players![2].hand).toHaveLength(0); // other hidden
    });

    it('hides blind during deal/pick phases', () => {
      const config = makeConfig();
      const state = SheepsheadPlugin.createInitialState(config, [1, 2, 3]);
      const withBlind: SheepsheadState = {
        ...state,
        phase: 'pick',
        blind: DECK.slice(0, 2),
      };

      const view = SheepsheadPlugin.getPlayerView(config, withBlind, 1);
      expect(view.blind).toEqual([]);
    });

    it('shows blind after pick phase', () => {
      const config = makeConfig();
      const state = SheepsheadPlugin.createInitialState(config, [1, 2, 3]);
      const blind = DECK.slice(0, 2);
      const inPlay: SheepsheadState = {
        ...state,
        phase: 'play',
        blind,
      };

      const view = SheepsheadPlugin.getPlayerView(config, inPlay, 1);
      expect(view.blind).toEqual(blind);
    });

    it('hides buried from non-picker', () => {
      const config = makeConfig();
      const state = SheepsheadPlugin.createInitialState(config, [1, 2, 3]);
      const inPlay: SheepsheadState = {
        ...state,
        phase: 'play',
        buried: DECK.slice(0, 2),
        players: state.players.map((p) => ({
          ...p,
          role: p.userID === 2 ? ('picker' as const) : ('opposition' as const),
        })),
      };

      expect(SheepsheadPlugin.getPlayerView(config, inPlay, 1).buried).toBeNull();
      expect(SheepsheadPlugin.getPlayerView(config, inPlay, 2).buried).toEqual(DECK.slice(0, 2));
    });
  });

  describe('isGameOver', () => {
    it('returns true when phase is score', () => {
      const state = SheepsheadPlugin.createInitialState(makeConfig(), [1, 2, 3]);
      expect(SheepsheadPlugin.isGameOver({ ...state, phase: 'score' })).toBe(true);
    });

    it('returns false for other phases', () => {
      const state = SheepsheadPlugin.createInitialState(makeConfig(), [1, 2, 3]);
      expect(SheepsheadPlugin.isGameOver(state)).toBe(false); // 'deal'
      expect(SheepsheadPlugin.isGameOver({ ...state, phase: 'play' })).toBe(false);
    });
  });

  describe('crack / re-crack / blitz events', () => {
    function makePlayState(): SheepsheadState {
      const config = makeConfig({ cracking: true, blitzing: true });
      const state = SheepsheadPlugin.createInitialState(config, [1, 2, 3, 4, 5]);
      return {
        ...state,
        phase: 'pick',
        players: state.players.map((p, i) => ({
          ...p,
          role: i === 1 ? ('picker' as const) : ('opposition' as const),
          hand: DECK.slice(i * 6, i * 6 + 6),
        })),
        activePlayer: 3,
      };
    }

    it('crack sets crack state', () => {
      const config = makeConfig({ cracking: true });
      const state = makePlayState();
      const result = SheepsheadPlugin.applyEvent(config, state, {
        type: 'crack',
        userID: 3,
      });
      expect(result.crack).toEqual({ crackedBy: 3, reCrackedBy: null });
    });

    it('re-crack sets reCrackedBy on existing crack', () => {
      const config = makeConfig({ cracking: true });
      const state = { ...makePlayState(), crack: { crackedBy: 3, reCrackedBy: null } };
      const result = SheepsheadPlugin.applyEvent(config, state, {
        type: 're_crack',
        userID: 2,
      });
      expect(result.crack).toEqual({ crackedBy: 3, reCrackedBy: 2 });
    });

    it('re-crack throws when no existing crack', () => {
      const config = makeConfig({ cracking: true });
      const state = makePlayState();
      expect(() =>
        SheepsheadPlugin.applyEvent(config, state, { type: 're_crack', userID: 2 }),
      ).toThrow('Cannot re-crack');
    });

    it('blitz sets blitz state', () => {
      const config = makeConfig({ blitzing: true });
      const state = { ...makePlayState(), crack: { crackedBy: 3, reCrackedBy: null } };
      const result = SheepsheadPlugin.applyEvent(config, state, {
        type: 'blitz',
        userID: 1,
        payload: { blitzType: 'black-blitz' },
      });
      expect(result.blitz).toEqual({ type: 'black-blitz', blitzedBy: 1 });
    });

    it('blitz throws when already declared', () => {
      const config = makeConfig({ blitzing: true });
      const state = {
        ...makePlayState(),
        blitz: { type: 'black-blitz' as const, blitzedBy: 1 },
      };
      expect(() =>
        SheepsheadPlugin.applyEvent(config, state, {
          type: 'blitz',
          userID: 2,
          payload: { blitzType: 'red-blitz' },
        }),
      ).toThrow('Blitz already declared');
    });
  });

  describe('getValidActions', () => {
    it('returns empty for non-active player in pick phase', () => {
      const config = makeConfig();
      let state = SheepsheadPlugin.createInitialState(config, [1, 2, 3, 4, 5]);
      state = SheepsheadPlugin.applyEvent(config, state, { type: 'deal' });
      // activePlayer is 2 (left of dealer)
      expect(state.activePlayer).toBe(2);
      const actions = SheepsheadPlugin.getValidActions(config, state, 3);
      expect(actions).not.toContain('pick');
      expect(actions).not.toContain('pass');
    });

    it('returns pick/pass for active player in pick phase', () => {
      const config = makeConfig();
      let state = SheepsheadPlugin.createInitialState(config, [1, 2, 3, 4, 5]);
      state = SheepsheadPlugin.applyEvent(config, state, { type: 'deal' });
      const actions = SheepsheadPlugin.getValidActions(config, state, 2);
      expect(actions).toContain('pick');
      expect(actions).toContain('pass');
    });

    it('returns play_card only for active player in play phase', () => {
      const config = makeConfig({ partnerRule: 'jd' });
      let state = SheepsheadPlugin.createInitialState(config, [1, 2, 3]);
      state = SheepsheadPlugin.applyEvent(config, state, { type: 'deal' });
      state = SheepsheadPlugin.applyEvent(config, state, { type: 'pick', userID: 2 });
      const toBury = state.players[1].hand.slice(0, 2);
      state = SheepsheadPlugin.applyEvent(config, state, {
        type: 'bury',
        userID: 2,
        payload: { cards: toBury },
      });
      expect(state.phase).toBe('play');

      const activeActions = SheepsheadPlugin.getValidActions(config, state, state.activePlayer!);
      expect(activeActions).toContain('play_card');

      // Non-active player gets nothing
      const otherID = state.players.find((p) => p.userID !== state.activePlayer)!.userID;
      expect(SheepsheadPlugin.getValidActions(config, state, otherID)).not.toContain('play_card');
    });

    it('crack available for opposition during pick phase', () => {
      const config = makeConfig({ cracking: true });
      let state = SheepsheadPlugin.createInitialState(config, [1, 2, 3, 4, 5]);
      state = SheepsheadPlugin.applyEvent(config, state, { type: 'deal' });
      state = SheepsheadPlugin.applyEvent(config, state, { type: 'pick', userID: 2 });
      // Player 2 is picker (in bury phase now), but let's test during pick phase
      // Re-deal and have player 2 pick so others are opposition
      const state2 = {
        ...state,
        phase: 'pick' as const,
        players: state.players.map((p) => ({
          ...p,
          role: p.userID === 2 ? ('picker' as const) : ('opposition' as const),
        })),
      };
      const actions = SheepsheadPlugin.getValidActions(config, state2, 3);
      expect(actions).toContain('crack');
    });
  });

  describe('buildStore', () => {
    it('won is true when scoreDelta > 0', () => {
      const config = makeConfig();
      const state = SheepsheadPlugin.createInitialState(config, [1, 2, 3]);
      const scored = {
        ...state,
        players: state.players.map((p, i) => ({
          ...p,
          scoreDelta: i === 0 ? 2 : -1,
        })),
      };
      const store = SheepsheadPlugin.buildStore(config, scored);
      expect(store.players[0].won).toBe(true);
      expect(store.players[1].won).toBe(false);
      expect(store.players[2].won).toBe(false);
    });

    it('won is null when scoreDelta is null', () => {
      const config = makeConfig();
      const state = SheepsheadPlugin.createInitialState(config, [1, 2]);
      const store = SheepsheadPlugin.buildStore(config, state);
      for (const p of store.players) {
        expect(p.won).toBeNull();
      }
    });

    it('won is false when scoreDelta is 0', () => {
      const config = makeConfig();
      const state = SheepsheadPlugin.createInitialState(config, [1, 2]);
      const scored = {
        ...state,
        players: state.players.map((p) => ({ ...p, scoreDelta: 0 })),
      };
      const store = SheepsheadPlugin.buildStore(config, scored);
      for (const p of store.players) {
        expect(p.won).toBe(false);
      }
    });

    it('coerces null blind/buried to empty arrays', () => {
      const config = makeConfig();
      const state = {
        ...SheepsheadPlugin.createInitialState(config, [1, 2]),
        blind: null,
        buried: null,
      };
      const store = SheepsheadPlugin.buildStore(config, state);
      expect(store.blind).toEqual([]);
      expect(store.buried).toEqual([]);
    });
  });

  describe('getPlayerView schwanzer', () => {
    it('all hands visible in schwanzer mode', () => {
      const config = makeConfig();
      const state = SheepsheadPlugin.createInitialState(config, [1, 2, 3]);
      const schwanzer: SheepsheadState = {
        ...state,
        phase: 'score',
        noPick: 'schwanzer',
        players: state.players.map((p, i) => ({
          ...p,
          role: 'opposition' as const,
          hand: DECK.slice(i * 10, i * 10 + 10),
        })),
      };

      const view = SheepsheadPlugin.getPlayerView(config, schwanzer, 1);
      // All players' hands should be visible
      for (const p of view.players!) {
        expect(p.hand).toHaveLength(10);
      }
    });
  });

  describe('integration: full game flow', () => {
    it('deal → pick → bury → play → score', () => {
      const config = makeConfig({ partnerRule: 'jd' });
      const userIDs: UserID[] = [1, 2, 3];

      let state = SheepsheadPlugin.createInitialState(config, userIDs);

      // Deal
      state = SheepsheadPlugin.applyEvent(config, state, { type: 'deal' });
      expect(state.phase).toBe('pick');
      expect(state.activePlayer).toBe(2);

      // Player 2 picks
      state = SheepsheadPlugin.applyEvent(config, state, {
        type: 'pick',
        userID: 2,
      });
      expect(state.phase).toBe('bury');
      expect(state.players[1].role).toBe('picker');

      // Player 2 buries 2 cards
      const toBury = state.players[1].hand.slice(0, 2);
      state = SheepsheadPlugin.applyEvent(config, state, {
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

        state = SheepsheadPlugin.applyEvent(config, state, {
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
      state = SheepsheadPlugin.applyEvent(config, state, {
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
      expect(SheepsheadPlugin.isGameOver(state)).toBe(true);

      // Build store from final state
      const store = SheepsheadPlugin.buildStore(config, state);
      expect(store.tricks.length).toBeGreaterThan(0);
      expect(store.blind.length).toBeGreaterThan(0);
    });
  });
});
