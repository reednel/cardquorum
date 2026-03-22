import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { RoomResponse } from '@cardquorum/shared';
import { ChatService } from '../chat/chat.service';
import { RoomView } from './room-view';
import { RoomService } from './room.service';

const ROOM: RoomResponse = {
  id: 42,
  name: 'Test Room',
  ownerId: 10,
  ownerDisplayName: 'Alice',
  visibility: 'public',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  onlineCount: 2,
};

describe('RoomView', () => {
  let fixture: ComponentFixture<RoomView>;
  let router: Router;

  const mockChatService = {
    messages: signal([]),
    members: signal([]),
    currentRoomId: signal(null),
    roomDeleted: signal<number | null>(null),
    joinRoom: jest.fn(),
    leaveRoom: jest.fn(),
    sendMessage: jest.fn(),
  };

  const mockRoomService = {
    getRoom: jest.fn().mockReturnValue(of(ROOM)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockChatService.roomDeleted.set(null);

    await TestBed.configureTestingModule({
      imports: [RoomView],
      providers: [
        provideRouter([{ path: 'rooms', component: RoomView }]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: new Map([['roomId', '42']]) } },
        },
        { provide: ChatService, useValue: mockChatService },
        { provide: RoomService, useValue: mockRoomService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RoomView);
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  it('joins room on init', () => {
    expect(mockChatService.joinRoom).toHaveBeenCalledWith(42);
  });

  it('fetches room details', () => {
    expect(mockRoomService.getRoom).toHaveBeenCalledWith(42);
  });

  it('displays room name in sidebar', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Test Room');
  });

  it('leaves room on destroy', () => {
    fixture.destroy();
    expect(mockChatService.leaveRoom).toHaveBeenCalled();
  });
});

describe('RoomView — invalid room', () => {
  let router: Router;

  const mockChatService = {
    messages: signal([]),
    members: signal([]),
    currentRoomId: signal(null),
    roomDeleted: signal<number | null>(null),
    joinRoom: jest.fn(),
    leaveRoom: jest.fn(),
    sendMessage: jest.fn(),
  };

  const mockRoomService = {
    getRoom: jest.fn().mockReturnValue(throwError(() => new Error('Not found'))),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [RoomView],
      providers: [
        provideRouter([{ path: 'rooms', component: RoomView }]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: new Map([['roomId', '999']]) } },
        },
        { provide: ChatService, useValue: mockChatService },
        { provide: RoomService, useValue: mockRoomService },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
  });

  it('redirects to /rooms when getRoom fails', () => {
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(RoomView);
    fixture.detectChanges();
    expect(navigateSpy).toHaveBeenCalledWith(['/rooms']);
  });
});
