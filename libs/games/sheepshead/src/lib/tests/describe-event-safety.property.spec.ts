import * as fc from 'fast-check';
import { DECK } from '../constants';
import { SheepsheadPlugin } from '../sheepshead-plugin';
import {
  Card,
  type CardName,
  type SheepsheadConfig,
  type SheepsheadEvent,
  type SheepsheadState,
} from '../types';

const describeEvent = SheepsheadPlugin.describeEvent!;

/** Build a config with sensible defaults. */
function makeConfig(overrides: Partial<SheepsheadConfig> = {}): SheepsheadConfig {
  return {
    name: 'jack-of-diamonds',
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
    callOwnAce: null,
    cardsRemoved: [],
    ...overrides,
  };
}

/** All card names in the deck. */
const ALL_CARD_NAMES: CardName[] = DECK.map((c) => c.name);

/**
 * Check if a card name appears as a standalone token in the output string.
 * We use word-boundary regex to avoid false positives like "passed" containing "as".
 */
function containsCardNameAsToken(output: string, cardName: CardName): boolean {
  // Use word boundary regex to match the card name as a standalone token
  const regex = new RegExp(`\\b${cardName}\\b`);
  return regex.test(output);
}

/**
 * Arbitrary that generates a game state with random hands dealt to 3 players,
 * plus a random event, and returns the hidden card names that should NOT appear in output.
 */
function arbStateAndEvent(): fc.Arbitrary<{
  state: SheepsheadState;
  event: SheepsheadEvent;
  hiddenCardNames: CardName[];
  playerNames: Map<number, string>;
}> {
  return fc
    .record({
      shuffledDeck: fc.shuffledSubarray([...DECK], { minLength: 32, maxLength: 32 }),
      eventType: fc.constantFrom(
        'deal',
        'pick',
        'pass',
        'bury',
        'call_ace',
        'crack',
        're_crack',
        'blitz',
        'play_card',
        'game_scored',
        'trick_advance',
      ),
      actingPlayerIdx: fc.constantFrom(0, 1, 2),
    })
    .map(({ shuffledDeck, eventType, actingPlayerIdx }) => {
      const userIDs = [1, 2, 3];
      const hand1 = shuffledDeck.slice(0, 10);
      const hand2 = shuffledDeck.slice(10, 20);
      const hand3 = shuffledDeck.slice(20, 30);
      const blind = shuffledDeck.slice(30, 32);
      const hands = [hand1, hand2, hand3];

      const state: SheepsheadState = {
        players: userIDs.map((id, i) => ({
          userID: id,
          role: i === actingPlayerIdx ? 'picker' : 'opposition',
          hand: hands[i],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        })),
        phase: 'play',
        trickNumber: 1,
        activePlayer: userIDs[actingPlayerIdx],
        blind,
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

      const actingUserID = userIDs[actingPlayerIdx];
      const actingHand = hands[actingPlayerIdx];
      const playedCard = actingHand[0]; // first card in hand

      let event: SheepsheadEvent;
      switch (eventType) {
        case 'deal':
          event = { type: 'deal', userID: actingUserID };
          break;
        case 'pick':
          event = { type: 'pick', userID: actingUserID };
          break;
        case 'pass':
          event = { type: 'pass', userID: actingUserID };
          break;
        case 'bury':
          event = {
            type: 'bury',
            userID: actingUserID,
            payload: { cards: [actingHand[0], actingHand[1]] },
          };
          break;
        case 'call_ace':
          event = {
            type: 'call_ace',
            userID: actingUserID,
            payload: { card: 'ac' },
          };
          break;
        case 'crack':
          event = { type: 'crack', userID: actingUserID };
          break;
        case 're_crack':
          event = { type: 're_crack', userID: actingUserID };
          break;
        case 'blitz':
          event = {
            type: 'blitz',
            userID: actingUserID,
            payload: { blitzType: 'black-blitz' },
          };
          break;
        case 'play_card':
          event = {
            type: 'play_card',
            userID: actingUserID,
            payload: { card: playedCard },
          };
          break;
        case 'game_scored':
          event = {
            type: 'game_scored',
            payload: { scoreDeltas: [1, -1, 0], gotSchneidered: false, gotSchwarzed: false },
          };
          break;
        case 'trick_advance':
          event = { type: 'trick_advance' };
          break;
        default:
          event = { type: 'deal', userID: actingUserID };
      }

      // Hidden card names: all cards in all players' hands
      // For play_card events, the played card is publicly visible so exclude it
      let hiddenCardNames: CardName[];
      if (eventType === 'play_card') {
        hiddenCardNames = ALL_CARD_NAMES.filter((name) => {
          // The played card is visible
          if (name === playedCard.name) return false;
          // All other cards in any hand are hidden
          return hands.some((h) => h.some((c) => c.name === name));
        });
      } else {
        // All cards in hands are hidden
        hiddenCardNames = hands.flatMap((h) => h.map((c) => c.name));
      }

      // Also add blind cards as hidden
      hiddenCardNames.push(...blind.map((c) => c.name));

      // For bury events, the buried cards should also be hidden
      if (eventType === 'bury') {
        // buried cards are already in the hand, so already included
      }

      const playerNames = new Map<number, string>([
        [1, 'Alice'],
        [2, 'Bob'],
        [3, 'Carol'],
      ]);

      return { state, event, hiddenCardNames, playerNames };
    });
}

describe('describeEvent never reveals hidden card information', () => {
  it('output does not contain raw card name codes from hidden hands', () => {
    fc.assert(
      fc.property(arbStateAndEvent(), ({ state, event, hiddenCardNames, playerNames }) => {
        const config = makeConfig();
        const result = describeEvent(event, state, playerNames);

        // If result is null, nothing is revealed
        if (result === null) return;

        // The output string should not contain any hidden card name codes
        for (const cardName of hiddenCardNames) {
          expect(containsCardNameAsToken(result, cardName)).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('deal events say dealer name without revealing any card names', () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray([...DECK], { minLength: 32, maxLength: 32 }),
        (shuffledDeck) => {
          const hands = [
            shuffledDeck.slice(0, 10),
            shuffledDeck.slice(10, 20),
            shuffledDeck.slice(20, 30),
          ];

          const state: SheepsheadState = {
            players: [1, 2, 3].map((id, i) => ({
              userID: id,
              role: null,
              hand: hands[i],
              tricksWon: 0,
              pointsWon: 0,
              cardsWon: [],
              scoreDelta: null,
            })),
            phase: 'deal',
            trickNumber: 0,
            activePlayer: 1,
            blind: shuffledDeck.slice(30, 32),
            buried: [],
            calledCard: null,
            hole: null,
            tricks: [],
            crack: null,
            blitz: null,
            previousGameDouble: null,
            noPick: null,
            redeals: null,
          };

          const playerNames = new Map([
            [1, 'Alice'],
            [2, 'Bob'],
            [3, 'Carol'],
          ]);
          const result = describeEvent({ type: 'deal', userID: 1 }, state, playerNames);

          expect(result).toBe('Alice dealt');

          // Verify no card names appear as standalone tokens
          for (const c of DECK) {
            expect(containsCardNameAsToken(result!, c.name)).toBe(false);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it('bury events do not reveal which cards were buried', () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray([...DECK], { minLength: 32, maxLength: 32 }),
        (shuffledDeck) => {
          const hand = shuffledDeck.slice(0, 10);
          const buriedCards = [hand[0], hand[1]];

          const state: SheepsheadState = {
            players: [1, 2, 3].map((id, i) => ({
              userID: id,
              role: i === 0 ? 'picker' : 'opposition',
              hand: i === 0 ? hand : shuffledDeck.slice(10 + i * 10, 20 + i * 10),
              tricksWon: 0,
              pointsWon: 0,
              cardsWon: [],
              scoreDelta: null,
            })),
            phase: 'bury',
            trickNumber: 0,
            activePlayer: 1,
            blind: shuffledDeck.slice(30, 32),
            buried: buriedCards,
            calledCard: null,
            hole: null,
            tricks: [],
            crack: null,
            blitz: null,
            previousGameDouble: null,
            noPick: null,
            redeals: null,
          };

          const playerNames = new Map([
            [1, 'Alice'],
            [2, 'Bob'],
            [3, 'Carol'],
          ]);
          const event = {
            type: 'bury' as const,
            userID: 1,
            payload: { cards: buriedCards },
          };

          const result = describeEvent(event, state, playerNames);

          // Should not contain any card name codes as standalone tokens
          for (const c of DECK) {
            expect(containsCardNameAsToken(result!, c.name)).toBe(false);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it('play_card events only show the formatted card, not raw card names from hands', () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray([...DECK], { minLength: 32, maxLength: 32 }),
        fc.constantFrom(0, 1, 2),
        (shuffledDeck, playerIdx) => {
          const hands = [
            shuffledDeck.slice(0, 10),
            shuffledDeck.slice(10, 20),
            shuffledDeck.slice(20, 30),
          ];
          const playedCard = hands[playerIdx][0];
          const userIDs = [1, 2, 3];

          const state: SheepsheadState = {
            players: userIDs.map((id, i) => ({
              userID: id,
              role: i === playerIdx ? 'picker' : 'opposition',
              hand: hands[i],
              tricksWon: 0,
              pointsWon: 0,
              cardsWon: [],
              scoreDelta: null,
            })),
            phase: 'play',
            trickNumber: 1,
            activePlayer: userIDs[playerIdx],
            blind: shuffledDeck.slice(30, 32),
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

          const playerNames = new Map<number, string>([
            [1, 'Alice'],
            [2, 'Bob'],
            [3, 'Carol'],
          ]);

          const event = {
            type: 'play_card' as const,
            userID: userIDs[playerIdx],
            payload: { card: playedCard },
          };

          const result = describeEvent(event, state, playerNames);
          expect(result).not.toBeNull();

          // The output should NOT contain any raw card name codes from other players' hands
          const otherHands = hands.filter((_, i) => i !== playerIdx);
          for (const hand of otherHands) {
            for (const c of hand) {
              expect(containsCardNameAsToken(result!, c.name)).toBe(false);
            }
          }

          // The remaining cards in the acting player's hand (excluding played card) should not appear
          const remainingHand = hands[playerIdx].slice(1);
          for (const c of remainingHand) {
            expect(containsCardNameAsToken(result!, c.name)).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
