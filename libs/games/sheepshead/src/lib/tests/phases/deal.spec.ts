import { handleDeal } from '../../phases';
import { card, makeConfig, makeState } from '../test-helpers';

describe('handleDeal', () => {
  it('distributes cards to players and sets blind', () => {
    const config = makeConfig();
    const state = handleDeal(makeState(), config);

    expect(state.phase).toBe('pick');
    expect(state.blind).toHaveLength(config.blindSize);
    for (const p of state.players) {
      expect(p.hand).toHaveLength(config.handSize);
    }
  });

  it('sets activePlayer to player after dealer (index 1)', () => {
    const config = makeConfig();
    const state = handleDeal(makeState(), config);
    expect(state.activePlayer).toBe(2); // userID of index 1
  });

  it('all 32 cards accounted for', () => {
    const config = makeConfig();
    const state = handleDeal(makeState(), config);
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
    const state = handleDeal(makeState(4), config);

    expect(state.phase).toBe('play');
    expect(state.blind).toHaveLength(0);
    expect(state.trickNumber).toBe(1);
    expect(state.tricks).toHaveLength(1);
    // All players should have hands
    for (const p of state.players) {
      expect(p.hand).toHaveLength(8);
    }
  });

  it('deals correctly for 6 players', () => {
    const config = makeConfig({ playerCount: 6, handSize: 5, blindSize: 2, partnerRule: 'jc' });
    const state = handleDeal(makeState(6), config);
    expect(state.players).toHaveLength(6);
    for (const p of state.players) {
      expect(p.hand).toHaveLength(5);
    }
    expect(state.blind).toHaveLength(2);
  });

  it('deals correctly for 7 players', () => {
    const config = makeConfig({ playerCount: 7, handSize: 4, blindSize: 4, partnerRule: 'jd' });
    const state = handleDeal(makeState(7), config);
    expect(state.players).toHaveLength(7);
    for (const p of state.players) {
      expect(p.hand).toHaveLength(4);
    }
    expect(state.blind).toHaveLength(4);
  });

  it('deals correctly for 8 players (no blind)', () => {
    const config = makeConfig({
      playerCount: 8,
      handSize: 4,
      blindSize: 0,
      pickerRule: null,
      partnerRule: 'qc-qs',
      noPick: null,
    });
    const state = handleDeal(makeState(8), config);
    expect(state.players).toHaveLength(8);
    for (const p of state.players) {
      expect(p.hand).toHaveLength(4);
    }
    expect(state.blind).toHaveLength(0);
    expect(state.phase).toBe('play'); // pickerRule=null skips to play
  });

  it('deals correctly with cardsRemoved', () => {
    const config = makeConfig({
      playerCount: 4,
      handSize: 7,
      blindSize: 2,
      partnerRule: 'called-ace',
      cardsRemoved: ['7c', '7s'],
    });
    const state = handleDeal(makeState(4), config);
    const allCards = [...(state.blind ?? []), ...state.players.flatMap((p) => p.hand)];
    expect(allCards).toHaveLength(30);
    const names = allCards.map((c) => c.name);
    expect(names).not.toContain('7c');
    expect(names).not.toContain('7s');
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
    const state = handleDeal(makeState(5), config);

    expect(state.phase).toBe('bury');
    // Player at index 1 (left of dealer) should be picker
    expect(state.players[1].role).toBe('picker');
    // Picker should have hand + blind cards
    expect(state.players[1].hand).toHaveLength(6 + 2);
    expect(state.activePlayer).toBe(state.players[1].userID);
  });
});
