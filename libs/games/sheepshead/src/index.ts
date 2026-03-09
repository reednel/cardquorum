export * from './lib/types';
export {
  SUITS,
  RANKS,
  DECK,
  TOTAL_POINTS,
  TRUMP_ORDER,
  FAIL_RANK_ORDER,
  CONFIG_PRESETS,
} from './lib/constants';
export type { ConfigPreset } from './lib/constants';
export { isTrump, sumPoints, cardPower, cardsEqual } from './lib/cards';
export { createShuffledDeck, deal } from './lib/dealing';
export { evaluateTrick, legalPlays } from './lib/tricks';
export { pickingTeamPoints, isSchneider, isSchwarz, scoreMultiplier } from './lib/scoring';
export { determinePartnerJD, determinePartnerCalledAce, assignPartnerByRule } from './lib/partners';
export {
  handleDeal,
  handlePick,
  handleBury,
  handleCall,
  handlePlayCard,
  handleScore,
} from './lib/phases';
export { SheepsheadPlugin } from './lib/sheepshead-plugin';
