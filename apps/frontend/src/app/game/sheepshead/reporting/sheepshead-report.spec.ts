import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { type SheepsheadReportPayload } from '@cardquorum/shared';
import { SheepsheadReportComponent } from './sheepshead-report';

function buildPayload(overrides: Partial<SheepsheadReportPayload> = {}): SheepsheadReportPayload {
  return {
    totalSessions: 45,
    statCards: {
      pickRate: { numerator: 12, denominator: 45, value: 12 / 45 },
      pickWhenAbleRate: { numerator: 12, denominator: 30, value: 12 / 30 },
      winRateAsPicker: { numerator: 8, denominator: 12, value: 8 / 12 },
      winRateAsPartner: { numerator: 5, denominator: 10, value: 5 / 10 },
      winRateAsOpposition: { numerator: 10, denominator: 23, value: 10 / 23 },
      avgPointsAsPicker: { sum: 738, count: 12, value: 738 / 12 },
      avgScoreDelta: { sum: 15, count: 45, value: 15 / 45 },
      leadFailAceSuccessRate: { numerator: 5, denominator: 14, value: 5 / 14 },
    },
    scoreTrajectory: [
      { sessionIndex: 1, scoreDelta: 2, cumulativeScore: 2 },
      { sessionIndex: 2, scoreDelta: -1, cumulativeScore: 1 },
      { sessionIndex: 3, scoreDelta: 3, cumulativeScore: 4 },
    ],
    ...overrides,
  };
}

describe('SheepsheadReportComponent', () => {
  let fixture: ComponentFixture<SheepsheadReportComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SheepsheadReportComponent],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(SheepsheadReportComponent);
    el = fixture.nativeElement;
  });

  describe('stat card rendering', () => {
    it('renders all 8 stat cards', () => {
      fixture.componentRef.setInput('payload', buildPayload());
      fixture.detectChanges();

      const grid = el.querySelector('[data-testid="stat-card-grid"]');
      expect(grid).toBeTruthy();

      const expectedTestIds = [
        'stat-pick-rate',
        'stat-pick-when-able-rate',
        'stat-win-rate-picker',
        'stat-win-rate-partner',
        'stat-win-rate-opposition',
        'stat-avg-points-picker',
        'stat-avg-score-delta',
        'stat-lead-fail-ace-success',
      ];

      for (const testId of expectedTestIds) {
        expect(el.querySelector(`[data-testid="${testId}"]`)).toBeTruthy();
      }
    });

    it('formats ratio stats as percentages with one decimal place', () => {
      const payload = buildPayload({
        statCards: {
          ...buildPayload().statCards,
          pickRate: { numerator: 20, denominator: 44, value: 20 / 44 },
        },
      });
      fixture.componentRef.setInput('payload', payload);
      fixture.detectChanges();

      const card = el.querySelector('[data-testid="stat-pick-rate"]');
      expect(card?.textContent).toContain('45.5%');
    });

    it('formats average stats with one decimal place', () => {
      const payload = buildPayload({
        statCards: {
          ...buildPayload().statCards,
          avgPointsAsPicker: { sum: 738, count: 12, value: 61.5 },
        },
      });
      fixture.componentRef.setInput('payload', payload);
      fixture.detectChanges();

      const card = el.querySelector('[data-testid="stat-avg-points-picker"]');
      expect(card?.textContent).toContain('61.5');
    });

    it('displays secondary context showing raw counts for ratio stats', () => {
      fixture.componentRef.setInput('payload', buildPayload());
      fixture.detectChanges();

      const card = el.querySelector('[data-testid="stat-pick-rate"]');
      expect(card?.textContent).toContain('12 / 45 games');
    });

    it('displays secondary context showing game count for average stats', () => {
      fixture.componentRef.setInput('payload', buildPayload());
      fixture.detectChanges();

      const card = el.querySelector('[data-testid="stat-avg-points-picker"]');
      expect(card?.textContent).toContain('12 games');
    });
  });

  describe('zero-denominator display', () => {
    it('displays dash when ratio stat denominator is zero', () => {
      const payload = buildPayload({
        statCards: {
          ...buildPayload().statCards,
          winRateAsPicker: { numerator: 0, denominator: 0, value: null },
        },
      });
      fixture.componentRef.setInput('payload', payload);
      fixture.detectChanges();

      const card = el.querySelector('[data-testid="stat-win-rate-picker"]');
      expect(card?.textContent).toContain('—');
    });

    it('displays dash when average stat count is zero', () => {
      const payload = buildPayload({
        statCards: {
          ...buildPayload().statCards,
          avgPointsAsPicker: { sum: 0, count: 0, value: null },
        },
      });
      fixture.componentRef.setInput('payload', payload);
      fixture.detectChanges();

      const card = el.querySelector('[data-testid="stat-avg-points-picker"]');
      expect(card?.textContent).toContain('—');
    });

    it('does not show secondary context when denominator is zero', () => {
      const payload = buildPayload({
        statCards: {
          ...buildPayload().statCards,
          winRateAsPartner: { numerator: 0, denominator: 0, value: null },
        },
      });
      fixture.componentRef.setInput('payload', payload);
      fixture.detectChanges();

      const card = el.querySelector('[data-testid="stat-win-rate-partner"]');
      expect(card?.textContent).not.toContain('games');
    });
  });

  describe('chart visibility threshold', () => {
    it('shows chart canvas when trajectory has 2+ data points', () => {
      fixture.componentRef.setInput('payload', buildPayload());
      fixture.detectChanges();

      expect(el.querySelector('[data-testid="score-trajectory-chart"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="chart-insufficient-data"]')).toBeNull();
    });

    it('shows insufficient data message when trajectory has fewer than 2 points', () => {
      const payload = buildPayload({
        scoreTrajectory: [{ sessionIndex: 1, scoreDelta: 2, cumulativeScore: 2 }],
      });
      fixture.componentRef.setInput('payload', payload);
      fixture.detectChanges();

      expect(el.querySelector('[data-testid="chart-insufficient-data"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="score-trajectory-chart"]')).toBeNull();
    });

    it('shows insufficient data message when trajectory is empty', () => {
      const payload = buildPayload({ scoreTrajectory: [] });
      fixture.componentRef.setInput('payload', payload);
      fixture.detectChanges();

      expect(el.querySelector('[data-testid="chart-insufficient-data"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="score-trajectory-chart"]')).toBeNull();
    });
  });
});
