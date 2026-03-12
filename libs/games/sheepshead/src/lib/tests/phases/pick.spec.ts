import { handleDeal, handlePick } from '../../phases';
import { makeConfig, makeState, pickContinue } from '../test-helpers';

describe('handlePick', () => {
  it('pick: sets player as picker and adds blind to hand', () => {
    const config = makeConfig();
    const dealt = handleDeal(makeState(), config);
    const blindSize = dealt.blind?.length ?? 0;
    const handSize = dealt.players[1].hand.length;

    const state = pickContinue(handlePick(dealt, { type: 'pick', userID: 2 }, config));

    expect(state.players[1].role).toBe('picker');
    expect(state.players[1].hand).toHaveLength(handSize + blindSize);
    expect(state.phase).toBe('bury');
  });

  it('pass: advances activePlayer to next', () => {
    const config = makeConfig();
    const dealt = handleDeal(makeState(), config);

    const state = pickContinue(handlePick(dealt, { type: 'pass', userID: 2 }, config));

    expect(state.activePlayer).toBe(3); // next player
  });

  it('all pass with leaster noPick: transitions to play as leaster', () => {
    const config = makeConfig({ noPick: 'leaster' });
    const dealt = handleDeal(makeState(), config);

    // All 3 players pass: active starts at 2, pass→3, pass→1, pass→back to 2 (full circle)
    let s = pickContinue(handlePick(dealt, { type: 'pass', userID: 2 }, config));
    s = pickContinue(handlePick(s, { type: 'pass', userID: 3 }, config));
    // Player 1 is last — passing completes the circle
    const state = pickContinue(handlePick(s, { type: 'pass', userID: 1 }, config));

    expect(state.phase).toBe('play');
    expect(state.noPick).toBe('leaster');
  });

  it('all pass with null noPick: signals redeal', () => {
    const config = makeConfig({ noPick: null });
    const dealt = handleDeal(makeState(), config);

    let s = pickContinue(handlePick(dealt, { type: 'pass', userID: 2 }, config));
    s = pickContinue(handlePick(s, { type: 'pass', userID: 3 }, config));
    const result = handlePick(s, { type: 'pass', userID: 1 }, config);

    expect(result.outcome).toBe('redeal');
  });

  it('all pass with forced-pick: last player is forced to pick', () => {
    const config = makeConfig({ noPick: 'forced-pick' });
    const dealt = handleDeal(makeState(), config);

    let s = pickContinue(handlePick(dealt, { type: 'pass', userID: 2 }, config));
    s = pickContinue(handlePick(s, { type: 'pass', userID: 3 }, config));
    // Player 1 is last — should be forced to pick
    const state = pickContinue(handlePick(s, { type: 'pass', userID: 1 }, config));

    expect(state.phase).toBe('bury');
    expect(state.players[0].role).toBe('picker');
    // Player 1 should have hand + blind
    expect(state.players[0].hand).toHaveLength(10 + 2);
    expect(state.activePlayer).toBe(1);
  });

  it.each(['moster', 'mittler', 'schneidster'] as const)(
    'all pass with %s noPick: transitions to play with all opposition',
    (noPick) => {
      const config = makeConfig({ noPick });
      const dealt = handleDeal(makeState(), config);

      let s = pickContinue(handlePick(dealt, { type: 'pass', userID: 2 }, config));
      s = pickContinue(handlePick(s, { type: 'pass', userID: 3 }, config));
      const state = pickContinue(handlePick(s, { type: 'pass', userID: 1 }, config));

      expect(state.phase).toBe('play');
      expect(state.noPick).toBe(noPick);
      expect(state.players.every((p) => p.role === 'opposition')).toBe(true);
    },
  );

  it('all pass with schwanzer: transitions to score (showdown)', () => {
    const config = makeConfig({ noPick: 'schwanzer' });
    const dealt = handleDeal(makeState(), config);

    let s = pickContinue(handlePick(dealt, { type: 'pass', userID: 2 }, config));
    s = pickContinue(handlePick(s, { type: 'pass', userID: 3 }, config));
    const state = pickContinue(handlePick(s, { type: 'pass', userID: 1 }, config));

    expect(state.phase).toBe('score');
    expect(state.noPick).toBe('schwanzer');
    expect(state.players.every((p) => p.role === 'opposition')).toBe(true);
  });

  it('all pass with doubler: signals doubler-redeal with redeals recorded', () => {
    const config = makeConfig({ noPick: 'doubler' });
    const dealt = handleDeal(makeState(), config);

    let s = pickContinue(handlePick(dealt, { type: 'pass', userID: 2 }, config));
    s = pickContinue(handlePick(s, { type: 'pass', userID: 3 }, config));
    const result = handlePick(s, { type: 'pass', userID: 1 }, config);

    expect(result.outcome).toBe('doubler-redeal');
    if (result.outcome === 'doubler-redeal') {
      expect(result.redeals).toHaveLength(1);
      expect(result.redeals[0].hands).toHaveLength(3);
      expect(result.redeals[0].blind).toHaveLength(2);
    }
  });
});
