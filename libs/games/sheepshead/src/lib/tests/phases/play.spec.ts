import { handlePlayCard, handleTrickAdvance } from '../../phases';
import { SheepsheadConfig, SheepsheadState } from '../../types';
import { card, makeConfig } from '../test-helpers';

/** Helper: set up a game at the play phase with known hands. */
function setupPlayPhase() {
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
    calledCard: null,
    hole: null,
    tricks: [{ plays: [], winner: null }],
    crack: null,
    blitz: null,
    previousGameDouble: null,
    noPick: null,
    redeals: null,
  };
  return state;
}

describe('handlePlayCard', () => {
  it('removes card from hand and adds to trick', () => {
    const state = setupPlayPhase();
    const config = makeConfig();

    const newState = handlePlayCard(
      state,
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
    const state = setupPlayPhase();
    const config = makeConfig();

    // Player 1 doesn't have queen of spades
    expect(() =>
      handlePlayCard(
        state,
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
    const state = setupPlayPhase();
    const config = makeConfig();

    // Player 1 leads Ace of Clubs
    let s = handlePlayCard(
      state,
      {
        type: 'play_card',
        userID: 1,
        payload: { card: card('ac') },
      },
      config,
    );

    // Player 2 plays Queen of Clubs (trump — wins)
    s = handlePlayCard(
      s,
      {
        type: 'play_card',
        userID: 2,
        payload: { card: card('qc') },
      },
      config,
    );

    // Player 3 plays Ace of Spades (off-suit, doesn't compete)
    s = handlePlayCard(
      s,
      {
        type: 'play_card',
        userID: 3,
        payload: { card: card('as') },
      },
      config,
    );

    // Trick complete — player 2 (queen of clubs) wins
    expect(s.tricks[0].winner).toBe(2);
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
      calledCard: null,
      hole: null,
      tricks: [{ plays: [], winner: null }],
      crack: null,
      blitz: null,
      previousGameDouble: null,
      noPick: null,
      redeals: null,
    };

    // Player 1 leads Ac, Player 2 plays Qc (trump wins), Player 3 plays As
    let s = handlePlayCard(
      state,
      { type: 'play_card', userID: 1, payload: { card: card('ac') } },
      config,
    );
    s = handlePlayCard(s, { type: 'play_card', userID: 2, payload: { card: card('qc') } }, config);
    s = handlePlayCard(s, { type: 'play_card', userID: 3, payload: { card: card('as') } }, config);

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
      calledCard: null,
      hole: null,
      tricks: [{ plays: [], winner: null }],
      crack: null,
      blitz: null,
      previousGameDouble: null,
      noPick: null,
      redeals: null,
    };

    // Player 1 leads Ac (clubs), Player 2 plays 7c (must follow clubs), Player 3 plays As (off-suit)
    // Ac wins within clubs suit
    let s = handlePlayCard(
      state,
      { type: 'play_card', userID: 1, payload: { card: card('ac') } },
      config,
    );
    s = handlePlayCard(s, { type: 'play_card', userID: 2, payload: { card: card('7c') } }, config);
    s = handlePlayCard(s, { type: 'play_card', userID: 3, payload: { card: card('as') } }, config);

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
      calledCard: null,
      hole: null,
      tricks: [{ plays: [], winner: null }],
      crack: null,
      blitz: null,
      previousGameDouble: null,
      noPick: 'leaster',
      redeals: null,
    };

    // Qc (trump) wins
    let s = handlePlayCard(
      state,
      { type: 'play_card', userID: 1, payload: { card: card('ac') } },
      config,
    );
    s = handlePlayCard(s, { type: 'play_card', userID: 2, payload: { card: card('qc') } }, config);
    s = handlePlayCard(s, { type: 'play_card', userID: 3, payload: { card: card('as') } }, config);

    // Player 2 won the last (only) trick — pending state before advancing
    expect(s.phase).toBe('play');
    expect(s.scheduledEvents).toBeDefined();
    expect(s.activePlayer).toBeNull();

    // Blind points awarded in the pending state
    // Trick points: ac(11) + qc(3) + as(11) = 25, blind: 20 → total 45
    expect(s.players[1].pointsWon).toBe(25 + 20);
    expect(s.players[1].cardsWon).toHaveLength(3 + 2); // 3 trick cards + 2 blind cards

    // Advancing transitions to score
    const scored = handleTrickAdvance(s);
    expect(scored.phase).toBe('score');
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
      calledCard: null,
      hole: null,
      tricks: [{ plays: [], winner: null }],
      crack: null,
      blitz: null,
      previousGameDouble: null,
      noPick: null,
      redeals: null,
    };

    let s = handlePlayCard(
      state,
      {
        type: 'play_card',
        userID: 1,
        payload: { card: card('ac') },
      },
      config,
    );
    s = handlePlayCard(
      s,
      {
        type: 'play_card',
        userID: 2,
        payload: { card: card('qc') },
      },
      config,
    );
    s = handlePlayCard(
      s,
      {
        type: 'play_card',
        userID: 3,
        payload: { card: card('as') },
      },
      config,
    );

    // Pending state — trick complete but not yet advanced
    expect(s.phase).toBe('play');
    expect(s.scheduledEvents).toBeDefined();
    expect(s.activePlayer).toBeNull();

    // Advancing transitions to score
    const scored = handleTrickAdvance(s);
    expect(scored.phase).toBe('score');
    expect(scored.activePlayer).toBeNull();
  });
});
