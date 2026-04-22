import * as fc from 'fast-check';

/**
 * Pure derivation logic extracted from CardStack.cardsHiddenDuringDrag computed.
 *
 * Given a dragged card name (or null) and the IC's selectedCards array,
 * returns the set of card names that should be hidden at their original positions.
 */
function deriveCardsHiddenDuringDrag(
  draggedCard: string | null,
  selectedCards: string[],
): Set<string> {
  if (!draggedCard) return new Set<string>();
  if (selectedCards.includes(draggedCard)) return new Set(selectedCards);
  return new Set([draggedCard]);
}

/** Arbitrary for a card name — short lowercase alphanumeric strings. */
const arbCardName = fc.stringMatching(/^[a-z][a-z0-9]{0,5}$/);

describe('cardsHiddenDuringDrag derivation', () => {
  it('returns empty set when no card is being dragged', () => {
    fc.assert(
      fc.property(fc.uniqueArray(arbCardName, { minLength: 0, maxLength: 10 }), (selectedCards) => {
        const result = deriveCardsHiddenDuringDrag(null, selectedCards);
        expect(result.size).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('returns full selectedCards set when dragged card is in the selection', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(arbCardName, { minLength: 1, maxLength: 10 }).chain((cards) =>
          fc.tuple(
            fc.constantFrom(...cards), // pick one of the selected cards as the dragged card
            fc.constant(cards),
          ),
        ),
        ([draggedCard, selectedCards]) => {
          const result = deriveCardsHiddenDuringDrag(draggedCard, selectedCards);

          // Should contain exactly the selected cards
          expect(result.size).toBe(new Set(selectedCards).size);
          for (const card of selectedCards) {
            expect(result.has(card)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns singleton set of dragged card when it is not in the selection', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(arbCardName, { minLength: 0, maxLength: 10 }),
        arbCardName,
        (selectedCards, draggedCard) => {
          // Ensure draggedCard is NOT in selectedCards
          fc.pre(!selectedCards.includes(draggedCard));

          const result = deriveCardsHiddenDuringDrag(draggedCard, selectedCards);

          expect(result.size).toBe(1);
          expect(result.has(draggedCard)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('hidden set always contains the dragged card when drag is active', () => {
    fc.assert(
      fc.property(
        arbCardName,
        fc.uniqueArray(arbCardName, { minLength: 0, maxLength: 10 }),
        (draggedCard, selectedCards) => {
          const result = deriveCardsHiddenDuringDrag(draggedCard, selectedCards);
          expect(result.has(draggedCard)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
