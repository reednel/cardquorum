import { SheepsheadTablePlugin } from './sheepshead-table-plugin';

describe('SheepsheadTablePlugin', () => {
  describe('getCardAsset', () => {
    it('returns the correct path for a card name', () => {
      const asset = SheepsheadTablePlugin.getCardAsset('qc');
      expect(asset.src).toBe('cards/qc.svg');
      expect(asset.alt).toBe('Queen of Clubs');
    });

    it('returns the correct alt text for 10s (x prefix)', () => {
      const asset = SheepsheadTablePlugin.getCardAsset('xh');
      expect(asset.src).toBe('cards/xh.svg');
      expect(asset.alt).toBe('10 of Hearts');
    });

    it('returns correct alt text for numbered cards', () => {
      const asset = SheepsheadTablePlugin.getCardAsset('7d');
      expect(asset.src).toBe('cards/7d.svg');
      expect(asset.alt).toBe('7 of Diamonds');
    });
  });

  describe('getLegalCards', () => {
    it('returns all hand card names when play_card is valid', () => {
      const state: any = {
        players: [{ userID: 1, hand: [{ name: 'qc' }, { name: 'js' }] }],
        activePlayer: 1,
      };
      expect(SheepsheadTablePlugin.getLegalCards(state, ['play_card'])).toEqual(['qc', 'js']);
    });

    it('returns empty array when play_card is not in validActions', () => {
      const state: any = {
        players: [{ userID: 1, hand: [{ name: 'qc' }] }],
        activePlayer: 1,
      };
      expect(SheepsheadTablePlugin.getLegalCards(state, ['crack'])).toEqual([]);
    });
  });

  describe('getActiveOverlay', () => {
    it('returns deal when phase is deal', () => {
      const state: any = { phase: 'deal', players: [{ scoreDelta: null }] };
      expect(SheepsheadTablePlugin.getActiveOverlay(state, ['deal'])).toBe('deal');
    });

    it('returns deal for non-dealer waiting in deal phase', () => {
      const state: any = { phase: 'deal', players: [{ scoreDelta: null }] };
      expect(SheepsheadTablePlugin.getActiveOverlay(state, [])).toBe('deal');
    });

    it('returns pick when pick is a valid action', () => {
      const state: any = { phase: 'pick', players: [{ scoreDelta: null }] };
      expect(SheepsheadTablePlugin.getActiveOverlay(state, ['pick', 'pass'])).toBe('pick');
    });

    it('returns bury when bury is a valid action', () => {
      const state: any = { phase: 'bury', players: [{ scoreDelta: null }] };
      expect(SheepsheadTablePlugin.getActiveOverlay(state, ['bury'])).toBe('bury');
    });

    it('returns call when call_ace is a valid action', () => {
      const state: any = { phase: 'call', players: [{ scoreDelta: null }] };
      expect(SheepsheadTablePlugin.getActiveOverlay(state, ['call_ace'])).toBe('call');
    });

    it('returns crack when crack is a valid action', () => {
      const state: any = { phase: 'play', players: [{ scoreDelta: null }] };
      expect(SheepsheadTablePlugin.getActiveOverlay(state, ['crack'])).toBe('crack');
    });

    it('returns score when phase is score and scoreDelta is set', () => {
      const state: any = { phase: 'score', players: [{ scoreDelta: 5 }] };
      expect(SheepsheadTablePlugin.getActiveOverlay(state, [])).toBe('score');
    });

    it('returns null when no overlay applies', () => {
      const state: any = { phase: 'play', players: [{ scoreDelta: null }] };
      expect(SheepsheadTablePlugin.getActiveOverlay(state, ['play_card'])).toBeNull();
    });
  });

  describe('getCurrentTrick', () => {
    it('returns plays from the last trick', () => {
      const state: any = {
        phase: 'play',
        tricks: [
          {
            plays: [
              { player: 1, card: { name: 'qc' } },
              { player: 2, card: { name: 'js' } },
            ],
            winner: null,
          },
        ],
      };
      expect(SheepsheadTablePlugin.getCurrentTrick(state)).toEqual([
        { userID: 1, cardName: 'qc' },
        { userID: 2, cardName: 'js' },
      ]);
    });

    it('returns null when not in play phase', () => {
      const state: any = { phase: 'pick', tricks: [] };
      expect(SheepsheadTablePlugin.getCurrentTrick(state)).toBeNull();
    });

    it('returns null when tricks array is empty', () => {
      const state: any = { phase: 'play', tricks: [] };
      expect(SheepsheadTablePlugin.getCurrentTrick(state)).toBeNull();
    });
  });

  describe('getPlayerSeats', () => {
    it('returns other players excluding self', () => {
      const state: any = {
        players: [
          { userID: 1, hand: [], role: null },
          { userID: 2, hand: [{ name: 'qc' }], role: null },
          { userID: 3, hand: [{ name: 'js' }, { name: 'ad' }], role: null },
        ],
        activePlayer: 2,
      };
      const seats = SheepsheadTablePlugin.getPlayerSeats(state, 1);
      expect(seats).toEqual([
        { userID: 2, handSize: 1, isDealer: false, isActive: true },
        { userID: 3, handSize: 2, isDealer: false, isActive: false },
      ]);
    });

    it('marks dealer correctly (dealerUserID)', () => {
      const state: any = {
        players: [
          { userID: 1, hand: [], role: null },
          { userID: 2, hand: [], role: null },
        ],
        activePlayer: null,
        dealerUserID: 1,
      };
      const seats = SheepsheadTablePlugin.getPlayerSeats(state, 2);
      expect(seats[0].isDealer).toBe(true);
    });
  });

  describe('getMyHand', () => {
    it('returns card names for the local player', () => {
      const state: any = {
        players: [
          { userID: 1, hand: [{ name: 'qc' }, { name: 'ad' }] },
          { userID: 2, hand: [] },
        ],
      };
      expect(SheepsheadTablePlugin.getMyHand(state, 1)).toEqual(['qc', 'ad']);
    });

    it('returns empty array if player not found', () => {
      const state: any = { players: [] };
      expect(SheepsheadTablePlugin.getMyHand(state, 99)).toEqual([]);
    });
  });

  describe('getStatusInfo', () => {
    it('returns phase label and trick info', () => {
      const state: any = {
        phase: 'play',
        trickNumber: 3,
        players: [{ hand: [{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }] }],
      };
      const info = SheepsheadTablePlugin.getStatusInfo(state);
      expect(info.phaseLabel).toBe('Play');
      expect(info.trickNumber).toBe(3);
      expect(info.totalTricks).toBe(4);
    });
  });

  describe('buildPlayCardEvent', () => {
    it('returns a play_card event with the full Card object', () => {
      const state: any = {
        players: [{ userID: 1, hand: [{ name: 'qc', suit: 'clubs', rank: 'queen', points: 3 }] }],
      };
      const event = SheepsheadTablePlugin.buildPlayCardEvent(state, 'qc');
      expect(event).toEqual({
        type: 'play_card',
        payload: { card: { name: 'qc', suit: 'clubs', rank: 'queen', points: 3 } },
      });
    });
  });

  describe('buildBuryEvent', () => {
    it('returns a bury event with full Card objects', () => {
      const state: any = {
        players: [
          {
            userID: 1,
            hand: [
              { name: '7c', suit: 'clubs', rank: '7', points: 0 },
              { name: '8s', suit: 'spades', rank: '8', points: 0 },
              { name: 'ad', suit: 'diamonds', rank: 'ace', points: 11 },
            ],
          },
        ],
      };
      const event = SheepsheadTablePlugin.buildBuryEvent(state, ['7c', '8s']);
      expect(event).toEqual({
        type: 'bury',
        payload: {
          cards: [
            { name: '7c', suit: 'clubs', rank: '7', points: 0 },
            { name: '8s', suit: 'spades', rank: '8', points: 0 },
          ],
        },
      });
    });
  });
});
