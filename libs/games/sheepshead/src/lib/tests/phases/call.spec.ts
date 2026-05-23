import { handleBury, handleCall, handleDeal, handlePick, legalCallOptions } from '../../phases';
import { SheepsheadState } from '../../types';
import { card, makeConfig, makeState, pickContinue } from '../test-helpers';

describe('handleCall', () => {
  it('sets calledCard and assigns roles', () => {
    const config = makeConfig({ partnerRule: 'called-ace', callOwnAce: false });
    const { state: dealt } = handleDeal(makeState(), config);
    const picked = pickContinue(handlePick(dealt, { type: 'pick', userID: 2 }, config));

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

    // Find a fail ace the picker does NOT hold (post-bury) so the call is valid
    const pickerHand = buried.players[1].hand;
    const buriedCards = buried.buried ?? [];
    const failAces: ('ac' | 'as' | 'ah')[] = ['ac', 'as', 'ah'];
    const callableAce = failAces.find(
      (a) => !pickerHand.some((c) => c.name === a) && !buriedCards.some((c) => c.name === a),
    );
    // If picker holds or buried all 3 fail aces, they can call a 10
    const hasAllFailAces = failAces.every((a) => pickerHand.some((c) => c.name === a));
    const calledCard = callableAce ?? (hasAllFailAces ? 'xc' : 'alone');

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
    const { state: dealt } = handleDeal(makeState(), config);
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

  it('allows calling a 10 when picker buried a fail ace but held all 3', () => {
    const config = makeConfig({ partnerRule: 'called-ace', callOwnAce: false });
    const state: SheepsheadState = {
      players: [
        {
          userID: 1,
          role: 'opposition',
          hand: [card('xc'), card('ks'), card('7s'), card('8s'), card('9s')],
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
            card('as'),
            card('qc'),
            card('jc'),
            card('qd'),
            card('jd'),
            card('7d'),
            card('8d'),
          ],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 3,
          role: 'opposition',
          hand: [card('xs'), card('kh'), card('7h'), card('8h'), card('9h')],
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
      buried: [card('ah'), card('9d')],
      calledCard: null,
      hole: null,
      tricks: [],
      crack: null,
      blitz: null,
      previousGameDouble: null,
      noPick: null,
      redeals: null,
    };

    // legalCallOptions should include 10s only for suits whose ace is in hand
    // Picker has ac and as in hand, but buried ah — so xc and xs are callable, xh is not
    const pickerHand = state.players[1].hand;
    const options = legalCallOptions(pickerHand, state.buried!, config);
    expect(options).toContain('xc');
    expect(options).toContain('xs');
    expect(options).not.toContain('xh');

    // Should be able to call a 10 successfully
    const result = handleCall(
      state,
      { type: 'call_ace', userID: 2, payload: { card: 'xc' } },
      config,
    );
    expect(result.calledCard).toBe('xc');
    expect(result.phase).toBe('play');
  });
});
