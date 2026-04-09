import type {
  CardAsset,
  GameTablePlugin,
  SeatInfo,
  StatusInfo,
  TrickPlayView,
} from '@cardquorum/shared';

const SUIT_NAMES: Record<string, string> = {
  c: 'Clubs',
  s: 'Spades',
  h: 'Hearts',
  d: 'Diamonds',
};

const RANK_NAMES: Record<string, string> = {
  '7': '7',
  '8': '8',
  '9': '9',
  x: '10',
  j: 'Jack',
  q: 'Queen',
  k: 'King',
  a: 'Ace',
};

interface SheepsheadPlayerView {
  players: Array<{
    userID: number;
    role: string | null;
    hand: Array<{ name: string }>;
    tricksWon: number;
    pointsWon: number;
    scoreDelta: number | null;
  }>;
  phase: string;
  trickNumber: number;
  activePlayer: number | null;
  blind: Array<{ name: string }> | null;
  buried: Array<{ name: string }> | null;
  calledCard: string | null;
  hole: { name: string } | null;
  tricks: Array<{
    plays: Array<{ player: number; card: { name: string } }>;
    winner: number | null;
  }>;
  crack: { crackedBy: number; reCrackedBy: number | null } | null;
  blitz: { type: string; blitzedBy: number } | null;
  previousGameDouble: boolean | null;
  noPick: string | null;
  redeals: unknown[] | null;
  legalCardNames: string[] | null;
}

type SheepsheadAction = { type: string; payload?: unknown };

function getCardAsset(cardName: string): CardAsset {
  const rank = cardName.slice(0, -1);
  const suit = cardName.slice(-1);
  const rankLabel = RANK_NAMES[rank] ?? rank;
  const suitLabel = SUIT_NAMES[suit] ?? suit;
  return {
    src: `cards/${cardName}.svg`,
    alt: `${rankLabel} of ${suitLabel}`,
  };
}

function getLegalCards(state: SheepsheadPlayerView, validActions: string[]): string[] {
  if (!validActions.includes('play_card')) return [];
  if (state.legalCardNames) return state.legalCardNames;
  // Fallback: all cards in hand (shouldn't happen with current backend)
  const me = state.players.find((p) => p.userID === state.activePlayer);
  if (!me) return [];
  return me.hand.map((c) => c.name);
}

function getActiveOverlay(state: SheepsheadPlayerView, validActions: string[]): string | null {
  if (state.phase === 'score' && state.players[0]?.scoreDelta !== null) return 'score';
  if (state.phase === 'deal') return 'deal';
  if (validActions.includes('pick') || validActions.includes('pass')) return 'pick';
  if (validActions.includes('bury')) return 'bury';
  if (validActions.includes('call_ace')) return 'call';
  if (
    validActions.includes('crack') ||
    validActions.includes('re_crack') ||
    validActions.includes('blitz')
  ) {
    return 'crack';
  }
  return null;
}

function buildPlayCardEvent(state: SheepsheadPlayerView, cardName: string): SheepsheadAction {
  for (const p of state.players) {
    const card = p.hand.find((c) => c.name === cardName);
    if (card) return { type: 'play_card', payload: { card } };
  }
  return { type: 'play_card', payload: { card: { name: cardName } } };
}

function buildBuryEvent(state: SheepsheadPlayerView, cardNames: string[]): SheepsheadAction {
  const allCards = state.players.flatMap((p) => p.hand);
  const cards = cardNames.map((name) => allCards.find((c) => c.name === name) ?? { name });
  return { type: 'bury', payload: { cards } };
}

function getCurrentTrick(state: SheepsheadPlayerView): TrickPlayView[] | null {
  if (state.phase !== 'play' || state.tricks.length === 0) return null;
  const currentTrick = state.tricks[state.tricks.length - 1];
  if (!currentTrick || currentTrick.plays.length === 0) return null;
  return currentTrick.plays.map((p) => ({
    userID: p.player,
    cardName: p.card.name,
  }));
}

function getPlayerSeats(state: SheepsheadPlayerView, myUserID: number): SeatInfo[] {
  return state.players
    .filter((p) => p.userID !== myUserID)
    .map((p) => ({
      userID: p.userID,
      handSize: p.hand.length,
      isDealer: state.players[0]?.userID === p.userID,
      isActive: state.activePlayer === p.userID,
    }));
}

function getStatusInfo(state: SheepsheadPlayerView): StatusInfo {
  const phaseLabels: Record<string, string> = {
    deal: 'Dealing',
    pick: 'Pick Phase',
    bury: 'Bury Phase',
    call: 'Call Phase',
    play: 'Play',
    score: 'Scoring',
  };
  const me = state.players[0];
  const handSize = me?.hand.length ?? 0;
  return {
    phaseLabel: phaseLabels[state.phase] ?? state.phase,
    trickNumber: state.trickNumber,
    totalTricks: handSize > 0 ? handSize : state.trickNumber,
  };
}

function getMyHand(state: SheepsheadPlayerView, myUserID: number): string[] {
  const me = state.players.find((p) => p.userID === myUserID);
  return me ? me.hand.map((c) => c.name) : [];
}

export const SheepsheadTablePlugin: GameTablePlugin<SheepsheadPlayerView, SheepsheadAction> = {
  getCardAsset,
  getLegalCards,
  getActiveOverlay,
  buildPlayCardEvent,
  buildBuryEvent,
  getCurrentTrick,
  getPlayerSeats,
  getStatusInfo,
  getMyHand,
};
