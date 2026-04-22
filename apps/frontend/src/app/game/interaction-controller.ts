import { Injectable, signal } from '@angular/core';

/**
 * Callback interface so InteractionController stays decoupled from GameService.
 * Provided via `init()` by the GameTable component.
 */
export interface InteractionDispatcher {
  queryTargets(sourceStackId: string, selectedCards: string[], generation: number): void;
  sendAction(event: { type: string; payload?: unknown }): void;
}

/**
 * Callback interface so InteractionController stays decoupled from the game-specific plugin.
 * Provided via `init()` by the GameTable component.
 */
export interface InteractionPluginAdapter {
  getDefaultTarget(): string | null;
  buildMoveEvent(
    selectedCards: string[],
    targetStackId: string,
  ): { type: string; payload?: unknown };
}

/**
 * Result of `resolveDropTarget`: tells the caller which target was hit
 * and whether to commit an existing selection or confirm a single-card shortcut.
 */
export interface DropResolution {
  targetId: string;
  mode: 'commit' | 'confirm';
}

/**
 * Coordinates card interactions across CardStack instances.
 *
 * Provided at the GameTable component level (NOT root) so each game table
 * instance gets its own interaction state. CardStack instances register
 * themselves with semantic Stack IDs; the controller manages the
 * idle → selecting → targeting state machine.
 */
@Injectable()
export class InteractionController {
  // ── Dispatcher and plugin adapter (set via init) ──
  private dispatcher: InteractionDispatcher | null = null;
  private pluginAdapter: InteractionPluginAdapter | null = null;

  // ── Writable signals (private) ──
  private readonly _phase = signal<'idle' | 'selecting' | 'targeting'>('idle');
  private readonly _selectedCards = signal<string[]>([]);
  private readonly _sourceStack = signal<string | null>(null);
  private readonly _validTargets = signal<string[]>([]);
  private readonly _isDragging = signal(false);
  private readonly _liveAnnouncement = signal('');

  // ── Public readonly signals ──
  readonly phase = this._phase.asReadonly();
  readonly selectedCards = this._selectedCards.asReadonly();
  readonly sourceStack = this._sourceStack.asReadonly();
  readonly validTargets = this._validTargets.asReadonly();
  readonly isDragging = this._isDragging.asReadonly();
  readonly liveAnnouncement = this._liveAnnouncement.asReadonly();

  // ── Registry ──
  // Stores HTMLElement references for bounding-rect hit-testing.
  private readonly registry = new Map<string, HTMLElement>();

  // ── Stale query tracking ──
  private queryGeneration = 0;

  // ── Initialization ──

  /** Called by GameTable to wire up the dispatcher and plugin adapter. */
  init(dispatcher: InteractionDispatcher, pluginAdapter: InteractionPluginAdapter): void {
    this.dispatcher = dispatcher;
    this.pluginAdapter = pluginAdapter;
  }

  /** Returns the current default target from the plugin, or null. */
  getDefaultTarget(): string | null {
    return this.pluginAdapter?.getDefaultTarget() ?? null;
  }

  // ── Drop resolution ──

  /**
   * Determine which valid target stack (if any) contains the given screen-space point.
   * Handles both multi-card targeting drops and single-card drag-to-play shortcuts.
   *
   * Returns a `DropResolution` with the target ID and mode, or null if no hit.
   */
  resolveDropTarget(
    sourceStackId: string,
    cardName: string,
    dropPoint: { x: number; y: number },
  ): DropResolution | null {
    const phase = this._phase();
    const selected = this._selectedCards();

    // Targeting phase: check valid targets for a multi-card commit
    if (phase === 'targeting' && selected.includes(cardName)) {
      for (const targetId of this._validTargets()) {
        const el = this.registry.get(targetId);
        if (el && this.isPointInRect(dropPoint, el.getBoundingClientRect())) {
          return { targetId, mode: 'commit' };
        }
      }
      return null;
    }

    // Idle phase with no selection: check default target for single-card confirm
    if (phase === 'idle' && selected.length === 0) {
      const defaultTarget = this.getDefaultTarget();
      if (defaultTarget !== null) {
        const el = this.registry.get(defaultTarget);
        if (el && this.isPointInRect(dropPoint, el.getBoundingClientRect())) {
          return { targetId: defaultTarget, mode: 'confirm' };
        }
      }
      return null;
    }

    return null;
  }

  private isPointInRect(point: { x: number; y: number }, rect: DOMRect): boolean {
    return (
      point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
    );
  }

  // ── Stack registration ──

  register(stackId: string, element: HTMLElement): void {
    this.registry.set(stackId, element);
  }

  unregister(stackId: string): void {
    this.registry.delete(stackId);

    // If the unregistered stack was the source, reset to idle
    if (this._sourceStack() === stackId) {
      this.reset();
      return;
    }

    // If the unregistered stack was a valid target, remove it
    const targets = this._validTargets();
    if (targets.includes(stackId)) {
      const updated = targets.filter((t) => t !== stackId);
      this._validTargets.set(updated);
      // If no valid targets remain and we were targeting, go back to selecting
      if (updated.length === 0 && this._phase() === 'targeting') {
        this._phase.set('selecting');
      }
    }
  }

  // ── Card selection ──

  /**
   * Called by CardStack when a card is clicked.
   *
   * - idle → selecting: set sourceStack, add card, send target query
   * - selecting + same source: toggle card in/out (up to maxSelections)
   * - selecting + different source: reset and start new selection
   * - If selection becomes empty: transition back to idle
   */
  selectCard(sourceStackId: string, cardName: string, maxSelections: number): void {
    const currentPhase = this._phase();

    if (currentPhase === 'targeting') {
      // During targeting, clicking a card in the source stack toggles selection
      if (this._sourceStack() === sourceStackId) {
        const current = this._selectedCards();
        if (current.includes(cardName)) {
          // Deselect — go back to selecting phase
          const updated = current.filter((c) => c !== cardName);
          this._selectedCards.set(updated);
          this._validTargets.set([]);
          if (updated.length === 0) {
            this._phase.set('idle');
            this._sourceStack.set(null);
            return;
          }
          this._phase.set('selecting');
          this.sendTargetQuery(sourceStackId);
          return;
        }
        // Adding a card — respect max
        if (current.length >= maxSelections) return;
        this._selectedCards.set([...current, cardName]);
        this._validTargets.set([]);
        this._phase.set('selecting');
        this.sendTargetQuery(sourceStackId);
        return;
      }
      // Different stack during targeting — cancel
      this.reset();
      this.startSelection(sourceStackId, cardName);
      return;
    }

    if (currentPhase === 'idle') {
      this.startSelection(sourceStackId, cardName);
      return;
    }

    // Phase is 'selecting'
    if (this._sourceStack() !== sourceStackId) {
      // Different source stack — reset and start new selection
      this.reset();
      this.startSelection(sourceStackId, cardName);
      return;
    }

    // Same source stack — toggle card
    const current = this._selectedCards();
    if (current.includes(cardName)) {
      // Deselect
      const updated = current.filter((c) => c !== cardName);
      this._selectedCards.set(updated);
      if (updated.length === 0) {
        this._phase.set('idle');
        this._sourceStack.set(null);
        return;
      }
    } else {
      // Select (up to max)
      if (current.length >= maxSelections) return;
      this._selectedCards.set([...current, cardName]);
    }

    // Selection changed — send new target query
    this.sendTargetQuery(sourceStackId);
  }

  /** Called by CardStack when a card is deselected. */
  deselectCard(cardName: string): void {
    if (this._phase() === 'idle') return;

    const current = this._selectedCards();
    if (!current.includes(cardName)) return;

    const updated = current.filter((c) => c !== cardName);
    this._selectedCards.set(updated);

    if (updated.length === 0) {
      this._phase.set('idle');
      this._sourceStack.set(null);
      this._validTargets.set([]);
      return;
    }

    // Selection changed — send new target query
    const source = this._sourceStack();
    if (source) {
      this.sendTargetQuery(source);
    }
  }

  // ── Double-click shortcut ──

  /**
   * Called by CardStack when a card is double-clicked.
   *
   * If getDefaultTarget returns non-null, dispatch move immediately (no phase transition).
   * If null, treat as selectCard (enter selecting phase).
   */
  confirmCard(sourceStackId: string, cardName: string): void {
    if (!this.pluginAdapter || !this.dispatcher) return;

    const defaultTarget = this.pluginAdapter.getDefaultTarget();
    if (defaultTarget !== null) {
      // Immediate dispatch — no phase transition, no server query
      const event = this.pluginAdapter.buildMoveEvent([cardName], defaultTarget);
      this.dispatcher.sendAction(event);
      this.reset();
      return;
    }

    // No default target — treat as selection
    this.selectCard(sourceStackId, cardName, 1);
  }

  // ── Target commitment ──

  /** Called by CardStack when a target stack is clicked during targeting phase. */
  commitToTarget(targetStackId: string): void {
    if (this._phase() !== 'targeting') return;

    if (this._validTargets().includes(targetStackId)) {
      this.dispatchMove(targetStackId);
    } else {
      // Invalid target — cancel
      this.reset();
    }
  }

  // ── Drag state ──

  /** Called by CardStack when a drag starts. */
  dragStarted(): void {
    this._isDragging.set(true);
  }

  /** Called by CardStack when a drag ends (drop or cancel). */
  dragEnded(): void {
    this._isDragging.set(false);
  }

  // ── Cancellation ──

  /** Cancel the current interaction and reset to idle. */
  cancel(): void {
    this.reset();
    this._liveAnnouncement.set('Interaction cancelled');
  }

  /** Reset all state to idle. */
  reset(): void {
    this._phase.set('idle');
    this._selectedCards.set([]);
    this._sourceStack.set(null);
    this._validTargets.set([]);
    this._isDragging.set(false);
    this._liveAnnouncement.set('');
  }

  // ── Target response handling ──

  /**
   * Called by GameTable when valid-targets response arrives.
   *
   * Compares generation to detect stale responses. Transitions
   * selecting → targeting if targets are non-empty.
   */
  receiveValidTargets(generation: number, targets: string[]): void {
    // Discard stale responses
    if (generation !== this.queryGeneration) return;
    // Only accept during selecting phase
    if (this._phase() !== 'selecting') return;
    // Empty targets — stay in selecting
    if (targets.length === 0) return;

    // Filter to only registered stack IDs
    const registered = targets.filter((t) => this.registry.has(t));
    if (registered.length === 0) return;

    this._validTargets.set(registered);
    this._phase.set('targeting');
    this._liveAnnouncement.set(`${registered.length} valid targets available`);
  }

  // ── Private helpers ──

  private startSelection(sourceStackId: string, cardName: string): void {
    this._phase.set('selecting');
    this._sourceStack.set(sourceStackId);
    this._selectedCards.set([cardName]);
    this._validTargets.set([]);
    this.sendTargetQuery(sourceStackId);
  }

  private sendTargetQuery(sourceStackId: string): void {
    if (!this.dispatcher) return;
    this.queryGeneration++;
    this.dispatcher.queryTargets(sourceStackId, this._selectedCards(), this.queryGeneration);
  }

  private dispatchMove(targetStackId: string): void {
    if (!this.pluginAdapter || !this.dispatcher) return;

    const event = this.pluginAdapter.buildMoveEvent(this._selectedCards(), targetStackId);
    this.dispatcher.sendAction(event);
    this.reset();
  }
}
