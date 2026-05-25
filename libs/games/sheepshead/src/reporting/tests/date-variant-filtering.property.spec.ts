import * as fc from 'fast-check';

/**
 * Pure reference implementation of the date range and variant filtering logic.
 * This mirrors the filtering behavior in SheepsheadReportRepository.buildBaseConditions().
 */

interface MockSession {
  id: number;
  finishedAt: Date | null;
  variant: string | null;
  status: 'finished' | 'waiting' | 'active' | 'abandoned';
}

interface Filters {
  variants?: string[];
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
}

/**
 * Reference filtering function that determines which sessions should be included
 * in a report given a set of filters. This implements the same logic as
 * buildBaseConditions in the repository:
 * - Only finished sessions with non-null finishedAt are included
 * - If variants is provided and non-empty, only sessions matching one of the variants are included
 * - If startDate is provided, only sessions with finishedAt >= startDate (start of day UTC) are included
 * - If endDate is provided, only sessions with finishedAt <= endDate (end of day UTC, 23:59:59.999) are included
 */
function filterSessions(sessions: MockSession[], filters: Filters): MockSession[] {
  return sessions.filter((session) => {
    // Must be finished with a non-null finishedAt
    if (session.status !== 'finished' || session.finishedAt === null) {
      return false;
    }

    // Variant filter: if variants array is provided and non-empty, session must match
    if (filters.variants && filters.variants.length > 0) {
      if (!session.variant || !filters.variants.includes(session.variant)) {
        return false;
      }
    }

    // Start date filter: finishedAt must be >= start of startDate
    if (filters.startDate) {
      const startBound = new Date(filters.startDate);
      if (session.finishedAt < startBound) {
        return false;
      }
    }

    // End date filter: finishedAt must be <= end of endDate (23:59:59.999 UTC)
    if (filters.endDate) {
      const endBound = new Date(filters.endDate + 'T23:59:59.999Z');
      if (session.finishedAt > endBound) {
        return false;
      }
    }

    return true;
  });
}

describe('Date range and variant filtering', () => {
  const VARIANTS = ['called-ace-5p', 'jack-of-diamonds', 'partner-draft', 'leasters', 'standard'];
  const STATUSES = ['finished', 'waiting', 'active', 'abandoned'] as const;

  // Generate a date within a reasonable range (2023-01-01 to 2025-12-31)
  const dateArb = fc.integer({ min: 1672531200000, max: 1767225600000 }).map((ms) => new Date(ms));

  // Generate a YYYY-MM-DD string within the same range
  const dateStringArb = fc
    .integer({ min: 1672531200000, max: 1767225600000 })
    .map((ms) => new Date(ms).toISOString().slice(0, 10));

  const sessionArb: fc.Arbitrary<MockSession> = fc.record({
    id: fc.integer({ min: 1, max: 100000 }),
    finishedAt: fc.option(dateArb, { nil: null, freq: 8 }), // mostly non-null
    variant: fc.option(fc.constantFrom(...VARIANTS), { nil: null, freq: 8 }),
    status: fc.constantFrom(...STATUSES),
  });

  // Generate filters where startDate <= endDate when both are present
  const filtersArb: fc.Arbitrary<Filters> = fc
    .record({
      variants: fc.option(fc.subarray(VARIANTS, { minLength: 1, maxLength: VARIANTS.length }), {
        nil: undefined,
      }),
      date1: fc.option(dateStringArb, { nil: undefined }),
      date2: fc.option(dateStringArb, { nil: undefined }),
    })
    .map(({ variants, date1, date2 }) => {
      const filters: Filters = {};
      if (variants) {
        filters.variants = variants;
      }
      // Ensure startDate <= endDate when both are present
      if (date1 !== undefined && date2 !== undefined) {
        if (date1 <= date2) {
          filters.startDate = date1;
          filters.endDate = date2;
        } else {
          filters.startDate = date2;
          filters.endDate = date1;
        }
      } else if (date1 !== undefined) {
        // Randomly assign to startDate or endDate
        filters.startDate = date1;
      } else if (date2 !== undefined) {
        filters.endDate = date2;
      }
      return filters;
    });

  it('includes only sessions within date range and matching variants', () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { minLength: 0, maxLength: 30 }),
        filtersArb,
        (sessions, filters) => {
          const result = filterSessions(sessions, filters);

          // Every included session must satisfy all filter criteria
          for (const session of result) {
            // Must be finished with non-null finishedAt
            expect(session.status).toBe('finished');
            expect(session.finishedAt).not.toBeNull();

            // Must match variant filter if specified
            if (filters.variants && filters.variants.length > 0) {
              expect(filters.variants).toContain(session.variant);
            }

            // Must be within date range
            if (filters.startDate) {
              const startBound = new Date(filters.startDate);
              expect(session.finishedAt!.getTime()).toBeGreaterThanOrEqual(startBound.getTime());
            }
            if (filters.endDate) {
              const endBound = new Date(filters.endDate + 'T23:59:59.999Z');
              expect(session.finishedAt!.getTime()).toBeLessThanOrEqual(endBound.getTime());
            }
          }

          // Every excluded session must violate at least one filter criterion
          const excludedSessions = sessions.filter((s) => !result.includes(s));
          for (const session of excludedSessions) {
            const isFinished = session.status === 'finished' && session.finishedAt !== null;
            const matchesVariant =
              !filters.variants ||
              filters.variants.length === 0 ||
              (session.variant !== null && filters.variants.includes(session.variant));
            const afterStart =
              !filters.startDate ||
              (session.finishedAt !== null && session.finishedAt >= new Date(filters.startDate));
            const beforeEnd =
              !filters.endDate ||
              (session.finishedAt !== null &&
                session.finishedAt <= new Date(filters.endDate + 'T23:59:59.999Z'));

            // At least one condition must be violated for the session to be excluded
            const shouldBeIncluded = isFinished && matchesVariant && afterStart && beforeEnd;
            expect(shouldBeIncluded).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('omitting all filters includes all finished sessions with non-null finishedAt', () => {
    fc.assert(
      fc.property(fc.array(sessionArb, { minLength: 0, maxLength: 30 }), (sessions) => {
        const result = filterSessions(sessions, {});

        const expected = sessions.filter((s) => s.status === 'finished' && s.finishedAt !== null);
        expect(result.length).toBe(expected.length);
        for (const session of expected) {
          expect(result).toContain(session);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('variant filter with empty array includes all finished sessions', () => {
    fc.assert(
      fc.property(fc.array(sessionArb, { minLength: 0, maxLength: 30 }), (sessions) => {
        const result = filterSessions(sessions, { variants: [] });

        const expected = sessions.filter((s) => s.status === 'finished' && s.finishedAt !== null);
        expect(result.length).toBe(expected.length);
      }),
      { numRuns: 100 },
    );
  });

  it('startDate without endDate has no upper bound', () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { minLength: 1, maxLength: 30 }),
        dateStringArb,
        (sessions, startDate) => {
          const result = filterSessions(sessions, { startDate });
          const startBound = new Date(startDate);

          // All results must be on or after startDate
          for (const session of result) {
            expect(session.finishedAt!.getTime()).toBeGreaterThanOrEqual(startBound.getTime());
          }

          // No finished session on or after startDate should be excluded
          const finishedAfterStart = sessions.filter(
            (s) => s.status === 'finished' && s.finishedAt !== null && s.finishedAt >= startBound,
          );
          expect(result.length).toBe(finishedAfterStart.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('endDate without startDate has no lower bound', () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { minLength: 1, maxLength: 30 }),
        dateStringArb,
        (sessions, endDate) => {
          const result = filterSessions(sessions, { endDate });
          const endBound = new Date(endDate + 'T23:59:59.999Z');

          // All results must be on or before endDate (end of day)
          for (const session of result) {
            expect(session.finishedAt!.getTime()).toBeLessThanOrEqual(endBound.getTime());
          }

          // No finished session on or before endDate should be excluded
          const finishedBeforeEnd = sessions.filter(
            (s) => s.status === 'finished' && s.finishedAt !== null && s.finishedAt <= endBound,
          );
          expect(result.length).toBe(finishedBeforeEnd.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});
