import { DECK } from '../../constants';
import { handleBury, handleDeal, handlePick } from '../../phases';
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
    ).toThrow('not in hand');
  });

  describe('partner-draft (left-of-picker)', () => {
    const draftConfig = makeConfig({
      name: 'partner-draft',
      playerCount: 7,
      handSize: 4,
      blindSize: 4,
      partnerRule: 'left-of-picker',
      noPick: 'leaster',
    });

    function setupDraft() {
      const state = makeState(7);
      const dealt = handleDeal(state, draftConfig);
      // Player 2 (left of dealer) picks
      return pickContinue(handlePick(dealt, { type: 'pick', userID: 2 }, draftConfig));
    }

    it('pick splits blind: picker gets first 2, partner gets second 2', () => {
      const picked = setupDraft();

      // Picker (player 2) should have handSize + blindSize/2 = 4 + 2 = 6 cards
      expect(picked.players[1].hand).toHaveLength(6);
      expect(picked.players[1].role).toBe('picker');

      // Partner (player 3, left of picker) should also have 6 cards
      expect(picked.players[2].hand).toHaveLength(6);
      expect(picked.players[2].role).toBe('partner');

      // Others should have 4 cards and be opposition
      for (const idx of [0, 3, 4, 5, 6]) {
        expect(picked.players[idx].hand).toHaveLength(4);
        expect(picked.players[idx].role).toBe('opposition');
      }
    });

    it('picker buries first, then partner buries', () => {
      const picked = setupDraft();

      // Picker buries 2 cards
      const pickerBury = picked.players[1].hand.slice(0, 2);
      const afterPickerBury = handleBury(
        picked,
        { type: 'bury', userID: 2, payload: { cards: pickerBury } },
        draftConfig,
      );

      // Should still be in bury phase, partner's turn
      expect(afterPickerBury.phase).toBe('bury');
      expect(afterPickerBury.activePlayer).toBe(3);
      expect(afterPickerBury.players[1].hand).toHaveLength(4); // picker back to handSize

      // Partner buries 2 cards
      const partnerBury = afterPickerBury.players[2].hand.slice(0, 2);
      const afterPartnerBury = handleBury(
        afterPickerBury,
        { type: 'bury', userID: 3, payload: { cards: partnerBury } },
        draftConfig,
      );

      // Should transition to play
      expect(afterPartnerBury.phase).toBe('play');
      expect(afterPartnerBury.players[2].hand).toHaveLength(4); // partner back to handSize
      expect(afterPartnerBury.trickNumber).toBe(1);
    });

    it('buried cards accumulate from both players', () => {
      const picked = setupDraft();

      const pickerBury = picked.players[1].hand.slice(0, 2);
      const afterPickerBury = handleBury(
        picked,
        { type: 'bury', userID: 2, payload: { cards: pickerBury } },
        draftConfig,
      );

      expect(afterPickerBury.buried).toHaveLength(2);

      const partnerBury = afterPickerBury.players[2].hand.slice(0, 2);
      const afterPartnerBury = handleBury(
        afterPickerBury,
        { type: 'bury', userID: 3, payload: { cards: partnerBury } },
        draftConfig,
      );

      // All 4 buried cards accumulated
      expect(afterPartnerBury.buried).toHaveLength(4);
    });

    it('each player must bury exactly blindSize/2 cards', () => {
      const picked = setupDraft();

      // Trying to bury 4 cards (full blindSize) should fail
      const tooMany = picked.players[1].hand.slice(0, 4);
      expect(() =>
        handleBury(picked, { type: 'bury', userID: 2, payload: { cards: tooMany } }, draftConfig),
      ).toThrow('Must bury exactly 2 cards');
    });
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
