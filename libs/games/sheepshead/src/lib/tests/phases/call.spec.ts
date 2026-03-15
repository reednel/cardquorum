import { handleBury, handleCall, handleDeal, handlePick } from '../../phases';
import { SheepsheadState } from '../../types';
import { card, makeConfig, makeState, pickContinue } from '../test-helpers';

describe('handleCall', () => {
  it('sets calledCard and assigns roles', () => {
    const config = makeConfig({ partnerRule: 'called-ace', callOwnAce: false });
    const dealt = handleDeal(makeState(), config);
    const picked = pickContinue(handlePick(dealt, { type: 'pick', userID: 2 }, config));

    // Find a fail ace the picker does NOT hold so the call is valid
    const pickerHand = picked.players[1].hand;
    const failAces: ('ac' | 'as' | 'ah')[] = ['ac', 'as', 'ah'];
    const callableAce = failAces.find((a) => !pickerHand.some((c) => c.name === a));
    // If picker holds all 3 fail aces, call a 10 instead
    const calledCard = callableAce ?? 'xc';

    const toBury = picked.players[1].hand.slice(0, 2);
    const buried = handleBury(
      picked,
      {
        type: 'bury',
        userID: 2,
        payload: { cards: toBury },
      },
      config,
    );

    const state = handleCall(
      buried,
      {
        type: 'call_ace',
        userID: 2,
        payload: { card: calledCard },
      },
      config,
    );

    expect(state.calledCard).toBe(calledCard);
    expect(state.phase).toBe('play');
    // Picker should still be picker
    expect(state.players[1].role).toBe('picker');
    // Other players should have roles assigned
    expect(state.players.every((p) => p.role !== null)).toBe(true);
  });

  it('callOwnAce false: throws when picker calls an ace they hold', () => {
    const config = makeConfig({ partnerRule: 'called-ace', callOwnAce: false });
    // Build a state at call phase with a known hand containing 'ac'
    const state: SheepsheadState = {
      players: [
        {
          userID: 1,
          role: 'opposition',
          hand: [card('as'), card('ks'), card('7s'), card('8s'), card('9s')],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 2,
          role: 'picker',
          hand: [
            card('ac'),
            card('qc'),
            card('jc'),
            card('qd'),
            card('jd'),
            card('7d'),
            card('8d'),
            card('9d'),
            card('kd'),
            card('ad'),
          ],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 3,
          role: 'opposition',
          hand: [card('ah'), card('kh'), card('7h'), card('8h'), card('9h')],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
      ],
      phase: 'call',
      trickNumber: 0,
      activePlayer: 2,
      blind: [],
      buried: [card('kc'), card('xc')],
      calledCard: null,
      hole: null,
      tricks: [],
      crack: null,
      blitz: null,
      previousGameDouble: null,
      noPick: null,
      redeals: null,
    };

    expect(() =>
      handleCall(state, { type: 'call_ace', userID: 2, payload: { card: 'ac' } }, config),
    ).toThrow('Cannot call ac');
  });

  it('callOwnAce true: allows picker to call an ace they hold', () => {
    const config = makeConfig({ partnerRule: 'called-ace', callOwnAce: true });
    const state: SheepsheadState = {
      players: [
        {
          userID: 1,
          role: 'opposition',
          hand: [card('as'), card('ks'), card('7s'), card('8s'), card('9s')],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 2,
          role: 'picker',
          hand: [
            card('ac'),
            card('qc'),
            card('jc'),
            card('qd'),
            card('jd'),
            card('7d'),
            card('8d'),
            card('9d'),
            card('kd'),
            card('ad'),
          ],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 3,
          role: 'opposition',
          hand: [card('ah'), card('kh'), card('7h'), card('8h'), card('9h')],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
      ],
      phase: 'call',
      trickNumber: 0,
      activePlayer: 2,
      blind: [],
      buried: [card('kc'), card('xc')],
      calledCard: null,
      hole: null,
      tricks: [],
      crack: null,
      blitz: null,
      previousGameDouble: null,
      noPick: null,
      redeals: null,
    };

    const result = handleCall(
      state,
      { type: 'call_ace', userID: 2, payload: { card: 'ac' } },
      config,
    );
    expect(result.calledCard).toBe('ac');
    expect(result.phase).toBe('play');
  });

  it('callOwnAce false: throws when picker calls an ace they buried', () => {
    const config = makeConfig({ partnerRule: 'called-ace', callOwnAce: false });
    const state: SheepsheadState = {
      players: [
        {
          userID: 1,
          role: 'opposition',
          hand: [card('as'), card('ks'), card('7s'), card('8s'), card('9s')],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 2,
          role: 'picker',
          hand: [
            card('qc'),
            card('jc'),
            card('qd'),
            card('jd'),
            card('7d'),
            card('8d'),
            card('9d'),
            card('kd'),
            card('ad'),
          ],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 3,
          role: 'opposition',
          hand: [card('ah'), card('kh'), card('7h'), card('8h'), card('9h')],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
      ],
      phase: 'call',
      trickNumber: 0,
      activePlayer: 2,
      blind: [],
      buried: [card('ac'), card('xc')],
      calledCard: null,
      hole: null,
      tricks: [],
      crack: null,
      blitz: null,
      previousGameDouble: null,
      noPick: null,
      redeals: null,
    };

    expect(() =>
      handleCall(state, { type: 'call_ace', userID: 2, payload: { card: 'ac' } }, config),
    ).toThrow('Cannot call ac');
  });

  it('allows going alone', () => {
    const config = makeConfig({ partnerRule: 'called-ace', callOwnAce: false });
    const dealt = handleDeal(makeState(), config);
    const picked = pickContinue(handlePick(dealt, { type: 'pick', userID: 2 }, config));
    const toBury = picked.players[1].hand.slice(0, 2);
    const buried = handleBury(
      picked,
      { type: 'bury', userID: 2, payload: { cards: toBury } },
      config,
    );

    const state = handleCall(
      buried,
      {
        type: 'call_ace',
        userID: 2,
        payload: { card: 'alone' },
      },
      config,
    );

    expect(state.calledCard).toBe('alone');
    expect(state.players.filter((p) => p.role === 'partner')).toHaveLength(0);
    expect(state.phase).toBe('play');
  });
});
