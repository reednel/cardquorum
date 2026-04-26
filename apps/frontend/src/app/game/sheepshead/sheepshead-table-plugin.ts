import type {
  CardAsset,
  GameTablePlugin,
  SeatInfo,
  StatusBarConfig,
  StatusItem,
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
    hand: Array<{ name: string } | null>;
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
  dealerUserID: number | null;
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
  return me.hand.filter((c) => c !== null).map((c) => c.name);
}

function getActiveOverlay(state: SheepsheadPlayerView, _validActions: string[]): string | null {
  if (state.phase === 'score' && state.players[0]?.scoreDelta !== null) return 'score';
  return null;
}

function getBlindCards(state: SheepsheadPlayerView): (string | null)[] {
  if (state.phase === 'deal') {
    // Show a small tight stack representing the deck
    return Array(5).fill(null);
  }
  if (state.phase === 'pick') {
    return state.blind?.map(() => null) ?? [];
  }
  return [];
}

function getBuryCount(state: SheepsheadPlayerView, config: unknown): number {
  const cfg = config as { blindSize?: number; name?: string } | null;
  if (!cfg) return 2;
  const blindSize = cfg.blindSize ?? 2;
  return cfg.name === 'partner-draft' ? Math.floor(blindSize / 2) : blindSize;
}

function buildPlayCardEvent(state: SheepsheadPlayerView, cardName: string): SheepsheadAction {
  for (const p of state.players) {
    const card = p.hand.find((c) => c !== null && c.name === cardName);
    if (card) return { type: 'play_card', payload: { card } };
  }
  return { type: 'play_card', payload: { card: { name: cardName } } };
}

function buildBuryEvent(state: SheepsheadPlayerView, cardNames: string[]): SheepsheadAction {
  const allCards = state.players.flatMap((p) => p.hand).filter((c) => c !== null);
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
      isDealer: state.dealerUserID === p.userID,
      isActive: state.activePlayer === p.userID,
    }));
}

function getStatusInfo(
  state: SheepsheadPlayerView,
  myUserID: number,
  config: unknown,
): StatusBarConfig {
  const phaseLabels: Record<string, string> = {
    deal: 'Dealing',
    pick: 'Pick Phase',
    bury: 'Bury Phase',
    call: 'Call Phase',
    play: 'Play',
    score: 'Scoring',
  };

  const items: StatusItem[] = [
    { type: 'text', key: 'phase', label: phaseLabels[state.phase] ?? state.phase },
  ];

  if (state.phase === 'play' && state.trickNumber > 0) {
    const cfg = config as { handSize?: number } | null;
    const totalTricks = cfg?.handSize ?? state.trickNumber;
    items.push({
      type: 'text',
      key: 'trick',
      label: `Trick ${state.trickNumber} / ${totalTricks}`,
    });
  }

  if (state.crack) {
    const label = state.crack.reCrackedBy != null ? 'Re-cracked!' : 'Cracked!';
    items.push({ type: 'badge', key: 'crack', label, color: 'yellow' });
  }

  if (state.blitz) {
    const color = state.blitz.type === 'black' ? 'dark' : 'red';
    items.push({
      type: 'badge',
      key: 'blitz',
      label: `${state.blitz.type.charAt(0).toUpperCase() + state.blitz.type.slice(1)} Blitz`,
      color,
    });
  }

  const isMyTurn = state.activePlayer === myUserID;

  return {
    items,
    barVariant: isMyTurn ? 'active-turn' : 'default',
  };
}

function getMyHand(state: SheepsheadPlayerView, myUserID: number): string[] {
  const me = state.players.find((p) => p.userID === myUserID);
  return me ? me.hand.filter((c) => c !== null).map((c) => c.name) : [];
}

function buildMoveEvent(
  state: SheepsheadPlayerView,
  selectedCards: string[],
  targetStackId: string,
): SheepsheadAction {
  if (targetStackId === 'buried') {
    return buildBuryEvent(state, selectedCards);
  }
  return buildPlayCardEvent(state, selectedCards[0]);
}

function getDefaultTarget(state: SheepsheadPlayerView, validActions: string[]): string | null {
  if (state.phase === 'play' && validActions.includes('play_card')) {
    return 'trick-pile';
  }
  return null;
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
  getBlindCards,
  getBuryCount,
  buildMoveEvent,
  getDefaultTarget,
};
