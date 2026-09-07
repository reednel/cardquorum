import { TestBed, type ComponentFixture } from '@angular/core/testing';
import * as fc from 'fast-check';
import { SheepsheadSummary } from './sheepshead-summary';

/**
 * Arbitrary score delta: integers spanning negative, zero, and positive values.
 */
function arbScoreDelta(): fc.Arbitrary<number> {
  return fc.integer({ min: -100, max: 100 });
}

describe('Score display formatting', () => {
  let component: SheepsheadSummary;
  let fixture: ComponentFixture<SheepsheadSummary>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SheepsheadSummary],
    }).compileComponents();

    fixture = TestBed.createComponent(SheepsheadSummary);
    component = fixture.componentInstance;
  });

  it('positive values display with "+" prefix and success color class', () => {
    fc.assert(
      fc.property(
        arbScoreDelta().filter((n) => n > 0),
        (delta) => {
          const formatted = (component as any).formatScore(delta);
          const cssClass = (component as any).scoreClass(delta);

          expect(formatted).toBe(`+${delta}`);
          expect(cssClass).toContain('text-success');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('negative values display without prefix and with danger color class', () => {
    fc.assert(
      fc.property(
        arbScoreDelta().filter((n) => n < 0),
        (delta) => {
          const formatted = (component as any).formatScore(delta);
          const cssClass = (component as any).scoreClass(delta);

          expect(formatted).toBe(String(delta));
          expect(cssClass).toContain('text-danger');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('zero displays as "0" with secondary text color class', () => {
    const formatted = (component as any).formatScore(0);
    const cssClass = (component as any).scoreClass(0);

    expect(formatted).toBe('0');
    expect(cssClass).toContain('text-text-secondary');
    expect(cssClass).not.toContain('text-success');
    expect(cssClass).not.toContain('text-danger');
  });

  it('null displays as em-dash with secondary text color class', () => {
    const formatted = (component as any).formatScore(null);
    const cssClass = (component as any).scoreClass(null);

    expect(formatted).toBe('—');
    expect(cssClass).toContain('text-text-secondary');
    expect(cssClass).not.toContain('text-success');
    expect(cssClass).not.toContain('text-danger');
  });

  it('for any non-null integer, formatting and class are consistent with sign', () => {
    fc.assert(
      fc.property(arbScoreDelta(), (delta) => {
        const formatted = (component as any).formatScore(delta);
        const cssClass = (component as any).scoreClass(delta);

        if (delta > 0) {
          expect(formatted).toBe(`+${delta}`);
          expect(cssClass).toContain('text-success');
          expect(cssClass).not.toContain('text-danger');
        } else if (delta < 0) {
          expect(formatted).toBe(String(delta));
          expect(cssClass).toContain('text-danger');
          expect(cssClass).not.toContain('text-success');
        } else {
          expect(formatted).toBe('0');
          expect(cssClass).toContain('text-text-secondary');
          expect(cssClass).not.toContain('text-success');
          expect(cssClass).not.toContain('text-danger');
        }
      }),
      { numRuns: 100 },
    );
  });
});
