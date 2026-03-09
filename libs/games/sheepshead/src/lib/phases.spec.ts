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

  it('pickerRule null: skips pick phase, assigns partners, goes to play', () => {
    const config = makeConfig({
      playerCount: 4,
      handSize: 8,
      blindSize: 0,
      pickerRule: null,
      partnerRule: 'qc-qs',
      noPick: null,
    });
    const [state, store] = handleDeal(makeState(4), makeStore(4), config);

    expect(state.phase).toBe('play');
    expect(state.blind).toHaveLength(0);
    expect(state.trickNumber).toBe(1);
    expect(state.tricks).toHaveLength(1);
    // All players should have hands
    for (const p of state.players) {
      expect(p.hand).toHaveLength(8);
    }
  });

  it('pickerRule left-of-dealer: auto-picks for player left of dealer, goes to bury', () => {
    const config = makeConfig({
      playerCount: 5,
      handSize: 6,
      blindSize: 2,
      pickerRule: 'left-of-dealer',
      partnerRule: 'called-ace',
      noPick: null,
    });
    const [state] = handleDeal(makeState(5), makeStore(5), config);

    expect(state.phase).toBe('bury');
    // Player at index 1 (left of dealer) should be picker
    expect(state.players[1].role).toBe('picker');
    // Picker should have hand + blind cards
    expect(state.players[1].hand).toHaveLength(6 + 2);
    expect(state.activePlayer).toBe(state.players[1].userID);
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

  it('all pass with forced-pick: last player is forced to pick', () => {
    const config = makeConfig({ noPick: 'forced-pick' });
    const [dealt, dealStore] = handleDeal(makeState(), makeStore(), config);

    let result = handlePick(dealt, dealStore, { type: 'pass', userID: 2 }, config);
    result = handlePick(result![0], result![1], { type: 'pass', userID: 3 }, config);
    // Player 1 is last — should be forced to pick
    result = handlePick(result![0], result![1], { type: 'pass', userID: 1 }, config);

    expect(result).not.toBeNull();
    const [state] = result!;
    expect(state.phase).toBe('bury');
    expect(state.players[0].role).toBe('picker');
    // Player 1 should have hand + blind
    expect(state.players[0].hand).toHaveLength(10 + 2);
    expect(state.activePlayer).toBe(1);
  });

  it.each(['moster', 'mittler', 'schneidster', 'schwanzer'] as const)(
    'all pass with %s noPick: transitions to play with all opposition',
    (noPick) => {
      const config = makeConfig({ noPick });
      const [dealt, dealStore] = handleDeal(makeState(), makeStore(), config);

      let result = handlePick(dealt, dealStore, { type: 'pass', userID: 2 }, config);
      result = handlePick(result![0], result![1], { type: 'pass', userID: 3 }, config);
      result = handlePick(result![0], result![1], { type: 'pass', userID: 1 }, config);

      expect(result).not.toBeNull();
      const [state, store] = result!;
      expect(state.phase).toBe('play');
      expect(state.noPick).toBe(noPick);
      expect(store.noPick).toBe(noPick);
      expect(state.players.every((p) => p.role === 'opposition')).toBe(true);
    },
  );

  it('all pass with doubler: returns null (re-deal with previousGameDouble)', () => {
    const config = makeConfig({ noPick: 'doubler' });
    const [dealt, dealStore] = handleDeal(makeState(), makeStore(), config);

    let result = handlePick(dealt, dealStore, { type: 'pass', userID: 2 }, config);
    result = handlePick(result![0], result![1], { type: 'pass', userID: 3 }, config);
    result = handlePick(result![0], result![1], { type: 'pass', userID: 1 }, config);

    // Doubler triggers a re-deal, returns null
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

  it('first-trick partner: winner of trick 1 becomes partner', () => {
    const config = makeConfig({ partnerRule: 'first-trick' });
    const state: SheepsheadState = {
      players: [
        {
          userID: 1,
          role: 'opposition',
          hand: [card('ac'), card('kc')],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 2,
          role: 'picker',
          hand: [card('qc'), card('jc')],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 3,
          role: null,
          hand: [card('as'), card('ks')],
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

    // Player 1 leads Ac, Player 2 plays Qc (trump wins), Player 3 plays As
    let [s, st] = handlePlayCard(
      state,
      store,
      { type: 'play_card', userID: 1, payload: { card: card('ac') } },
      config,
    );
    [s, st] = handlePlayCard(
      s,
      st,
      { type: 'play_card', userID: 2, payload: { card: card('qc') } },
      config,
    );
    [s, st] = handlePlayCard(
      s,
      st,
      { type: 'play_card', userID: 3, payload: { card: card('as') } },
      config,
    );

    // Player 2 (picker) won trick 1 — they can't be their own partner
    // Actually picker won, so winner = picker. Let's check: the picker should stay picker,
    // and no partner is assigned (winner is the picker themselves)
    expect(s.players[1].role).toBe('picker');
    // Player 3 should be opposition since picker won
    expect(s.players[2].role).toBe('opposition');
  });

  it('first-trick partner: non-picker winner of trick 1 becomes partner', () => {
    const config = makeConfig({ partnerRule: 'first-trick' });
    const state: SheepsheadState = {
      players: [
        {
          userID: 1,
          role: null,
          hand: [card('ac'), card('kc')],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 2,
          role: 'picker',
          hand: [card('7c'), card('jc')],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 3,
          role: null,
          hand: [card('as'), card('ks')],
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

    // Player 1 leads Ac (clubs), Player 2 plays 7c (must follow clubs), Player 3 plays As (off-suit)
    // Ac wins within clubs suit
    let [s, st] = handlePlayCard(
      state,
      store,
      { type: 'play_card', userID: 1, payload: { card: card('ac') } },
      config,
    );
    [s, st] = handlePlayCard(
      s,
      st,
      { type: 'play_card', userID: 2, payload: { card: card('7c') } },
      config,
    );
    [s, st] = handlePlayCard(
      s,
      st,
      { type: 'play_card', userID: 3, payload: { card: card('as') } },
      config,
    );

    // Player 1 won trick 1 — becomes partner
    expect(s.players[0].role).toBe('partner');
    expect(s.players[1].role).toBe('picker');
    expect(s.players[2].role).toBe('opposition');
  });

  it('leaster: last trick winner gets blind points', () => {
    const config = makeConfig({ noPick: 'leaster' });
    // 3 players with 1 card each, blind has points
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
          role: 'opposition',
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
      blind: [card('xc'), card('xs')], // 10 + 10 = 20 points
      buried: [],
      calledSuit: null,
      tricks: [{ plays: [], winner: null }],
      crack: null,
      blitz: null,
      previousGameDouble: null,
      noPick: 'leaster',
    };
    const store = makeStore();

    // Qc (trump) wins
    let [s, st] = handlePlayCard(
      state,
      store,
      { type: 'play_card', userID: 1, payload: { card: card('ac') } },
      config,
    );
    [s, st] = handlePlayCard(
      s,
      st,
      { type: 'play_card', userID: 2, payload: { card: card('qc') } },
      config,
    );
    [s, st] = handlePlayCard(
      s,
      st,
      { type: 'play_card', userID: 3, payload: { card: card('as') } },
      config,
    );

    // Player 2 won the last (only) trick — should get blind points too
    expect(s.phase).toBe('score');
    // Trick points: ac(11) + qc(3) + as(11) = 25, blind: 20 → total 45
    expect(s.players[1].pointsWon).toBe(25 + 20);
    expect(s.players[1].cardsWon).toHaveLength(3 + 2); // 3 trick cards + 2 blind cards
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

  /** Helper: build a noPick score-phase state with given points. */
  function makeNoPickScoreState(
    pointsWon: number[],
    tricksWon: number[],
    noPick: SheepsheadConfig['noPick'],
  ): SheepsheadState {
    return {
      players: pointsWon.map((pts, i) => ({
        userID: i + 1,
        role: 'opposition' as const,
        hand: [],
        tricksWon: tricksWon[i],
        pointsWon: pts,
        cardsWon: [],
        scoreDelta: null,
      })),
      phase: 'score',
      trickNumber: null,
      activePlayer: null,
      blind: [],
      buried: [],
      calledSuit: null,
      tricks: [],
      crack: null,
      blitz: null,
      previousGameDouble: null,
      noPick,
    };
  }

  it('moster: player with most points is the only loser', () => {
    const config = makeConfig({ noPick: 'moster' });
    const state = makeNoPickScoreState([40, 50, 30], [2, 3, 2], 'moster');
    const [scored] = handleScore(state, makeStore(), config);

    // Player 2 (50 pts) is the loser
    expect(scored.players[1].scoreDelta).toBeLessThan(0);
    // Others win
    expect(scored.players[0].scoreDelta).toBeGreaterThan(0);
    expect(scored.players[2].scoreDelta).toBeGreaterThan(0);
    // Zero-sum
    const total = scored.players.reduce((s, p) => s + (p.scoreDelta ?? 0), 0);
    expect(total).toBe(0);
  });

  it('mittler: player with middle score wins', () => {
    const config = makeConfig({ noPick: 'mittler' });
    const state = makeNoPickScoreState([20, 50, 50], [1, 2, 2], 'mittler');
    const [scored] = handleScore(state, makeStore(), config);

    // Player 1 (20 pts) is middle of 3 sorted values [20, 50, 50]
    // Actually with duplicates at 50, the middle is 50. Let me use distinct values.
    const state2 = makeNoPickScoreState([20, 70, 30], [1, 3, 2], 'mittler');
    const [scored2] = handleScore(state2, makeStore(), config);

    // Sorted: 20, 30, 70 → middle is 30 → player 3 wins
    expect(scored2.players[2].scoreDelta).toBeGreaterThan(0);
    // Zero-sum
    const total = scored2.players.reduce((s, p) => s + (p.scoreDelta ?? 0), 0);
    expect(total).toBe(0);
  });

  it('mittler: wash when no single middle value (even players)', () => {
    const config = makeConfig({
      playerCount: 4,
      handSize: 8,
      blindSize: 0,
      noPick: 'mittler',
      pickerRule: null,
      partnerRule: null,
    });
    const state = makeNoPickScoreState([10, 20, 30, 60], [1, 1, 1, 1], 'mittler');
    const [scored] = handleScore(state, makeStore(4), config);

    // Even number of players — no single middle — all deltas 0 (wash)
    for (const p of scored.players) {
      expect(p.scoreDelta).toBe(0);
    }
  });

  it('schneidster: closest to 30 without going over wins', () => {
    const config = makeConfig({ noPick: 'schneidster' });
    const state = makeNoPickScoreState([25, 35, 60], [2, 2, 2], 'schneidster');
    const [scored] = handleScore(state, makeStore(), config);

    // Player 1 (25 pts) is closest to 30 without going over
    expect(scored.players[0].scoreDelta).toBeGreaterThan(0);
    // Zero-sum
    const total = scored.players.reduce((s, p) => s + (p.scoreDelta ?? 0), 0);
    expect(total).toBe(0);
  });

  it('schneidster: wash when two players tie for closest', () => {
    const config = makeConfig({ noPick: 'schneidster' });
    const state = makeNoPickScoreState([25, 25, 70], [2, 2, 2], 'schneidster');
    const [scored] = handleScore(state, makeStore(), config);

    // Tie — wash
    for (const p of scored.players) {
      expect(p.scoreDelta).toBe(0);
    }
  });

  it('moster: player who takes every trick wins instead of losing', () => {
    const config = makeConfig({ noPick: 'moster' });
    // Player 2 took all tricks (all 120 points, all 7 tricks)
    const state = makeNoPickScoreState([0, 120, 0], [0, 7, 0], 'moster');
    const [scored] = handleScore(state, makeStore(), config);

    // Player 2 took every trick — they win
    expect(scored.players[1].scoreDelta).toBeGreaterThan(0);
    expect(scored.players[0].scoreDelta).toBeLessThan(0);
    expect(scored.players[2].scoreDelta).toBeLessThan(0);
    // Zero-sum
    const total = scored.players.reduce((s, p) => s + (p.scoreDelta ?? 0), 0);
    expect(total).toBe(0);
  });

  it('schwanzer: player with greatest trump power is the only loser', () => {
    const config = makeConfig({ noPick: 'schwanzer' });
    // We need to set up hands for power calculation. Queens=3, Jacks=2, Diamonds=1
    const state: SheepsheadState = {
      ...makeNoPickScoreState([0, 0, 0], [0, 0, 0], 'schwanzer'),
      players: [
        // Player 1: qc(3) + jd(2) + ad(1) = 6 power
        {
          userID: 1,
          role: 'opposition',
          hand: [card('qc'), card('jd'), card('ad')],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        // Player 2: qs(3) + 7d(1) = 4 power
        {
          userID: 2,
          role: 'opposition',
          hand: [card('qs'), card('7d')],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        // Player 3: jc(2) = 2 power
        {
          userID: 3,
          role: 'opposition',
          hand: [card('jc')],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
      ],
    };
    const [scored] = handleScore(state, makeStore(), config);

    // Player 1 (6 power) loses
    expect(scored.players[0].scoreDelta).toBeLessThan(0);
    expect(scored.players[1].scoreDelta).toBeGreaterThan(0);
    expect(scored.players[2].scoreDelta).toBeGreaterThan(0);
    // Zero-sum
    const total = scored.players.reduce((s, p) => s + (p.scoreDelta ?? 0), 0);
    expect(total).toBe(0);
  });

  it('schwanzer: tiebreaker goes to player with highest trump card', () => {
    const config = makeConfig({ noPick: 'schwanzer' });
    const state: SheepsheadState = {
      ...makeNoPickScoreState([0, 0, 0], [0, 0, 0], 'schwanzer'),
      players: [
        // Player 1: qs(3) + 7d(1) = 4 power, highest trump = qs (index 1)
        {
          userID: 1,
          role: 'opposition',
          hand: [card('qs'), card('7d')],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        // Player 2: qh(3) + 8d(1) = 4 power, highest trump = qh (index 2)
        {
          userID: 2,
          role: 'opposition',
          hand: [card('qh'), card('8d')],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        // Player 3: jc(2) = 2 power
        {
          userID: 3,
          role: 'opposition',
          hand: [card('jc')],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
      ],
    };
    const [scored] = handleScore(state, makeStore(), config);

    // Player 1 has qs (index 1 in TRUMP_ORDER) — higher than qh (index 2)
    // Player 1 loses the tiebreaker
    expect(scored.players[0].scoreDelta).toBeLessThan(0);
    expect(scored.players[1].scoreDelta).toBeGreaterThan(0);
    expect(scored.players[2].scoreDelta).toBeGreaterThan(0);
  });

  it('partnerOffTheHook: partner not penalized when picking team takes no tricks', () => {
    const config = makeConfig({ partnerOffTheHook: true, partnerRule: 'jd' });
    const state: SheepsheadState = {
      players: [
        {
          userID: 1,
          role: 'picker',
          hand: [],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 2,
          role: 'partner',
          hand: [],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 3,
          role: 'opposition',
          hand: [],
          tricksWon: 3,
          pointsWon: 60,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 4,
          role: 'opposition',
          hand: [],
          tricksWon: 4,
          pointsWon: 60,
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
        // All tricks won by opposition
        {
          plays: [
            { player: 3, card: card('ac') },
            { player: 1, card: card('7c') },
          ],
          winner: 3,
        },
        {
          plays: [
            { player: 4, card: card('as') },
            { player: 2, card: card('7s') },
          ],
          winner: 4,
        },
        {
          plays: [
            { player: 3, card: card('ah') },
            { player: 1, card: card('7h') },
          ],
          winner: 3,
        },
        {
          plays: [
            { player: 4, card: card('kc') },
            { player: 2, card: card('8c') },
          ],
          winner: 4,
        },
        {
          plays: [
            { player: 3, card: card('ks') },
            { player: 1, card: card('8s') },
          ],
          winner: 3,
        },
        {
          plays: [
            { player: 4, card: card('kh') },
            { player: 2, card: card('8h') },
          ],
          winner: 4,
        },
        {
          plays: [
            { player: 4, card: card('9c') },
            { player: 2, card: card('9s') },
          ],
          winner: 4,
        },
      ],
      crack: null,
      blitz: null,
      previousGameDouble: null,
      noPick: null,
    };
    const [scored] = handleScore(state, makeStore(4), config);

    // Partner should have 0 delta (off the hook)
    expect(scored.players[1].scoreDelta).toBe(0);
    // Picker pays the full penalty alone
    expect(scored.players[0].scoreDelta).toBeLessThan(0);
    // Opposition still wins
    expect(scored.players[2].scoreDelta).toBeGreaterThan(0);
    expect(scored.players[3].scoreDelta).toBeGreaterThan(0);
    // Zero-sum
    const total = scored.players.reduce((s, p) => s + (p.scoreDelta ?? 0), 0);
    expect(total).toBe(0);
  });
});
