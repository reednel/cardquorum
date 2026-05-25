import { GameReportPlugin } from '@cardquorum/shared';
import { SheepsheadReportPlugin } from '../game/sheepshead/reporting/sheepshead-report-plugin';

export const GAME_REPORT_PLUGINS: Record<string, GameReportPlugin> = {
  sheepshead: SheepsheadReportPlugin,
};
