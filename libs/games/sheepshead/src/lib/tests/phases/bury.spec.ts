import { handleDeal, handlePick, handleBury } from '../../phases';
import { DECK } from '../../constants';
import { card, makeConfig, makeState, pickContinue } from '../test-helpers';

describe('handleBury', () => {
  it('removes buried cards from picker hand', () => {
    const config = makeConfig();
    const dealt = handleDeal(makeState(), config);
    const picked = pickContinue(handlePick(dealt, { type: 'pick', userID: 2 }, config));

    const handBefore = picked.players[1].hand;
    const toBury = handBefore.slice(0, 2);

    const state = handleBury(
      picked,
      {
        type: 'bury',
        userID: 2,
        payload: { cards: toBury },
      },
      config,
    );

    expect(state.players[1].hand).toHaveLength(handBefore.length - 2);
    expect(state.buried).toEqual(toBury);
  });

  it('transitions to call phase for called-ace rule', () => {
    const config = makeConfig({ partnerRule: 'called-ace' });
    const dealt = handleDeal(makeState(), config);
    const picked = pickContinue(handlePick(dealt, { type: 'pick', userID: 2 }, config));

    const toBury = picked.players[1].hand.slice(0, 2);
    const state = handleBury(
      picked,
      {
        type: 'bury',
        userID: 2,
        payload: { cards: toBury },
      },
      config,
    );

    expect(state.phase).toBe('call');
  });

  it('throws when burying wrong number of cards', () => {
    const config = makeConfig(); // blindSize = 2
    const dealt = handleDeal(makeState(), config);
    const picked = pickContinue(handlePick(dealt, { type: 'pick', userID: 2 }, config));

    const onlyOne = picked.players[1].hand.slice(0, 1);
    expect(() =>
      handleBury(picked, { type: 'bury', userID: 2, payload: { cards: onlyOne } }, config),
    ).toThrow('Must bury exactly 2 cards');
  });

  it('throws when burying cards not in hand', () => {
    const config = makeConfig();
    const dealt = handleDeal(makeState(), config);
    const picked = pickContinue(handlePick(dealt, { type: 'pick', userID: 2 }, config));

    // Find a card NOT in picker's hand
    const pickerNames = new Set(picked.players[1].hand.map((c) => c.name));
    const notInHand = DECK.filter((c) => !pickerNames.has(c.name)).slice(0, 2);

    expect(() =>
      handleBury(picked, { type: 'bury', userID: 2, payload: { cards: notInHand } }, config),
    ).toThrow("not in picker's hand");
  });

  it('transitions to play phase for non-called-ace rules', () => {
    const config = makeConfig({ partnerRule: 'jd' });
    const dealt = handleDeal(makeState(), config);
    const picked = pickContinue(handlePick(dealt, { type: 'pick', userID: 2 }, config));

    const toBury = picked.players[1].hand.slice(0, 2);
    const state = handleBury(
      picked,
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
