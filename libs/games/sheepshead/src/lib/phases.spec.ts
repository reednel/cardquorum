import {
  handleDeal,
  handlePick,
  handleBury,
  handleCall,
  handlePlayCard,
  handleScore,
} from './phases';
import { DECK } from './constants';
import { Card, SheepsheadConfig, SheepsheadState, SheepsheadStore } from './types';

function card(name: string): Card {
  const c = DECK.find((d) => d.name === name);
  if (!c) throw new Error(`Card not found: ${name}`);
  return c;
}

function makeConfig(overrides: Partial<SheepsheadConfig> = {}): SheepsheadConfig {
  return {
    playerCount: 3,
    handSize: 10,
    blindSize: 2,
    pickerRule: 'autonomous',
    partnerRule: 'jd',
    noPick: 'leaster',
    cracking: false,
    blitzing: false,
    doubleOnTheBump: false,
    partnerOffTheHook: false,
    noAceFaceTrump: false,
    multiplicityLimit: null,
    ...overrides,
  };
}

function makeState(playerCount = 3): SheepsheadState {
  return {
    players: Array.from({ length: playerCount }, (_, i) => ({
      userID: i + 1,
      role: null,
      hand: [],
      tricksWon: 0,
      pointsWon: 0,
      cardsWon: [],
      scoreDelta: null,
    })),
    phase: 'deal' as const,
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

function makeStore(playerCount = 3): SheepsheadStore {
  return {
    players: Array.from({ length: playerCount }, (_, i) => ({
      userID: i + 1,
      role: null,
      won: null,
      scoreDelta: null,
    })),
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

describe('handleDeal', () => {
  it('distributes cards to players and sets blind', () => {
    const config = makeConfig();
    const [state, store] = handleDeal(makeState(), makeStore(), config);

    expect(state.phase).toBe('pick');
    expect(state.blind).toHaveLength(config.blindSize);
    for (const p of state.players) {
      expect(p.hand).toHaveLength(config.handSize);
    }

    // Store has blind copy
    expect(store.blind).toHaveLength(config.blindSize);
  });

  it('sets activePlayer to player after dealer (index 1)', () => {
    const config = makeConfig();
    const [state] = handleDeal(makeState(), makeStore(), config);
    expect(state.activePlayer).toBe(2); // userID of index 1
  });

  it('all 32 cards accounted for', () => {
    const config = makeConfig();
    const [state] = handleDeal(makeState(), makeStore(), config);
    const allCards = [...(state.blind ?? []), ...state.players.flatMap((p) => p.hand)];
    expect(allCards).toHaveLength(32);
    expect(new Set(allCards.map((c) => c.name)).size).toBe(32);
  });
});

describe('handlePick', () => {
  it('pick: sets player as picker and adds blind to hand', () => {
    const config = makeConfig();
    const [dealt, dealStore] = handleDeal(makeState(), makeStore(), config);
    const blindSize = dealt.blind?.length ?? 0;
    const handSize = dealt.players[1].hand.length;

    const result = handlePick(dealt, dealStore, { type: 'pick', userID: 2 }, config);
    expect(result).not.toBeNull();
    const [state] = result!;

    expect(state.players[1].role).toBe('picker');
    expect(state.players[1].hand).toHaveLength(handSize + blindSize);
    expect(state.phase).toBe('bury');
  });

  it('pass: advances activePlayer to next', () => {
    const config = makeConfig();
    const [dealt, dealStore] = handleDeal(makeState(), makeStore(), config);

    const result = handlePick(dealt, dealStore, { type: 'pass', userID: 2 }, config);
    expect(result).not.toBeNull();
    const [state] = result!;

    expect(state.activePlayer).toBe(3); // next player
  });

  it('all pass with leaster noPick: transitions to play as leaster', () => {
    const config = makeConfig({ noPick: 'leaster' });
    const [dealt, dealStore] = handleDeal(makeState(), makeStore(), config);

    // All 3 players pass: active starts at 2, pass→3, pass→1, pass→back to 2 (full circle)
    let result = handlePick(dealt, dealStore, { type: 'pass', userID: 2 }, config);
    expect(result).not.toBeNull();
    result = handlePick(result![0], result![1], { type: 'pass', userID: 3 }, config);
    expect(result).not.toBeNull();
    // Player 1 is last — passing completes the circle
    result = handlePick(result![0], result![1], { type: 'pass', userID: 1 }, config);

    expect(result).not.toBeNull();
    const [state, store] = result!;
    expect(state.phase).toBe('play');
    expect(state.noPick).toBe('leaster');
    expect(store.noPick).toBe('leaster');
  });

  it('all pass with null noPick: returns null (re-deal needed)', () => {
    const config = makeConfig({ noPick: null });
    const [dealt, dealStore] = handleDeal(makeState(), makeStore(), config);

    let result = handlePick(dealt, dealStore, { type: 'pass', userID: 2 }, config);
    result = handlePick(result![0], result![1], { type: 'pass', userID: 3 }, config);
    result = handlePick(result![0], result![1], { type: 'pass', userID: 1 }, config);

    expect(result).toBeNull();
  });
});

describe('handleBury', () => {
  it('removes buried cards from picker hand', () => {
    const config = makeConfig();
    const [dealt, dealStore] = handleDeal(makeState(), makeStore(), config);
    const [picked, pickStore] = handlePick(dealt, dealStore, { type: 'pick', userID: 2 }, config)!;

    const handBefore = picked.players[1].hand;
    const toBury = handBefore.slice(0, 2);

    const [state, store] = handleBury(
      picked,
      pickStore,
      {
        type: 'bury',
        userID: 2,
        payload: { cards: toBury },
      },
      config,
    );

    expect(state.players[1].hand).toHaveLength(handBefore.length - 2);
    expect(state.buried).toEqual(toBury);
    expect(store.buried).toEqual(toBury);
  });

  it('transitions to call phase for called-ace rule', () => {
    const config = makeConfig({ partnerRule: 'called-ace' });
    const [dealt, dealStore] = handleDeal(makeState(), makeStore(), config);
    const [picked, pickStore] = handlePick(dealt, dealStore, { type: 'pick', userID: 2 }, config)!;

    const toBury = picked.players[1].hand.slice(0, 2);
    const [state] = handleBury(
      picked,
      pickStore,
      {
        type: 'bury',
        userID: 2,
        payload: { cards: toBury },
      },
      config,
    );

    expect(state.phase).toBe('call');
  });

  it('transitions to play phase for non-called-ace rules', () => {
    const config = makeConfig({ partnerRule: 'jd' });
    const [dealt, dealStore] = handleDeal(makeState(), makeStore(), config);
    const [picked, pickStore] = handlePick(dealt, dealStore, { type: 'pick', userID: 2 }, config)!;

    const toBury = picked.players[1].hand.slice(0, 2);
    const [state] = handleBury(
      picked,
      pickStore,
      {
        type: 'bury',
        userID: 2,
        payload: { cards: toBury },
      },
      config,
    );

    expect(state.phase).toBe('play');
    expect(state.trickNumber).toBe(1);
    expect(state.tricks).toHaveLength(1);
  });
});

describe('handleCall', () => {
  it('sets calledSuit and assigns roles', () => {
    const config = makeConfig({ partnerRule: 'called-ace' });
    const [dealt, dealStore] = handleDeal(makeState(), makeStore(), config);
    const [picked, pickStore] = handlePick(dealt, dealStore, { type: 'pick', userID: 2 }, config)!;
    const toBury = picked.players[1].hand.slice(0, 2);
    const [buried, buryStore] = handleBury(
      picked,
      pickStore,
      {
        type: 'bury',
        userID: 2,
        payload: { cards: toBury },
      },
      config,
    );

    const [state, store] = handleCall(buried, buryStore, {
      type: 'call_ace',
      userID: 2,
      payload: { suit: 'clubs' },
    });

    expect(state.calledSuit).toBe('clubs');
    expect(store.calledSuit).toBe('clubs');
    expect(state.phase).toBe('play');
    // Picker should still be picker
    expect(state.players[1].role).toBe('picker');
    // Other players should have roles assigned
    expect(state.players.every((p) => p.role !== null)).toBe(true);
  });
});

describe('handlePlayCard', () => {
  /** Helper: set up a game at the play phase with known hands. */
  function setupPlayPhase() {
    // 3-player game with deterministic hands
    const state: SheepsheadState = {
      players: [
        {
          userID: 1,
          role: 'opposition',
          hand: [card('ac'), card('kc'), card('7c')],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 2,
          role: 'picker',
          hand: [card('qc'), card('jc'), card('ad')],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 3,
          role: 'opposition',
          hand: [card('as'), card('ks'), card('7s')],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
      ],
      phase: 'play',
      trickNumber: 1,
      activePlayer: 1,
      blind: [],
      buried: [],
      calledSuit: null,
      tricks: [{ plays: [], winner: null }],
      crack: null,
      blitz: null,
      previousGameDouble: null,
      noPick: null,
    };
    const store: SheepsheadStore = {
      players: [
        { userID: 1, role: null, won: null, scoreDelta: null },
        { userID: 2, role: null, won: null, scoreDelta: null },
        { userID: 3, role: null, won: null, scoreDelta: null },
      ],
      blind: [],
      buried: [],
      calledSuit: null,
      tricks: [],
      crack: null,
      blitz: null,
      previousGameDouble: null,
      noPick: null,
    };
    return { state, store };
  }

  it('removes card from hand and adds to trick', () => {
    const { state, store } = setupPlayPhase();
    const config = makeConfig();

    const [newState] = handlePlayCard(
      state,
      store,
      {
        type: 'play_card',
        userID: 1,
        payload: { card: card('ac') },
      },
      config,
    );

    expect(newState.players[0].hand).toHaveLength(2);
    expect(newState.tricks[0].plays).toHaveLength(1);
    expect(newState.tricks[0].plays[0].card.name).toBe('ac');
  });

  it('throws on illegal play', () => {
    const { state, store } = setupPlayPhase();
    const config = makeConfig();

    // Player 1 doesn't have queen of spades
    expect(() =>
      handlePlayCard(
        state,
        store,
        {
          type: 'play_card',
          userID: 1,
          payload: { card: card('qs') },
        },
        config,
      ),
    ).toThrow('Illegal play');
  });

  it('completes trick and determines winner', () => {
    const { state, store } = setupPlayPhase();
    const config = makeConfig();

    // Player 1 leads Ace of Clubs
    let [s, st] = handlePlayCard(
      state,
      store,
      {
        type: 'play_card',
        userID: 1,
        payload: { card: card('ac') },
      },
      config,
    );

    // Player 2 plays Queen of Clubs (trump — wins)
    [s, st] = handlePlayCard(
      s,
      st,
      {
        type: 'play_card',
        userID: 2,
        payload: { card: card('qc') },
      },
      config,
    );

    // Player 3 plays Ace of Spades (off-suit, doesn't compete)
    [s, st] = handlePlayCard(
      s,
      st,
      {
        type: 'play_card',
        userID: 3,
        payload: { card: card('as') },
      },
      config,
    );

    // Trick complete — player 2 (queen of clubs) wins
    expect(st.tricks).toHaveLength(1);
    expect(st.tricks[0].winner).toBe(2);
    expect(s.players[1].tricksWon).toBe(1);
    expect(s.players[1].pointsWon).toBe(25); // ac(11) + qc(3) + as(11)
  });

  it('transitions to score when all cards played', () => {
    const config = makeConfig();
    // Set up with 1 card each for a quick game
    const state: SheepsheadState = {
      players: [
        {
          userID: 1,
          role: 'opposition',
          hand: [card('ac')],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 2,
          role: 'picker',
          hand: [card('qc')],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 3,
          role: 'opposition',
          hand: [card('as')],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
      ],
      phase: 'play',
      trickNumber: 1,
      activePlayer: 1,
      blind: [],
      buried: [],
      calledSuit: null,
      tricks: [{ plays: [], winner: null }],
      crack: null,
      blitz: null,
      previousGameDouble: null,
      noPick: null,
    };
    const store = makeStore();

    let [s, st] = handlePlayCard(
      state,
      store,
      {
        type: 'play_card',
        userID: 1,
        payload: { card: card('ac') },
      },
      config,
    );
    [s, st] = handlePlayCard(
      s,
      st,
      {
        type: 'play_card',
        userID: 2,
        payload: { card: card('qc') },
      },
      config,
    );
    [s, st] = handlePlayCard(
      s,
      st,
      {
        type: 'play_card',
        userID: 3,
        payload: { card: card('as') },
      },
      config,
    );

    expect(s.phase).toBe('score');
    expect(s.activePlayer).toBeNull();
  });
});

describe('handleScore', () => {
  it('calculates score deltas for all players', () => {
    const config = makeConfig();
    const state: SheepsheadState = {
      players: [
        {
          userID: 1,
          role: 'opposition',
          hand: [],
          tricksWon: 1,
          pointsWon: 30,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 2,
          role: 'picker',
          hand: [],
          tricksWon: 2,
          pointsWon: 90,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 3,
          role: 'opposition',
          hand: [],
          tricksWon: 1,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
      ],
      phase: 'score',
      trickNumber: null,
      activePlayer: null,
      blind: [],
      buried: [],
      calledSuit: null,
      tricks: [
        {
          plays: [
            { player: 2, card: card('ac') },
            { player: 1, card: card('7c') },
          ],
          winner: 2,
        },
        {
          plays: [
            { player: 2, card: card('as') },
            { player: 3, card: card('7s') },
          ],
          winner: 2,
        },
        {
          plays: [
            { player: 1, card: card('kc') },
            { player: 3, card: card('ks') },
          ],
          winner: 1,
        },
      ],
      crack: null,
      blitz: null,
      previousGameDouble: null,
      noPick: null,
    };
    const store = makeStore();

    const [scored, scoredStore] = handleScore(state, store, config);

    // All players should have score deltas
    for (const p of scored.players) {
      expect(p.scoreDelta).not.toBeNull();
    }

    // Store should have roles and won status
    for (const p of scoredStore.players) {
      expect(p.scoreDelta).not.toBeNull();
      expect(p.won).not.toBeNull();
    }
  });

  it('picker wins with 61+ points', () => {
    const config = makeConfig();
    const state: SheepsheadState = {
      players: [
        {
          userID: 1,
          role: 'opposition',
          hand: [],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 2,
          role: 'picker',
          hand: [],
          tricksWon: 1,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 3,
          role: 'opposition',
          hand: [],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
      ],
      phase: 'score',
      trickNumber: null,
      activePlayer: null,
      blind: [],
      // Buried counts for picker: 61 points from buried alone
      buried: [card('ac'), card('as'), card('ah'), card('xc'), card('xs'), card('xh')],
      calledSuit: null,
      tricks: [
        {
          plays: [
            { player: 2, card: card('7c') },
            { player: 1, card: card('7s') },
          ],
          winner: 2,
        },
        {
          plays: [
            { player: 1, card: card('kc') },
            { player: 3, card: card('ks') },
          ],
          winner: 1,
        },
      ],
      crack: null,
      blitz: null,
      previousGameDouble: null,
      noPick: null,
    };
    const store = makeStore();

    const [scored] = handleScore(state, store, config);
    // Picker (player 2) should have positive scoreDelta
    expect(scored.players[1].scoreDelta).toBeGreaterThan(0);
    // Opposition should have negative
    expect(scored.players[0].scoreDelta).toBeLessThan(0);
  });
});
