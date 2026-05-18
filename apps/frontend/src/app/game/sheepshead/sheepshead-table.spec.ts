import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CardStack } from '../card-stack';
import { GameSummaryShell } from '../game-summary-shell';
import { InteractionController } from '../interaction-controller';
import { SheepsheadTable } from './sheepshead-table';

// ── Mock factories ──

function createMockStartNextGame() {
  return { emit: jest.fn() } as any;
}

// ── State factories ──

function makeState(phase: string, extras: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    phase,
    players: [
      {
        userID: 1,
        role: null,
        hand: [{ name: 'qc' }, { name: 'ad' }],
        tricksWon: 0,
        pointsWon: 0,
        scoreDelta: null,
        cardsWon: [],
      },
    ],
    activePlayer: 1,
    tricks: [],
    trickNumber: 0,
    blind: null,
    buried: null,
    calledCard: null,
    hole: null,
    crack: null,
    blitz: null,
    previousGameDouble: null,
    noPick: null,
    redeals: null,
    legalCardNames: null,
    dealerUserID: null,
    ...extras,
  };
}

const DEAL_STATE = makeState('deal');
const PICK_STATE = makeState('pick', { blind: [{ name: 'x1' }, { name: 'x2' }] });
const BURY_STATE = makeState('bury', {
  players: [
    {
      userID: 1,
      role: 'picker',
      hand: [{ name: 'qc' }, { name: 'ad' }, { name: 'jd' }, { name: 'jh' }],
      tricksWon: 0,
      pointsWon: 0,
      scoreDelta: null,
      cardsWon: [],
    },
  ],
});
const CALL_STATE = makeState('call');
const PLAY_STATE = makeState('play', {
  legalCardNames: ['qc'],
  tricks: [{ plays: [{ player: 2, card: { name: 'ah' } }], winner: null }],
});

// ── Test setup ──

async function setup(
  overrides: {
    state?: unknown;
    validActions?: string[];
    config?: unknown;
    colorMap?: Record<number, number>;
    actionDispatcher?: ((event: { type: string; payload?: unknown }) => void) | null;
  } = {},
) {
  const ic = new InteractionController();

  await TestBed.configureTestingModule({
    imports: [SheepsheadTable],
  })
    .overrideComponent(CardStack, {
      set: {
        selector: 'app-card-stack',
        template: '<div data-testid="stub-card-stack"></div>',
        inputs: [
          'stackId',
          'cards',
          'spread',
          'spreadAngle',
          'cardWidth',
          'cardHeight',
          'selectable',
          'maxSelections',
          'legalCards',
          'reorderable',
          'draggable',
          'droppable',
          'autoScale',
          'biasedPlacement',
          'colorMap',
          'playerIds',
          'topOnly',
        ],
        outputs: ['cardsReordered', 'cardSelected', 'cardConfirmed', 'selectedCards'],
      },
    })
    .overrideComponent(GameSummaryShell, {
      set: {
        selector: 'app-game-summary-shell',
        template: '<div #dialogEl data-testid="stub-game-summary-shell"></div>',
        inputs: ['mode', 'summaryComponent', 'store', 'participants', 'isOwner', 'canStartNext'],
        outputs: ['dismissed', 'startNextGame'],
      },
    })
    .overrideProvider(InteractionController, { useValue: ic })
    .compileComponents();

  const fixture = TestBed.createComponent(SheepsheadTable);
  fixture.componentRef.setInput('state', overrides.state ?? null);
  fixture.componentRef.setInput('validActions', overrides.validActions ?? []);
  fixture.componentRef.setInput('config', overrides.config ?? null);
  fixture.componentRef.setInput('colorMap', overrides.colorMap ?? undefined);
  fixture.componentRef.setInput('actionDispatcher', overrides.actionDispatcher ?? null);
  fixture.componentRef.setInput('myUserID', 1);
  fixture.componentRef.setInput('members', []);
  fixture.componentRef.setInput('isOwner', false);
  fixture.componentRef.setInput('autostart', false);
  fixture.componentRef.setInput('canStartNext', false);
  fixture.componentRef.setInput('startNextGame', createMockStartNextGame());
  fixture.detectChanges();

  return { fixture, ic };
}

function getCardStacks(fixture: ComponentFixture<SheepsheadTable>): HTMLElement[] {
  return Array.from(fixture.nativeElement.querySelectorAll('app-card-stack'));
}

function getStackIds(fixture: ComponentFixture<SheepsheadTable>): (string | null)[] {
  return getCardStacks(fixture).map((el: HTMLElement) => el.getAttribute('stackid'));
}

// ── Tests ──

describe('SheepsheadTable – stack ID assignments', () => {
  it('assigns stackId "hand" to the player hand CardStack', async () => {
    const { fixture } = await setup({ state: PLAY_STATE, validActions: ['play_card'] });
    const ids = getStackIds(fixture);
    expect(ids).toContain('hand');
  });

  it('assigns stackId "trick-pile" to the trick area during play phase', async () => {
    const { fixture } = await setup({ state: PLAY_STATE, validActions: ['play_card'] });
    const ids = getStackIds(fixture);
    expect(ids).toContain('trick-pile');
  });

  it('assigns stackId "buried" to the bury target during bury phase', async () => {
    const { fixture } = await setup({ state: BURY_STATE, validActions: ['bury'] });
    const ids = getStackIds(fixture);
    expect(ids).toContain('buried');
  });

  it('does not render trick-pile stack during deal phase', async () => {
    const { fixture } = await setup({ state: DEAL_STATE, validActions: ['deal'] });
    const ids = getStackIds(fixture);
    expect(ids).not.toContain('trick-pile');
  });

  it('does not render buried stack during play phase', async () => {
    const { fixture } = await setup({ state: PLAY_STATE, validActions: ['play_card'] });
    const ids = getStackIds(fixture);
    expect(ids).not.toContain('buried');
  });
});

describe('SheepsheadTable – phase rendering', () => {
  it('renders deal button when deal action is available', async () => {
    const { fixture } = await setup({ state: DEAL_STATE, validActions: ['deal'] });
    expect(fixture.nativeElement.querySelector('[data-testid="deal-btn"]')).toBeTruthy();
  });

  it('renders deal waiting message when deal action is not available', async () => {
    const { fixture } = await setup({ state: DEAL_STATE, validActions: [] });
    expect(fixture.nativeElement.querySelector('[data-testid="deal-waiting"]')).toBeTruthy();
  });

  it('renders pick and pass buttons during pick phase', async () => {
    const { fixture } = await setup({ state: PICK_STATE, validActions: ['pick', 'pass'] });
    expect(fixture.nativeElement.querySelector('[data-testid="pick-btn"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="pass-btn"]')).toBeTruthy();
  });

  it('renders pick waiting message when no pick actions available', async () => {
    const { fixture } = await setup({ state: PICK_STATE, validActions: [] });
    expect(fixture.nativeElement.querySelector('[data-testid="pick-waiting"]')).toBeTruthy();
  });

  it('renders buried CardStack during bury phase with bury action', async () => {
    const { fixture } = await setup({ state: BURY_STATE, validActions: ['bury'] });
    const ids = getStackIds(fixture);
    expect(ids).toContain('buried');
  });

  it('renders bury waiting message when bury action is not available', async () => {
    const { fixture } = await setup({ state: BURY_STATE, validActions: [] });
    expect(fixture.nativeElement.querySelector('[data-testid="bury-waiting"]')).toBeTruthy();
  });

  it('renders call options during call phase', async () => {
    const { fixture } = await setup({ state: CALL_STATE, validActions: ['call_ace'] });
    expect(fixture.nativeElement.querySelector('[data-testid="call-options"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="call-btn-ac"]')).toBeTruthy();
  });

  it('renders call waiting message when call action is not available', async () => {
    const { fixture } = await setup({ state: CALL_STATE, validActions: [] });
    expect(fixture.nativeElement.querySelector('[data-testid="call-waiting"]')).toBeTruthy();
  });

  it('renders trick-pile CardStack during play phase', async () => {
    const { fixture } = await setup({ state: PLAY_STATE, validActions: ['play_card'] });
    const ids = getStackIds(fixture);
    expect(ids).toContain('trick-pile');
  });
});

describe('SheepsheadTable – bury flow uses InteractionController', () => {
  it('does not render a separate bury confirmation button', async () => {
    const { fixture } = await setup({ state: BURY_STATE, validActions: ['bury'] });
    const buryBtn = fixture.nativeElement.querySelector('[data-testid="bury-btn"]');
    expect(buryBtn).toBeNull();
  });

  it('renders a droppable buried CardStack for the interaction target', async () => {
    const { fixture } = await setup({ state: BURY_STATE, validActions: ['bury'] });
    const buriedDE = fixture.debugElement.query(
      (de) =>
        de.nativeElement.tagName === 'APP-CARD-STACK' &&
        de.nativeElement.getAttribute('stackid') === 'buried',
    );
    expect(buriedDE).toBeTruthy();
    expect(buriedDE.componentInstance.droppable()).toBe(true);
  });

  it('enables dragging on the hand CardStack during bury phase', async () => {
    const { fixture } = await setup({ state: BURY_STATE, validActions: ['bury'] });
    const handDE = fixture.debugElement.query(
      (de) =>
        de.nativeElement.tagName === 'APP-CARD-STACK' &&
        de.nativeElement.getAttribute('stackid') === 'hand',
    );
    expect(handDE).toBeTruthy();
    expect(handDE.componentInstance.draggable()).toBe(true);
  });

  it('sets maxSelections on hand to bury count during bury phase', async () => {
    const { fixture } = await setup({ state: BURY_STATE, validActions: ['bury'] });
    const handDE = fixture.debugElement.query(
      (de) =>
        de.nativeElement.tagName === 'APP-CARD-STACK' &&
        de.nativeElement.getAttribute('stackid') === 'hand',
    );
    expect(handDE).toBeTruthy();
    expect(handDE.componentInstance.maxSelections()).toBe(2);
  });

  it('injects InteractionController from the provider', async () => {
    const { ic } = await setup({ state: BURY_STATE, validActions: ['bury'] });
    expect(ic).toBeTruthy();
    expect(ic).toBeInstanceOf(InteractionController);
  });
});

describe('SheepsheadTable – corner actions', () => {
  it('renders crack button when crack action is available', async () => {
    const { fixture } = await setup({ state: PLAY_STATE, validActions: ['play_card', 'crack'] });
    expect(fixture.nativeElement.querySelector('[data-testid="crack-btn"]')).toBeTruthy();
  });

  it('hides corner actions after dismiss', async () => {
    const { fixture } = await setup({ state: PLAY_STATE, validActions: ['play_card', 'crack'] });
    const dismissBtn = fixture.nativeElement.querySelector(
      '[data-testid="dismiss-btn"]',
    ) as HTMLButtonElement;
    expect(dismissBtn).toBeTruthy();
    dismissBtn.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="corner-actions"]')).toBeNull();
  });
});

describe('SheepsheadTable – action dispatching', () => {
  it('calls actionDispatcher when an action button is clicked', async () => {
    const dispatcher = jest.fn();
    const { fixture } = await setup({
      state: DEAL_STATE,
      validActions: ['deal'],
      actionDispatcher: dispatcher,
    });
    const dealBtn = fixture.nativeElement.querySelector(
      '[data-testid="deal-btn"]',
    ) as HTMLButtonElement;
    dealBtn.click();
    expect(dispatcher).toHaveBeenCalledWith({ type: 'deal' });
  });

  it('does not throw when actionDispatcher is null and action is triggered', async () => {
    const { fixture } = await setup({
      state: DEAL_STATE,
      validActions: ['deal'],
      actionDispatcher: null,
    });
    const dealBtn = fixture.nativeElement.querySelector(
      '[data-testid="deal-btn"]',
    ) as HTMLButtonElement;
    expect(() => dealBtn.click()).not.toThrow();
  });
});

// ── Score state factory ──

const SCORE_STATE = makeState('score', {
  players: [
    {
      userID: 1,
      role: 'picker',
      hand: [],
      tricksWon: 3,
      pointsWon: 60,
      scoreDelta: 2,
      cardsWon: [],
    },
  ],
});

describe('SheepsheadTable – end-of-game summary overlay', () => {
  it('renders GameSummaryShell when game enters score phase with plugin component', async () => {
    const { fixture } = await setup({
      state: SCORE_STATE,
      validActions: [],
      actionDispatcher: jest.fn(),
    });
    fixture.detectChanges();

    const shell = fixture.nativeElement.querySelector('app-game-summary-shell');
    expect(shell).toBeTruthy();
  });

  it('does not render GameSummaryShell when autostart is enabled', async () => {
    const fixture = await setupWithAutostart(SCORE_STATE, true);
    fixture.detectChanges();

    const shell = fixture.nativeElement.querySelector('app-game-summary-shell');
    expect(shell).toBeNull();
  });

  it('resets dismissed state when phase changes away from score and back', async () => {
    const { fixture } = await setup({
      state: SCORE_STATE,
      validActions: [],
      actionDispatcher: jest.fn(),
    });
    fixture.detectChanges();

    // Overlay should be visible
    expect(fixture.nativeElement.querySelector('app-game-summary-shell')).toBeTruthy();

    // Dismiss the overlay
    const component = fixture.componentInstance;
    (component as any).onScoreDismissed();
    fixture.detectChanges();

    // Overlay should be hidden after dismiss
    expect(fixture.nativeElement.querySelector('app-game-summary-shell')).toBeNull();

    // Phase changes away from score (new game starts)
    fixture.componentRef.setInput('state', DEAL_STATE);
    fixture.detectChanges();

    // Phase returns to score (next game ends)
    fixture.componentRef.setInput('state', SCORE_STATE);
    fixture.detectChanges();

    // Overlay should be visible again (dismissed state was reset)
    expect(fixture.nativeElement.querySelector('app-game-summary-shell')).toBeTruthy();
  });
});

// ── Helper for autostart tests ──

async function setupWithAutostart(
  state: unknown,
  autostart: boolean,
): Promise<ComponentFixture<SheepsheadTable>> {
  const ic = new InteractionController();

  await TestBed.configureTestingModule({
    imports: [SheepsheadTable],
  })
    .overrideComponent(CardStack, {
      set: {
        selector: 'app-card-stack',
        template: '<div data-testid="stub-card-stack"></div>',
        inputs: [
          'stackId',
          'cards',
          'spread',
          'spreadAngle',
          'cardWidth',
          'cardHeight',
          'selectable',
          'maxSelections',
          'legalCards',
          'reorderable',
          'draggable',
          'droppable',
          'autoScale',
          'biasedPlacement',
          'colorMap',
          'playerIds',
          'topOnly',
        ],
        outputs: ['cardsReordered', 'cardSelected', 'cardConfirmed', 'selectedCards'],
      },
    })
    .overrideComponent(GameSummaryShell, {
      set: {
        selector: 'app-game-summary-shell',
        template: '<div #dialogEl data-testid="stub-game-summary-shell"></div>',
        inputs: ['mode', 'summaryComponent', 'store', 'participants', 'isOwner', 'canStartNext'],
        outputs: ['dismissed', 'startNextGame'],
      },
    })
    .overrideProvider(InteractionController, { useValue: ic })
    .compileComponents();

  const fixture = TestBed.createComponent(SheepsheadTable);
  fixture.componentRef.setInput('state', state);
  fixture.componentRef.setInput('validActions', []);
  fixture.componentRef.setInput('config', null);
  fixture.componentRef.setInput('colorMap', undefined);
  fixture.componentRef.setInput('actionDispatcher', null);
  fixture.componentRef.setInput('myUserID', 1);
  fixture.componentRef.setInput('members', []);
  fixture.componentRef.setInput('isOwner', false);
  fixture.componentRef.setInput('autostart', autostart);
  fixture.componentRef.setInput('canStartNext', false);
  fixture.componentRef.setInput('startNextGame', createMockStartNextGame());
  fixture.detectChanges();

  return fixture;
}
