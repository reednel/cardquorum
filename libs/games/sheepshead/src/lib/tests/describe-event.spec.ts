import { SheepsheadPlugin } from '../sheepshead-plugin';
import { type SheepsheadState } from '../types';
import { card, makeState } from './test-helpers';

const describeEvent = SheepsheadPlugin.describeEvent!;

/** Build a minimal play-phase state for describeEvent tests. */
function makePlayState(): SheepsheadState {
  const state = makeState(3);
  state.phase = 'play';
  state.trickNumber = 1;
  state.activePlayer = 1;
  state.tricks = [{ plays: [], winner: null }];
  state.players[0].role = 'picker';
  state.players[1].role = 'opposition';
  state.players[2].role = 'opposition';
  return state;
}

const playerNames = new Map<number, string>([
  [1, 'Alice'],
  [2, 'Bob'],
  [3, 'Carol'],
]);

describe('describeEvent', () => {
  describe('deal event', () => {
    it('returns dealer name with "dealt"', () => {
      const state = makeState(3);
      const result = describeEvent({ type: 'deal', userID: 1 }, state, playerNames);
      expect(result).toBe('Alice dealt');
    });
  });

  describe('pick event', () => {
    it('returns player name with "picked"', () => {
      const state = makeState(3);
      state.phase = 'pick';
      const result = describeEvent({ type: 'pick', userID: 2 }, state, playerNames);
      expect(result).toBe('Bob picked');
    });

    it('returns "Unknown picked" for missing player name', () => {
      const state = makeState(3);
      const result = describeEvent({ type: 'pick', userID: 999 }, state, new Map());
      expect(result).toBe('Unknown picked');
    });
  });

  describe('pass event', () => {
    it('returns player name with "passed"', () => {
      const state = makeState(3);
      state.phase = 'pick';
      const result = describeEvent({ type: 'pass', userID: 3 }, state, playerNames);
      expect(result).toBe('Carol passed');
    });
  });

  describe('bury event', () => {
    it('returns player name with "buried"', () => {
      const state = makePlayState();
      const result = describeEvent(
        { type: 'bury', userID: 1, payload: { cards: [card('qc'), card('7d')] } },
        state,
        playerNames,
      );
      expect(result).toBe('Alice buried');
    });

    it('does not include card names in the output', () => {
      const state = makePlayState();
      const result = describeEvent(
        { type: 'bury', userID: 1, payload: { cards: [card('ac'), card('as')] } },
        state,
        playerNames,
      );
      expect(result).not.toContain('ac');
      expect(result).not.toContain('as');
    });
  });

  describe('call_ace event', () => {
    it('returns called ace of clubs', () => {
      const state = makePlayState();
      const result = describeEvent(
        { type: 'call_ace', userID: 1, payload: { card: 'ac' } },
        state,
        playerNames,
      );
      expect(result).toBe('Alice called the A♣');
    });

    it('returns called ace of spades', () => {
      const state = makePlayState();
      const result = describeEvent(
        { type: 'call_ace', userID: 2, payload: { card: 'as' } },
        state,
        playerNames,
      );
      expect(result).toBe('Bob called the A♠');
    });

    it('returns called ace of hearts', () => {
      const state = makePlayState();
      const result = describeEvent(
        { type: 'call_ace', userID: 1, payload: { card: 'ah' } },
        state,
        playerNames,
      );
      expect(result).toBe('Alice called the A♥');
    });

    it('returns "went alone" for alone call', () => {
      const state = makePlayState();
      const result = describeEvent(
        { type: 'call_ace', userID: 1, payload: { card: 'alone' } },
        state,
        playerNames,
      );
      expect(result).toBe('Alice is going alone');
    });
  });

  describe('crack event', () => {
    it('returns player name with "cracked"', () => {
      const state = makePlayState();
      const result = describeEvent({ type: 'crack', userID: 2 }, state, playerNames);
      expect(result).toBe('Bob cracked');
    });
  });

  describe('re_crack event', () => {
    it('returns player name with "re-cracked"', () => {
      const state = makePlayState();
      state.crack = { crackedBy: 2, reCrackedBy: null };
      const result = describeEvent({ type: 're_crack', userID: 1 }, state, playerNames);
      expect(result).toBe('Alice re-cracked');
    });
  });

  describe('blitz event', () => {
    it('returns black blitz declaration', () => {
      const state = makePlayState();
      const result = describeEvent(
        { type: 'blitz', userID: 3, payload: { blitzType: 'black-blitz' } },
        state,
        playerNames,
      );
      expect(result).toBe('Carol declared black blitz');
    });

    it('returns red blitz declaration', () => {
      const state = makePlayState();
      const result = describeEvent(
        { type: 'blitz', userID: 1, payload: { blitzType: 'red-blitz' } },
        state,
        playerNames,
      );
      expect(result).toBe('Alice declared red blitz');
    });
  });

  describe('play_card event', () => {
    it('returns formatted card with unicode suit symbol for Queen of Clubs', () => {
      const state = makePlayState();
      const result = describeEvent(
        { type: 'play_card', userID: 1, payload: { card: card('qc') } },
        state,
        playerNames,
      );
      expect(result).toBe('Alice played the Q♣');
    });

    it('returns formatted card for Ace of Spades', () => {
      const state = makePlayState();
      const result = describeEvent(
        { type: 'play_card', userID: 2, payload: { card: card('as') } },
        state,
        playerNames,
      );
      expect(result).toBe('Bob played the A♠');
    });

    it('returns formatted card for 10 of Hearts', () => {
      const state = makePlayState();
      const result = describeEvent(
        { type: 'play_card', userID: 3, payload: { card: card('xh') } },
        state,
        playerNames,
      );
      expect(result).toBe('Carol played the 10♥');
    });

    it('returns formatted card for 7 of Diamonds', () => {
      const state = makePlayState();
      const result = describeEvent(
        { type: 'play_card', userID: 1, payload: { card: card('7d') } },
        state,
        playerNames,
      );
      expect(result).toBe('Alice played the 7♦');
    });

    it('returns formatted card for Jack of Hearts', () => {
      const state = makePlayState();
      const result = describeEvent(
        { type: 'play_card', userID: 2, payload: { card: card('jh') } },
        state,
        playerNames,
      );
      expect(result).toBe('Bob played the J♥');
    });

    it('returns formatted card for King of Clubs', () => {
      const state = makePlayState();
      const result = describeEvent(
        { type: 'play_card', userID: 1, payload: { card: card('kc') } },
        state,
        playerNames,
      );
      expect(result).toBe('Alice played the K♣');
    });
  });

  describe('suppressed events', () => {
    it('returns null for game_scored', () => {
      const state = makePlayState();
      const result = describeEvent(
        {
          type: 'game_scored',
          payload: { scoreDeltas: [2, -1, -1], gotSchneidered: false, gotSchwarzed: false },
        },
        state,
        playerNames,
      );
      expect(result).toBeNull();
    });

    it('returns null for trick_advance', () => {
      const state = makePlayState();
      const result = describeEvent({ type: 'trick_advance' }, state, playerNames);
      expect(result).toBeNull();
    });
  });
});
