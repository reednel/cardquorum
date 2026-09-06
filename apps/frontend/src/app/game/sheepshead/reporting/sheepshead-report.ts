import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { type ChartConfiguration } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { type AverageStat, type RatioStat, type SheepsheadReportPayload } from '@cardquorum/shared';
import '../../../shared/chart-config';

interface StatCardDisplay {
  label: string;
  value: string;
  context: string | null;
  testId: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BaseChartDirective],
  selector: 'app-sheepshead-report',
  template: `
    <div class="flex flex-wrap justify-center gap-4" data-testid="stat-card-grid">
      @for (card of statCards(); track card.testId) {
        <div
          class="flex aspect-square w-[120px] flex-col items-center justify-center rounded-default
                 border border-border bg-surface p-3 text-center
                 dark:border-border-dark dark:bg-surface-dark"
          [attr.data-testid]="card.testId"
        >
          <p class="text-xs font-medium text-text-secondary dark:text-text-secondary-dark">
            {{ card.label }}
          </p>
          <p class="mt-1 text-2xl font-semibold text-text-heading dark:text-text-heading-dark">
            {{ card.value }}
          </p>
          @if (card.context) {
            <p class="mt-0.5 text-xs text-text-secondary dark:text-text-secondary-dark">
              {{ card.context }}
            </p>
          }
        </div>
      }
    </div>

    <div class="mt-6" data-testid="score-trajectory-section">
      @if (payload().scoreTrajectory.length >= 2) {
        <div class="relative h-[300px] w-full">
          <canvas
            style="position: absolute; inset: 0; width: 100% !important; height: 100% !important;"
            baseChart
            [type]="'line'"
            [data]="chartData()"
            [options]="chartOptions"
            aria-label="Score trajectory chart showing cumulative score over time"
            role="img"
            data-testid="score-trajectory-chart"
          ></canvas>
        </div>
      } @else {
        <p data-testid="chart-insufficient-data">Not enough data for chart</p>
      }
    </div>
  `,
})
export class SheepsheadReportComponent {
  readonly payload = input.required<SheepsheadReportPayload>();

  protected readonly chartData = computed(() => {
    const trajectory = this.payload().scoreTrajectory;
    return {
      labels: trajectory.map((p) => p.sessionIndex.toString()),
      datasets: [
        {
          data: trajectory.map((p) => p.cumulativeScore),
          label: 'Cumulative Score',
          borderColor: '#3b82f6',
          tension: 0.1,
          fill: false,
          pointRadius: 3,
        },
      ],
    };
  });

  protected readonly chartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { title: { display: true, text: 'Session' } },
      y: { title: { display: true, text: 'Cumulative Score' } },
    },
    plugins: {
      tooltip: {
        callbacks: {
          title: (items) => `Session ${items[0].label}`,
          label: (item) => {
            const point = this.payload().scoreTrajectory[item.dataIndex];
            return [
              `Score Delta: ${point.scoreDelta > 0 ? '+' : ''}${point.scoreDelta}`,
              `Cumulative: ${point.cumulativeScore}`,
            ];
          },
        },
      },
    },
  };

  protected readonly statCards = computed<StatCardDisplay[]>(() => {
    const p = this.payload();
    const cards = p.statCards;

    return [
      this.formatRatioCard('Pick Rate', cards.pickRate, 'stat-pick-rate'),
      this.formatRatioCard(
        'Pick-When-Able Rate',
        cards.pickWhenAbleRate,
        'stat-pick-when-able-rate',
      ),
      this.formatRatioCard('Win Rate as Picker', cards.winRateAsPicker, 'stat-win-rate-picker'),
      this.formatRatioCard('Win Rate as Partner', cards.winRateAsPartner, 'stat-win-rate-partner'),
      this.formatRatioCard(
        'Win Rate as Opposition',
        cards.winRateAsOpposition,
        'stat-win-rate-opposition',
      ),
      this.formatAverageCard(
        'Avg Points as Picker',
        cards.avgPointsAsPicker,
        'stat-avg-points-picker',
      ),
      this.formatAverageCard('Avg Score Delta', cards.avgScoreDelta, 'stat-avg-score-delta'),
      this.formatRatioCard(
        'Lead Fail Ace Win Rate',
        cards.leadFailAceSuccessRate,
        'stat-lead-fail-ace-success',
        'tricks',
      ),
    ];
  });

  private formatRatioCard(
    label: string,
    stat: RatioStat,
    testId: string,
    unit = 'games',
  ): StatCardDisplay {
    return {
      label,
      value: stat.value === null ? '—' : `${(stat.value * 100).toFixed(1)}%`,
      context: stat.denominator > 0 ? `${stat.numerator} / ${stat.denominator} ${unit}` : null,
      testId,
    };
  }

  private formatAverageCard(label: string, stat: AverageStat, testId: string): StatCardDisplay {
    return {
      label,
      value: stat.value === null ? '—' : stat.value.toFixed(1),
      context: stat.count > 0 ? `${stat.count} games` : null,
      testId,
    };
  }
}
