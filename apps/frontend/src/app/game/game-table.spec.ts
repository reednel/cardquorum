import { CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GameTable } from './game-table';
import { GameTableShell } from './game-table-shell';
import { GameService } from './game.service';
import { InteractionController } from './interaction-controller';
import { SheepsheadTable } from './sheepshead/sheepshead-table';

function createMockGameService(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    state: signal(overrides['state'] ?? null),
    validActions: signal(overrides['validActions'] ?? []),
    gameType: signal(overrides['gameType'] ?? null),
    colorMap: signal(overrides['colorMap'] ?? undefined),
    validTargetsResponse: signal(overrides['validTargetsResponse'] ?? null),
    queryTargets: jest.fn(),
    sendAction: jest.fn(),
  };
}

const PLAY_STATE = {
  phase: 'play',
  players: [
    { userID: 1, role: null, hand: [{ name: 'qc' }], tricksWon: 0, pointsWon: 0, scoreDelta: null },
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
  legalCardNames: ['qc'],
  dealerUserID: null,
};

const BURY_STATE = {
  phase: 'bury',
  players: [
    {
      userID: 1,
      role: 'picker',
      hand: [{ name: 'qc' }, { name: 'ad' }],
      tricksWon: 0,
      pointsWon: 0,
      scoreDelta: null,
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
};

async function setup(gameServiceOverrides: Partial<Record<string, unknown>> = {}) {
  const mockGameService = createMockGameService(gameServiceOverrides);

  await TestBed.configureTestingModule({
    imports: [GameTable],
  })
    .overrideComponent(GameTableShell, {
      set: {
        selector: 'app-game-table-shell',
        template: '<ng-content />',
        inputs: ['plugin', 'state', 'validActions', 'myUserID', 'members', 'colorMap'],
        schemas: [CUSTOM_ELEMENTS_SCHEMA],
      },
    })
    .overrideComponent(SheepsheadTable, {
      set: {
        selector: 'app-sheepshead-table',
        template: '<div data-testid="sheepshead-table-stub"></div>',
        inputs: ['myUserID', 'members', 'isOwner', 'autostart', 'startNextGame'],
      },
    })
    .overrideProvider(GameService, { useValue: mockGameService })
    .compileComponents();

  const fixture = TestBed.createComponent(GameTable);
  fixture.componentRef.setInput('myUserID', 1);
  fixture.componentRef.setInput('members', []);
  fixture.componentRef.setInput('isOwner', false);
  fixture.componentRef.setInput('autostart', false);
  fixture.detectChanges();

  return { fixture, mockGameService };
}

describe('GameTable – component resolution', () => {
  it('renders SheepsheadTable when gameType is sheepshead', async () => {
    const { fixture } = await setup({
      gameType: 'sheepshead',
      state: PLAY_STATE,
      validActions: ['play_card'],
    });

    const sheepsheadEl = fixture.nativeElement.querySelector('app-sheepshead-table');
    expect(sheepsheadEl).toBeTruthy();
  });

  it('does not render any game table when gameType is null', async () => {
    const { fixture, mockGameService } = await setup({
      gameType: 'sheepshead',
      state: PLAY_STATE,
      validActions: ['play_card'],
    });

    mockGameService.gameType.set(null);
    fixture.detectChanges();

    const sheepsheadEl = fixture.nativeElement.querySelector('app-sheepshead-table');
    expect(sheepsheadEl).toBeNull();
  });

  it('does not render any game table when state is null', async () => {
    const { fixture } = await setup({
      gameType: 'sheepshead',
      state: null,
    });

    const sheepsheadEl = fixture.nativeElement.querySelector('app-sheepshead-table');
    expect(sheepsheadEl).toBeNull();
  });
});

describe('GameTable – InteractionController provision', () => {
  it('provides InteractionController to the component subtree', async () => {
    const { fixture } = await setup({
      gameType: 'sheepshead',
      state: PLAY_STATE,
      validActions: ['play_card'],
    });

    const ic = fixture.componentRef.injector.get(InteractionController, null);
    expect(ic).toBeTruthy();
    expect(ic).toBeInstanceOf(InteractionController);
  });

  it('InteractionController starts in idle phase', async () => {
    const { fixture } = await setup({
      gameType: 'sheepshead',
      state: PLAY_STATE,
      validActions: ['play_card'],
    });

    const ic = fixture.componentRef.injector.get(InteractionController);
    expect(ic.phase()).toBe('idle');
  });
});

describe('GameTable – InteractionController wiring', () => {
  it('confirmCard during play phase dispatches via GameService.sendAction', async () => {
    const { fixture, mockGameService } = await setup({
      gameType: 'sheepshead',
      state: PLAY_STATE,
      validActions: ['play_card'],
    });

    const ic = fixture.componentRef.injector.get(InteractionController);
    ic.confirmCard('hand', 'qc');

    expect(mockGameService.sendAction).toHaveBeenCalledTimes(1);
    const sentAction = mockGameService.sendAction.mock.calls[0][0];
    expect(sentAction.type).toBe('play_card');
  });

  it('selectCard triggers GameService.queryTargets', async () => {
    const { fixture, mockGameService } = await setup({
      gameType: 'sheepshead',
      state: BURY_STATE,
      validActions: [],
    });

    const ic = fixture.componentRef.injector.get(InteractionController);
    ic.selectCard('hand', 'qc', 2);

    expect(mockGameService.queryTargets).toHaveBeenCalledTimes(1);
    expect(mockGameService.queryTargets).toHaveBeenCalledWith('hand', ['qc'], expect.any(Number));
  });

  it('forwards validTargetsResponse to InteractionController', async () => {
    const { fixture, mockGameService } = await setup({
      gameType: 'sheepshead',
      state: BURY_STATE,
      validActions: [],
    });

    const ic = fixture.componentRef.injector.get(InteractionController);
    ic.register('buried', {} as unknown);

    ic.selectCard('hand', 'qc', 2);
    expect(ic.phase()).toBe('selecting');

    const generation = mockGameService.queryTargets.mock.calls[0][2] as number;

    mockGameService.validTargetsResponse.set({ generation, targets: ['buried'] });
    fixture.detectChanges();

    expect(ic.phase()).toBe('targeting');
    expect(ic.validTargets()).toEqual(['buried']);
  });

  it('resets InteractionController when game phase changes', async () => {
    const { fixture, mockGameService } = await setup({
      gameType: 'sheepshead',
      state: BURY_STATE,
      validActions: [],
    });

    const ic = fixture.componentRef.injector.get(InteractionController);
    ic.register('buried', {} as unknown);

    ic.selectCard('hand', 'qc', 2);
    expect(ic.phase()).toBe('selecting');

    mockGameService.state.set({ ...PLAY_STATE });
    mockGameService.validActions.set(['play_card']);
    fixture.detectChanges();

    expect(ic.phase()).toBe('idle');
    expect(ic.selectedCards()).toEqual([]);
  });
});
