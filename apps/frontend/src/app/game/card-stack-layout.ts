/** Position and rotation for a single card in the stack. */
export interface CardPosition {
  x: number;
  y: number;
  rotation: number;
  zIndex: number;
}

/** Inputs to the layout computation. */
export interface LayoutParams {
  count: number;
  spread: number;
  spreadAngle: number;
  cardWidth: number;
  cardHeight: number;
}

/** Inputs for biased-placement mode. */
export interface BiasedPlacementParams {
  cardName: string | null;
  playerID: number;
  seatCount: number;
  playerIndex: number;
  cardWidth: number;
  cardHeight: number;
}

/** A single entry in the CardStack's cards array. */
export type CardEntry = string | null;

export interface CardSelectEvent {
  cardName: string;
  index: number;
}

export interface CardDragEvent {
  cardName: string;
  index: number;
}

/** Emitted whenever the multi-select selection set changes. */
export type CardSelectionEvent = string[];

const DEFAULT_CARD_WIDTH = 72;
const DEFAULT_CARD_HEIGHT = 101;
const MIN_ARC_RADIUS = 10;
const MAX_ROTATION = 15;

/**
 * Deterministic hash function for seeding the PRNG.
 * DJB2-variant: given the same cardName + playerID, always produces the same seed.
 */
export function deterministicSeed(cardName: string, playerID: number): number {
  let hash = playerID;
  for (let i = 0; i < cardName.length; i++) {
    hash = ((hash << 5) - hash + cardName.charCodeAt(i)) | 0;
  }
  return hash >>> 0; // ensure unsigned
}

/**
 * Simple 32-bit xorshift PRNG.
 * Returns a function that produces pseudo-random numbers in [0, 1) on each call.
 */
function xorshift(seed: number): () => number {
  let state = seed || 1; // avoid zero state
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

/**
 * Compute a single card's biased-placement position.
 * Uses a deterministic PRNG seeded from cardName + playerID.
 * Biases offset toward the player's seat angle, random rotation ±15°.
 */
export function computeBiasedPosition(params: BiasedPlacementParams): CardPosition {
  const { cardName, playerID, seatCount, playerIndex, cardWidth, cardHeight } = params;

  const name = cardName ?? '';
  const seed = deterministicSeed(name, playerID);
  const rand = xorshift(seed);

  // Base angle pointing toward the player's seat position
  const seatAngle = (playerIndex / Math.max(1, seatCount)) * 2 * Math.PI;

  // Random offset magnitude, biased toward the player's direction
  const w = cardWidth > 0 ? cardWidth : DEFAULT_CARD_WIDTH;
  const h = cardHeight > 0 ? cardHeight : DEFAULT_CARD_HEIGHT;
  const maxOffset = Math.min(w, h) * 0.6;
  const magnitude = rand() * maxOffset;

  // Add some angular spread around the seat angle
  const angleSpread = (rand() - 0.5) * Math.PI * 0.5;
  const finalAngle = seatAngle + angleSpread;

  const x = Math.cos(finalAngle) * magnitude;
  const y = Math.sin(finalAngle) * magnitude;

  // Random rotation ±15°
  const rotation = (rand() - 0.5) * 2 * MAX_ROTATION;

  return { x, y, rotation, zIndex: 0 };
}

/**
 * Compute card positions for a linear or arc layout.
 * Pure function — no DOM access, no side effects.
 */
export function computeCardPositions(params: LayoutParams): CardPosition[] {
  const count = params.count;
  if (count <= 0) return [];

  const spread = Math.max(0, Math.min(1, params.spread));
  const spreadAngle = Math.max(0, params.spreadAngle);
  const cardWidth = params.cardWidth > 0 ? params.cardWidth : DEFAULT_CARD_WIDTH;

  const step = spread * cardWidth;

  if (count === 1) {
    return [{ x: 0, y: 0, rotation: 0, zIndex: 0 }];
  }

  if (spreadAngle === 0) {
    return computeStraightLine(count, step);
  }

  return computeArc(count, step, spreadAngle, cardWidth);
}

function computeStraightLine(count: number, step: number): CardPosition[] {
  const totalWidth = (count - 1) * step;
  const startX = -totalWidth / 2;

  const positions: CardPosition[] = [];
  for (let i = 0; i < count; i++) {
    positions.push({
      x: startX + i * step,
      y: 0,
      rotation: 0,
      zIndex: i,
    });
  }
  return positions;
}

/**
 * Compute the uniform scale factor for auto-scaling.
 * Returns min(1, containerWidth / naturalWidth).
 * Returns 1 for zero or negative inputs.
 * Pure function — no DOM access.
 */
export function computeScaleFactor(naturalWidth: number, containerWidth: number): number {
  if (naturalWidth <= 0 || containerWidth <= 0) {
    return 1;
  }
  return Math.min(1, containerWidth / naturalWidth);
}

function computeArc(
  count: number,
  step: number,
  spreadAngleDeg: number,
  cardWidth: number,
): CardPosition[] {
  const spreadAngleRad = (spreadAngleDeg * Math.PI) / 180;
  const totalWidth = (count - 1) * step + cardWidth;

  const sinHalf = Math.sin(spreadAngleRad / 2);
  const radius =
    sinHalf > 0 ? Math.max(MIN_ARC_RADIUS, totalWidth / (2 * sinHalf)) : MIN_ARC_RADIUS;

  const halfAngle = spreadAngleRad / 2;

  const positions: CardPosition[] = [];
  for (let i = 0; i < count; i++) {
    const theta = -halfAngle + i * (spreadAngleRad / (count - 1));
    const x = radius * Math.sin(theta);
    const y = radius * (1 - Math.cos(theta));
    const rotationDeg = (theta * 180) / Math.PI;

    positions.push({
      x,
      y,
      rotation: rotationDeg,
      zIndex: i,
    });
  }
  return positions;
}
