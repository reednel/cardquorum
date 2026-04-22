import { TestBed } from '@angular/core/testing';
import { WS_EMIT, WS_EVENT } from '@cardquorum/shared';
import { WebSocketService } from '../websocket.service';
import { GameService } from './game.service';

describe('GameService – target query', () => {
  let service: GameService;
  let wsHandlers: Record<string, ((data: unknown) => void)[]>;
  let mockWsService: { on: jest.Mock; send: jest.Mock; onConnect: jest.Mock };

  beforeEach(() => {
    wsHandlers = {};

    mockWsService = {
      on: jest.fn().mockImplementation((event: string, handler: (data: unknown) => void) => {
        if (!wsHandlers[event]) wsHandlers[event] = [];
        wsHandlers[event].push(handler);
        return () => {
          wsHandlers[event] = wsHandlers[event].filter((h) => h !== handler);
        };
      }),
      send: jest.fn(),
      onConnect: jest.fn().mockReturnValue(() => {
        /* noop */
      }),
    };

    TestBed.configureTestingModule({
      providers: [GameService, { provide: WebSocketService, useValue: mockWsService }],
    });

    service = TestBed.inject(GameService);
  });

  describe('queryTargets', () => {
    it('sends query-targets event with session ID, source stack, selected cards, and generation', () => {
      // Simulate a game session being active by triggering game:started
      const startedHandlers = wsHandlers[WS_EMIT.GAME_STARTED] ?? [];
      for (const handler of startedHandlers) {
        handler({
          sessionId: 42,
          state: { phase: 'play' },
          validActions: ['play_card'],
          colorMap: {},
        });
      }

      service.queryTargets('hand', ['qc', 'ad'], 7);

      expect(mockWsService.send).toHaveBeenCalledWith(WS_EVENT.GAME_QUERY_TARGETS, {
        sessionId: 42,
        sourceStackId: 'hand',
        selectedCards: ['qc', 'ad'],
        generation: 7,
      });
    });

    it('does not send when no active session exists', () => {
      mockWsService.send.mockClear();

      service.queryTargets('hand', ['qc'], 1);

      const targetCalls = mockWsService.send.mock.calls.filter(
        ([event]: [string]) => event === WS_EVENT.GAME_QUERY_TARGETS,
      );
      expect(targetCalls).toHaveLength(0);
    });
  });

  describe('validTargetsResponse', () => {
    it('starts as null before any server response', () => {
      expect(service.validTargetsResponse()).toBeNull();
    });

    it('updates with generation and targets when valid-targets message arrives', () => {
      const handlers = wsHandlers[WS_EMIT.GAME_VALID_TARGETS] ?? [];
      const payload = { generation: 3, targets: ['trick-pile', 'buried'] };

      for (const handler of handlers) {
        handler(payload);
      }

      expect(service.validTargetsResponse()).toEqual({
        generation: 3,
        targets: ['trick-pile', 'buried'],
      });
    });

    it('reflects the latest response when multiple messages arrive', () => {
      const handlers = wsHandlers[WS_EMIT.GAME_VALID_TARGETS] ?? [];

      for (const handler of handlers) {
        handler({ generation: 1, targets: ['trick-pile'] });
      }
      expect(service.validTargetsResponse()).toEqual({
        generation: 1,
        targets: ['trick-pile'],
      });

      for (const handler of handlers) {
        handler({ generation: 2, targets: ['buried'] });
      }
      expect(service.validTargetsResponse()).toEqual({
        generation: 2,
        targets: ['buried'],
      });
    });

    it('accepts an empty targets array', () => {
      const handlers = wsHandlers[WS_EMIT.GAME_VALID_TARGETS] ?? [];

      for (const handler of handlers) {
        handler({ generation: 5, targets: [] });
      }

      expect(service.validTargetsResponse()).toEqual({
        generation: 5,
        targets: [],
      });
    });
  });
});
