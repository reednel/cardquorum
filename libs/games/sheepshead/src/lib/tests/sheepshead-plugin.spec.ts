import { DECK } from '../constants';
import { SheepsheadPlugin } from '../sheepshead-plugin';
import { SheepsheadConfig, SheepsheadState, UserID } from '../types';

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
    cardsRemoved: [],
    ...overrides,
  };
}

/** Build an input-shape config for validateConfig tests. */
function makeInputConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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
    cardsRemoved: [],
    ...overrides,
  };
}

describe('SheepsheadPlugin', () => {
  describe('validateConfig', () => {
    it('accepts valid config', () => {
      expect(SheepsheadPlugin.validateConfig(makeInputConfig())).toBe(true);
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
        expect(SheepsheadPlugin.validateConfig(makeInputConfig({ partnerRule: rule }))).toBe(true);
      }
    });

    it('rejects invalid partner rule', () => {
      expect(
        SheepsheadPlugin.validateConfig(makeInputConfig({ partnerRule: 'jack-of-diamonds' })),
      ).toBe(false);
      expect(SheepsheadPlugin.validateConfig(makeInputConfig({ partnerRule: 'none' }))).toBe(false);
    });

    it('accepts all valid picker rules', () => {
      for (const rule of ['autonomous', 'left-of-dealer', null]) {
        expect(SheepsheadPlugin.validateConfig(makeInputConfig({ pickerRule: rule }))).toBe(true);
      }
    });

    it('rejects invalid picker rule', () => {
      expect(SheepsheadPlugin.validateConfig(makeInputConfig({ pickerRule: 'random' }))).toBe(
        false,
      );
    });

    it('rejects non-object', () => {
      expect(SheepsheadPlugin.validateConfig(null)).toBe(false);
      expect(SheepsheadPlugin.validateConfig('string')).toBe(false);
    });

    it('rejects invalid playerCount', () => {
      expect(SheepsheadPlugin.validateConfig(makeInputConfig({ playerCount: 1 }))).toBe(false);
      expect(SheepsheadPlugin.validateConfig(makeInputConfig({ playerCount: 9 }))).toBe(false);
    });

    it('rejects missing boolean fields', () => {
      const config = { ...makeInputConfig() };
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
      expect(state.activePlayer).toBe(1);
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

    it('shows blind to picker during bury phase', () => {
      const config = makeConfig();
      const state = SheepsheadPlugin.createInitialState(config, [1, 2, 3]);
      const blind = DECK.slice(0, 2);
      const inBury: SheepsheadState = {
        ...state,
        phase: 'bury',
        blind,
        players: state.players.map((p) => ({
          ...p,
          role: p.userID === 1 ? ('picker' as const) : ('opposition' as const),
        })),
      };

      // Picker sees the blind during bury
      expect(SheepsheadPlugin.getPlayerView(config, inBury, 1).blind).toEqual(blind);
      // Non-picker does not
      expect(SheepsheadPlugin.getPlayerView(config, inBury, 2).blind).toEqual([]);
    });

    it('partner-draft: each player sees only their half of the blind during bury', () => {
      const config = makeConfig({
        name: 'partner-draft',
        partnerRule: 'left-of-picker',
        blindSize: 4,
        handSize: 4,
      });
      const blind = DECK.slice(0, 4);
      const state = SheepsheadPlugin.createInitialState(config, [1, 2, 3, 4, 5]);
      const inBury: SheepsheadState = {
        ...state,
        phase: 'bury',
        blind,
        players: state.players.map((p) => ({
          ...p,
          role:
            p.userID === 2
              ? ('picker' as const)
              : p.userID === 3
                ? ('partner' as const)
                : ('opposition' as const),
        })),
      };

      // Picker sees first half
      expect(SheepsheadPlugin.getPlayerView(config, inBury, 2).blind).toEqual(blind.slice(0, 2));
      // Partner sees second half
      expect(SheepsheadPlugin.getPlayerView(config, inBury, 3).blind).toEqual(blind.slice(2, 4));
      // Opposition sees nothing
      expect(SheepsheadPlugin.getPlayerView(config, inBury, 4).blind).toEqual([]);
    });

    it('hides blind during play phase', () => {
      const config = makeConfig();
      const state = SheepsheadPlugin.createInitialState(config, [1, 2, 3]);
      const inPlay: SheepsheadState = {
        ...state,
        phase: 'play',
        blind: DECK.slice(0, 2),
      };

      const view = SheepsheadPlugin.getPlayerView(config, inPlay, 1);
      expect(view.blind).toEqual([]);
    });

    it('hides buried cards from all players', () => {
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

      // Buried existence is visible (empty array) but contents are hidden from everyone
      expect(SheepsheadPlugin.getPlayerView(config, inPlay, 1).buried).toEqual([]);
      expect(SheepsheadPlugin.getPlayerView(config, inPlay, 2).buried).toEqual([]);
    });

    it('buried is null when no cards were buried', () => {
      const config = makeConfig();
      const state = SheepsheadPlugin.createInitialState(config, [1, 2, 3]);
      const inPlay: SheepsheadState = {
        ...state,
        phase: 'play',
        buried: null,
      };

      expect(SheepsheadPlugin.getPlayerView(config, inPlay, 1).buried).toBeNull();
    });
  });

  describe('isGameOver', () => {
    it('returns false when phase is score but scores not yet computed', () => {
      const state = SheepsheadPlugin.createInitialState(makeConfig(), [1, 2, 3]);
      expect(SheepsheadPlugin.isGameOver({ ...state, phase: 'score' })).toBe(false);
    });

    it('returns true when phase is score and scores have been computed', () => {
      const state = SheepsheadPlugin.createInitialState(makeConfig(), [1, 2, 3]);
      const scoredState = {
        ...state,
        phase: 'score' as const,
        players: state.players.map((p) => ({ ...p, scoreDelta: 0 })),
      };
      expect(SheepsheadPlugin.isGameOver(scoredState)).toBe(true);
    });

    it('returns false for other phases', () => {
      const state = SheepsheadPlugin.createInitialState(makeConfig(), [1, 2, 3]);
      expect(SheepsheadPlugin.isGameOver(state)).toBe(false);
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

    it('forced-pick: last player (dealer) can only pick, not pass', () => {
      const config = makeConfig({ noPick: 'forced-pick' });
      let state = SheepsheadPlugin.createInitialState(config, [1, 2, 3, 4, 5]);
      state = SheepsheadPlugin.applyEvent(config, state, { type: 'deal' });

      // Pass all players until dealer (player 1) is active
      state = SheepsheadPlugin.applyEvent(config, state, { type: 'pass', userID: 2 });
      state = SheepsheadPlugin.applyEvent(config, state, { type: 'pass', userID: 3 });
      state = SheepsheadPlugin.applyEvent(config, state, { type: 'pass', userID: 4 });
      state = SheepsheadPlugin.applyEvent(config, state, { type: 'pass', userID: 5 });
      expect(state.activePlayer).toBe(1);

      const actions = SheepsheadPlugin.getValidActions(config, state, 1);
      expect(actions).toContain('pick');
      expect(actions).not.toContain('pass');
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

    it('only dealer can trigger deal', () => {
      const config = makeConfig();
      const state = SheepsheadPlugin.createInitialState(config, [1, 2, 3, 4, 5]);
      // Dealer (player 1) can deal
      expect(SheepsheadPlugin.getValidActions(config, state, 1)).toContain('deal');
      // Non-dealer cannot
      expect(SheepsheadPlugin.getValidActions(config, state, 2)).not.toContain('deal');
    });

    it('crack not available during pick phase', () => {
      const config = makeConfig({ cracking: true });
      let state = SheepsheadPlugin.createInitialState(config, [1, 2, 3, 4, 5]);
      state = SheepsheadPlugin.applyEvent(config, state, { type: 'deal' });
      state = SheepsheadPlugin.applyEvent(config, state, { type: 'pick', userID: 2 });
      // Force back to pick phase to verify crack isn't offered there
      const state2 = {
        ...state,
        phase: 'pick' as const,
        players: state.players.map((p) => ({
          ...p,
          role: p.userID === 2 ? ('picker' as const) : ('opposition' as const),
        })),
      };
      const actions = SheepsheadPlugin.getValidActions(config, state2, 3);
      expect(actions).not.toContain('crack');
    });

    it('crack available in play phase for opposition who did not get to pick', () => {
      const config = makeConfig({ cracking: true });
      // 5 players: dealer=1, pick order: 2,3,4,5,1. Player 2 picks.
      // Players 3,4,5,1 didn't get a chance to pick.
      const state: SheepsheadState = {
        ...SheepsheadPlugin.createInitialState(config, [1, 2, 3, 4, 5]),
        phase: 'play',
        trickNumber: 1,
        tricks: [{ plays: [], winner: null }],
        activePlayer: 2,
        players: [1, 2, 3, 4, 5].map((id) => ({
          userID: id,
          role: id === 2 ? ('picker' as const) : ('opposition' as const),
          hand: DECK.slice((id - 1) * 6, (id - 1) * 6 + 6),
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        })),
      };

      // Player 3 didn't get to pick → can crack
      expect(SheepsheadPlugin.getValidActions(config, state, 3)).toContain('crack');
      // Player 5 didn't get to pick → can crack
      expect(SheepsheadPlugin.getValidActions(config, state, 5)).toContain('crack');
    });

    it('crack not available for opposition who had a chance to pick', () => {
      const config = makeConfig({ cracking: true });
      // Player 4 picks (seats 2,3 passed first). Player 2 and 3 had a chance.
      const state: SheepsheadState = {
        ...SheepsheadPlugin.createInitialState(config, [1, 2, 3, 4, 5]),
        phase: 'play',
        trickNumber: 1,
        tricks: [{ plays: [], winner: null }],
        activePlayer: 5,
        players: [1, 2, 3, 4, 5].map((id) => ({
          userID: id,
          role: id === 4 ? ('picker' as const) : ('opposition' as const),
          hand: DECK.slice((id - 1) * 6, (id - 1) * 6 + 6),
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        })),
      };

      // Players 2 and 3 passed before player 4 picked → had a chance → no crack
      expect(SheepsheadPlugin.getValidActions(config, state, 2)).not.toContain('crack');
      expect(SheepsheadPlugin.getValidActions(config, state, 3)).not.toContain('crack');
      // Player 5 didn't get to pick → can crack
      expect(SheepsheadPlugin.getValidActions(config, state, 5)).toContain('crack');
    });

    it('blitz available without crack', () => {
      const config = makeConfig({ blitzing: true });
      // Player has both black queens, no crack declared
      const state: SheepsheadState = {
        ...SheepsheadPlugin.createInitialState(config, [1, 2, 3, 4, 5]),
        phase: 'play',
        trickNumber: 1,
        tricks: [{ plays: [], winner: null }],
        activePlayer: 2,
        crack: null,
        players: [1, 2, 3, 4, 5].map((id) => ({
          userID: id,
          role: id === 2 ? ('picker' as const) : ('opposition' as const),
          hand:
            id === 3
              ? [DECK.find((c) => c.name === 'qc')!, DECK.find((c) => c.name === 'qs')!]
              : DECK.slice((id - 1) * 6, (id - 1) * 6 + 6),
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        })),
      };

      const actions = SheepsheadPlugin.getValidActions(config, state, 3);
      expect(actions).toContain('blitz');
    });

    it('crack/blitz not available after first card played', () => {
      const config = makeConfig({ cracking: true, blitzing: true });
      const state: SheepsheadState = {
        ...SheepsheadPlugin.createInitialState(config, [1, 2, 3, 4, 5]),
        phase: 'play',
        trickNumber: 1,
        tricks: [{ plays: [{ player: 2, card: DECK[0] }], winner: null }],
        activePlayer: 3,
        players: [1, 2, 3, 4, 5].map((id) => ({
          userID: id,
          role: id === 2 ? ('picker' as const) : ('opposition' as const),
          hand:
            id === 3
              ? [DECK.find((c) => c.name === 'qc')!, DECK.find((c) => c.name === 'qs')!]
              : DECK.slice((id - 1) * 6, (id - 1) * 6 + 6),
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        })),
      };

      const actions = SheepsheadPlugin.getValidActions(config, state, 3);
      expect(actions).not.toContain('crack');
      expect(actions).not.toContain('blitz');
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

    it('preserves null blind/buried in store', () => {
      const config = makeConfig();
      const state = {
        ...SheepsheadPlugin.createInitialState(config, [1, 2]),
        blind: null,
        buried: null,
      };
      const store = SheepsheadPlugin.buildStore(config, state);
      expect(store.blind).toBeNull();
      expect(store.buried).toBeNull();
    });
  });

  describe('getPlayerView tricks/hole', () => {
    it('exposes current trick but hides hole card from view', () => {
      const config = makeConfig();
      const state = SheepsheadPlugin.createInitialState(config, [1, 2, 3]);
      const inPlay: SheepsheadState = {
        ...state,
        phase: 'play',
        hole: DECK.find((c) => c.name === 'ac')!,
        tricks: [
          {
            plays: [{ player: 1, card: DECK[0] }],
            winner: null,
          },
        ],
      };

      const view = SheepsheadPlugin.getPlayerView(config, inPlay, 1);
      // Current (in-progress) trick is visible so cards can render on the table
      expect(view.tricks).toEqual([{ plays: [{ player: 1, card: DECK[0] }], winner: null }]);
      expect(view.hole).toBeNull();
    });

    it('hides completed tricks from view', () => {
      const config = makeConfig();
      const state = SheepsheadPlugin.createInitialState(config, [1, 2, 3]);
      const inPlay: SheepsheadState = {
        ...state,
        phase: 'play',
        tricks: [
          {
            plays: [
              { player: 1, card: DECK[0] },
              { player: 2, card: DECK[1] },
            ],
            winner: 1,
          },
          {
            plays: [{ player: 1, card: DECK[2] }],
            winner: null,
          },
        ],
      };

      const view = SheepsheadPlugin.getPlayerView(config, inPlay, 1);
      // Only the current in-progress trick is visible
      expect(view.tricks).toEqual([{ plays: [{ player: 1, card: DECK[2] }], winner: null }]);
    });

    it('hides other players roles', () => {
      const config = makeConfig();
      const state = SheepsheadPlugin.createInitialState(config, [1, 2, 3]);
      const inPlay: SheepsheadState = {
        ...state,
        phase: 'play',
        players: state.players.map((p) => ({
          ...p,
          role: p.userID === 2 ? ('picker' as const) : ('opposition' as const),
        })),
      };

      const view = SheepsheadPlugin.getPlayerView(config, inPlay, 1);
      expect(view.players![0].role).toBe('opposition'); // own role visible
      expect(view.players![1].role).toBeNull(); // other role hidden
      expect(view.players![2].role).toBeNull(); // other role hidden
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

  describe('trick_advance through applyEvent', () => {
    it('advances a pending trick-completion state to the next trick or score', () => {
      const config = makeConfig({ partnerRule: 'jd' });
      const userIDs: UserID[] = [1, 2, 3];

      let state = SheepsheadPlugin.createInitialState(config, userIDs);
      state = SheepsheadPlugin.applyEvent(config, state, { type: 'deal' });
      state = SheepsheadPlugin.applyEvent(config, state, { type: 'pick', userID: 2 });
      const toBury = state.players[1].hand.slice(0, 2);
      state = SheepsheadPlugin.applyEvent(config, state, {
        type: 'bury',
        userID: 2,
        payload: { cards: toBury },
      });
      expect(state.phase).toBe('play');

      // Play one full trick
      const { legalPlays } = require('../tricks');
      for (let i = 0; i < userIDs.length; i++) {
        const active = state.activePlayer!;
        const cardToPlay = legalPlays(state, config, active).cards[0];
        state = SheepsheadPlugin.applyEvent(config, state, {
          type: 'play_card',
          userID: active,
          payload: { card: cardToPlay },
        });
      }

      // After a full trick, state should be pending with scheduledEvents
      expect(state.activePlayer).toBeNull();
      expect(state.scheduledEvents).toEqual([{ event: { type: 'trick_advance' }, delayMs: 2000 }]);

      // Apply trick_advance through the plugin's applyEvent
      state = SheepsheadPlugin.applyEvent(config, state, { type: 'trick_advance' });

      // Should have advanced: either new trick started or moved to score
      expect(state.scheduledEvents).toBeUndefined();
      if (state.phase === 'play') {
        expect(state.activePlayer).not.toBeNull();
        expect(state.trickNumber).toBe(2);
      } else {
        expect(state.phase).toBe('score');
        expect(state.activePlayer).toBeNull();
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
        if (state.activePlayer === null) {
          // Pending state — advance past the trick-completion pause
          state = SheepsheadPlugin.applyEvent(config, state, { type: 'trick_advance' });
          continue;
        }

        const activePlayer = state.activePlayer;
        const playerIdx = state.players.findIndex((p) => p.userID === activePlayer);
        const hand = state.players[playerIdx].hand;
        const currentTrick = state.tricks[state.tricks.length - 1];

        // Pick the first legal card
        const { legalPlays } = require('../tricks');
        const cardToPlay = legalPlays(state, config, activePlayer).cards[0];

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
      expect(store.tricks?.length).toBeGreaterThan(0);
      expect(store.blind?.length).toBeGreaterThan(0);
    });
  });
});
