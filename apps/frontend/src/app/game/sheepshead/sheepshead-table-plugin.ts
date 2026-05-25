import type { Type } from '@angular/core';
import type {
  CardAsset,
  GameTablePlugin,
  SeatBadge,
  SeatInfo,
  StatusBarConfig,
  StatusItem,
  TrickPlayView,
} from '@cardquorum/shared';
import { DECK, formatCard, isTrump, SUIT_SYMBOLS } from '@cardquorum/sheepshead';
import { getPendingCall } from './pending-call-state';
import { SheepsheadSummary } from './sheepshead-summary';

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
  hasHoleCard: boolean;
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
  legalCallableCards: string[] | null;
  holeCardRequired: string[] | null;
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
  const cfg = config as { blindSize?: number; partnerDraft?: boolean } | null;
  if (!cfg) return 2;
  const blindSize = cfg.blindSize ?? 2;
  return cfg.partnerDraft === true ? Math.floor(blindSize / 2) : blindSize;
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

function getSeatBadges(state: SheepsheadPlayerView, userID: number): SeatBadge[] {
  const badges: SeatBadge[] = [];
  const player = state.players.find((p) => p.userID === userID);
  if (!player) return badges;

  // Dealer badge — visible all phases
  if (state.dealerUserID === userID) {
    badges.push({ label: 'D', color: 'blue', position: 'left', description: 'Dealer' });
  }

  // Picker badge — visible once a player has picked
  if (player.role === 'picker') {
    badges.push({ label: 'P', color: 'purple', position: 'left', description: 'Picker' });
  }

  // Leader badge — only during play phase
  if (state.phase === 'play' && state.tricks.length > 0) {
    const currentTrick = state.tricks[state.tricks.length - 1];
    const leaderUserID =
      currentTrick.plays.length > 0 ? currentTrick.plays[0].player : state.activePlayer;
    if (leaderUserID === userID) {
      badges.push({ label: 'L', color: 'yellow', position: 'right', description: 'Leader' });
    }
  }

  // Tricks won badge — only during play phase, only if > 0
  if (state.phase === 'play' && player.tricksWon > 0) {
    badges.push({
      label: String(player.tricksWon),
      color: 'green',
      position: 'right',
      description: `${player.tricksWon} trick${player.tricksWon > 1 ? 's' : ''} won`,
    });
  }

  return badges;
}

function getPlayerSeats(state: SheepsheadPlayerView, myUserID: number): SeatInfo[] {
  return state.players
    .filter((p) => p.userID !== myUserID)
    .map((p) => ({
      userID: p.userID,
      handSize: p.hand.length,
      isDealer: state.dealerUserID === p.userID,
      isActive: state.activePlayer === p.userID,
      badges: getSeatBadges(state, p.userID),
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

    // Lead suit badge — show what suit was led in the current trick
    if (state.tricks?.length > 0) {
      const currentTrick = state.tricks[state.tricks.length - 1];
      if (currentTrick.plays.length > 0) {
        const leadCardName = currentTrick.plays[0].card.name;
        const leadCard = DECK.find((c) => c.name === leadCardName);
        if (leadCard) {
          const label = isTrump(leadCard) ? 'Trump lead' : `${SUIT_SYMBOLS[leadCard.suit]} lead`;
          items.push({ type: 'badge', key: 'lead', label, color: 'yellow' });
        }
      }
    }
  }

  if (state.crack) {
    const label = state.crack.reCrackedBy != null ? 'Re-cracked!' : 'Cracked!';
    items.push({ type: 'badge', key: 'crack', label, color: 'pink' });
  }

  if (state.blitz) {
    const blitzColor = state.blitz.type.startsWith('black') ? 'dark' : 'red';
    const blitzLabel = state.blitz.type.startsWith('black') ? 'Black Blitz' : 'Red Blitz';
    items.push({
      type: 'badge',
      key: 'blitz',
      label: blitzLabel,
      color: blitzColor,
    });
  }

  if (state.calledCard) {
    const card = DECK.find((c) => c.name === state.calledCard);
    const label = `${card ? formatCard(card) : state.calledCard} called`;
    items.push({ type: 'badge', key: 'called', label, color: 'purple' });
  }

  const isMyTurn = state.activePlayer === myUserID;

  return {
    items,
    barVariant: isMyTurn ? 'active-turn-pulse' : 'default',
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
  if (targetStackId === 'hole-card') {
    // Dropping a card into the hole-card stack — build the call_ace action with holeCard
    const pendingCall = getPendingCall();
    if (!pendingCall) return { type: 'noop' };
    const allCards = state.players.flatMap((p) => p.hand).filter((c) => c !== null);
    const holeCard = allCards.find((c) => c.name === selectedCards[0]) ?? {
      name: selectedCards[0],
    };
    return { type: 'call_ace', payload: { card: pendingCall, holeCard } };
  }
  if (targetStackId === 'trick-pile' && selectedCards.length === 1 && selectedCards[0] === 'hole') {
    // Playing the hole card from the hole-card stack to trick-pile
    return { type: 'play_hole' };
  }
  return buildPlayCardEvent(state, selectedCards[0]);
}

function getDefaultTarget(state: SheepsheadPlayerView, validActions: string[]): string | null {
  if (
    state.phase === 'play' &&
    (validActions.includes('play_card') || validActions.includes('play_hole'))
  ) {
    return 'trick-pile';
  }
  // During call phase with a pending unknown ace call, hand cards target the hole-card stack
  if (state.phase === 'call' && getPendingCall()) {
    return 'hole-card';
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
  getSeatBadges,
  getSummaryComponent(): Type<unknown> {
    return SheepsheadSummary;
  },
};
