import { GameReportPlugin } from '@cardquorum/shared';
import { CONFIG_PRESETS } from '@cardquorum/sheepshead';
import { SheepsheadReportComponent } from './sheepshead-report';

export const SheepsheadReportPlugin: GameReportPlugin = {
  label: 'Sheepshead',
  variants: CONFIG_PRESETS.map((p) => ({ key: p.name, label: p.label })),
  getReportComponent: () => SheepsheadReportComponent,
};
