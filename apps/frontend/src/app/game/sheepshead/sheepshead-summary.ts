import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { UserIdentity } from '@cardquorum/shared';
import type { SheepsheadStore, UserID } from '@cardquorum/sheepshead';

interface SummaryRow {
  userID: UserID;
  displayName: string;
  role: string | null;
  tricksWon: number;
  pointsWon: number;
  scoreDelta: number | null;
}

@Component({
  selector: 'app-sheepshead-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-border dark:border-border-dark">
          <th
            scope="col"
            class="px-2 py-1 text-left font-medium text-text-secondary dark:text-text-secondary-dark"
          >
            Player
          </th>
          <th
            scope="col"
            class="px-2 py-1 text-left font-medium text-text-secondary dark:text-text-secondary-dark"
          >
            Role
          </th>
          <th
            scope="col"
            class="px-2 py-1 text-right font-medium text-text-secondary dark:text-text-secondary-dark"
          >
            Tricks
          </th>
          <th
            scope="col"
            class="px-2 py-1 text-right font-medium text-text-secondary dark:text-text-secondary-dark"
          >
            Points
          </th>
          <th
            scope="col"
            class="px-2 py-1 text-right font-medium text-text-secondary dark:text-text-secondary-dark"
          >
            Score
          </th>
        </tr>
      </thead>
      <tbody>
        @for (row of rows(); track row.userID) {
          <tr class="border-b border-surface-raised dark:border-border-dark/50">
            <td class="px-2 py-1.5 text-text-body dark:text-text-heading-dark">
              {{ row.displayName }}
            </td>
            <td class="px-2 py-1.5 capitalize text-text-secondary dark:text-text-secondary-dark">
              {{ row.role ?? '—' }}
            </td>
            <td class="px-2 py-1.5 text-right text-text-body dark:text-text-heading-dark">
              {{ row.tricksWon }}
            </td>
            <td class="px-2 py-1.5 text-right text-text-body dark:text-text-heading-dark">
              {{ row.pointsWon }}
            </td>
            <td [class]="'px-2 py-1.5 text-right font-medium ' + scoreClass(row.scoreDelta)">
              {{ formatScore(row.scoreDelta) }}
            </td>
          </tr>
        }
      </tbody>
    </table>
  `,
  host: { class: 'contents' },
})
export class SheepsheadSummary {
  readonly store = input.required<SheepsheadStore>();
  readonly participants = input.required<UserIdentity[]>();

  protected readonly rows = computed<SummaryRow[]>(() => {
    const store = this.store();
    const participants = this.participants();

    return store.players.map((player) => {
      const tricks = store.tricks ?? [];
      const wonTricks = tricks.filter((t) => t.winner === player.userID);
      const tricksWon = wonTricks.length;

      const participant = participants.find((p) => p.userId === player.userID);
      const displayName =
        participant?.displayName ?? participant?.username ?? `Player ${player.userID}`;

      return {
        userID: player.userID,
        displayName,
        role: player.role,
        tricksWon,
        pointsWon: player.points ?? 0,
        scoreDelta: player.scoreDelta,
      };
    });
  });

  protected formatScore(scoreDelta: number | null): string {
    if (scoreDelta === null) return '—';
    if (scoreDelta > 0) return `+${scoreDelta}`;
    if (scoreDelta === 0) return '0';
    return String(scoreDelta);
  }

  protected scoreClass(scoreDelta: number | null): string {
    if (scoreDelta === null) return 'text-text-secondary dark:text-text-secondary-dark';
    if (scoreDelta > 0) return 'text-success dark:text-success-dark';
    if (scoreDelta < 0) return 'text-danger dark:text-danger-dark';
    return 'text-text-secondary dark:text-text-secondary-dark';
  }
}
