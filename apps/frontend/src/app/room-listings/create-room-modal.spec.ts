import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { RoomResponse } from '@cardquorum/shared';
import { RoomService } from '../room/room.service';
import { CreateRoomModal } from './create-room-modal';

const ROOM: RoomResponse = {
  id: 1,
  name: 'New Room',
  description: null,
  ownerId: 10,
  ownerDisplayName: 'Alice',
  ownerUsername: 'alice',
  visibility: 'public',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  onlineCount: 0,
  memberLimit: 128,
  rosterCount: 0,
  isOnRoster: false,
  gameType: null,
  presetName: null,
  gameInProgress: false,
};

describe('CreateRoomModal', () => {
  let fixture: ComponentFixture<CreateRoomModal>;
  let el: HTMLElement;

  const mockRoomService = {
    createRoom: jest.fn(),
  };

  beforeEach(async () => {
    HTMLDialogElement.prototype.showModal = jest.fn();
    HTMLDialogElement.prototype.close = jest.fn();
    mockRoomService.createRoom.mockReset();

    await TestBed.configureTestingModule({
      imports: [CreateRoomModal],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RoomService, useValue: mockRoomService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CreateRoomModal);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('renders dialog with form fields', () => {
    expect(el.querySelector('dialog')).toBeTruthy();
    expect(el.querySelector('#room-name')).toBeTruthy();
    expect(el.querySelector('#room-visibility')).toBeTruthy();
  });

  it('submit is disabled when name is empty', () => {
    const btn = el.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('emits created on successful submit', () => {
    mockRoomService.createRoom.mockReturnValue(of(ROOM));
    const spy = jest.fn();
    fixture.componentRef.instance.created.subscribe(spy);

    fixture.componentRef.instance['form'].patchValue({ name: 'New Room' });
    fixture.detectChanges();

    fixture.componentRef.instance['onSubmit']();
    expect(spy).toHaveBeenCalledWith(ROOM);
  });

  it('shows error on 409 conflict', () => {
    mockRoomService.createRoom.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409 })),
    );

    fixture.componentRef.instance['form'].patchValue({ name: 'Taken' });
    fixture.componentRef.instance['onSubmit']();
    fixture.detectChanges();

    expect(
      el.querySelector('[role="alert"]') || el.querySelector('[data-testid="error-message"]'),
    ).toBeTruthy();
  });

  it('emits closed on cancel click', () => {
    const spy = jest.fn();
    fixture.componentRef.instance.closed.subscribe(spy);

    const cancel = el.querySelector('[data-testid="cancel-btn"]') as HTMLButtonElement;
    cancel?.click();
    expect(spy).toHaveBeenCalled();
  });

  it('shows invite search input when visibility is invite-only', () => {
    fixture.componentRef.instance['form'].patchValue({ visibility: 'invite-only' });
    fixture.detectChanges();

    expect(el.querySelector('#invite-search')).toBeTruthy();
  });

  it('does not show invite search input for public visibility', () => {
    fixture.componentRef.instance['form'].patchValue({ visibility: 'public' });
    fixture.detectChanges();

    expect(el.querySelector('#invite-search')).toBeFalsy();
  });

  it('sends invitedUserIds when creating invite-only room', () => {
    mockRoomService.createRoom.mockReturnValue(of({ ...ROOM, visibility: 'invite-only' }));

    fixture.componentRef.instance['form'].patchValue({
      name: 'Private',
      visibility: 'invite-only',
    });
    fixture.componentRef.instance['invitedUsers'].set([
      { userId: 2, username: 'bob', displayName: 'Bob' },
    ]);
    fixture.componentRef.instance['onSubmit']();

    expect(mockRoomService.createRoom).toHaveBeenCalledWith({
      name: 'Private',
      description: null,
      visibility: 'invite-only',
      invitedUserIds: [2],
      memberLimit: undefined,
    });
  });

  it('adds and removes invitees', () => {
    const instance = fixture.componentRef.instance;
    const user = { userId: 5, username: 'eve', displayName: 'Eve' };

    instance['addInvitee'](user);
    expect(instance['invitedUsers']()).toHaveLength(1);

    instance['removeInvitee'](5);
    expect(instance['invitedUsers']()).toHaveLength(0);
  });

  it('renders member limit input', () => {
    expect(el.querySelector('[data-testid="member-limit-input"]')).toBeTruthy();
  });

  it('passes memberLimit to createRoom when set', () => {
    mockRoomService.createRoom.mockReturnValue(of({ ...ROOM, memberLimit: 8 }));

    fixture.componentRef.instance['form'].patchValue({ name: 'Limited', memberLimit: 8 });
    fixture.componentRef.instance['onSubmit']();

    expect(mockRoomService.createRoom).toHaveBeenCalledWith({
      name: 'Limited',
      description: null,
      visibility: 'public',
      invitedUserIds: undefined,
      memberLimit: 8,
    });
  });

  it('omits memberLimit when not set', () => {
    mockRoomService.createRoom.mockReturnValue(of(ROOM));

    fixture.componentRef.instance['form'].patchValue({ name: 'Default Limit' });
    fixture.componentRef.instance['onSubmit']();

    expect(mockRoomService.createRoom).toHaveBeenCalledWith({
      name: 'Default Limit',
      description: null,
      visibility: 'public',
      invitedUserIds: undefined,
      memberLimit: undefined,
    });
  });

  it('renders description textarea with character counter', () => {
    expect(el.querySelector('[data-testid="room-description"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="description-counter"]')).toBeTruthy();
  });

  it('passes description in createRoom when provided', () => {
    mockRoomService.createRoom.mockReturnValue(of({ ...ROOM, description: 'A fun room' }));

    fixture.componentRef.instance['form'].patchValue({
      name: 'Described',
      description: 'A fun room',
    });
    fixture.componentRef.instance['onSubmit']();

    expect(mockRoomService.createRoom).toHaveBeenCalledWith({
      name: 'Described',
      description: 'A fun room',
      visibility: 'public',
      invitedUserIds: undefined,
      memberLimit: undefined,
    });
  });

  it('passes null description when field is empty', () => {
    mockRoomService.createRoom.mockReturnValue(of(ROOM));

    fixture.componentRef.instance['form'].patchValue({ name: 'No Desc', description: '' });
    fixture.componentRef.instance['onSubmit']();

    expect(mockRoomService.createRoom).toHaveBeenCalledWith({
      name: 'No Desc',
      description: null,
      visibility: 'public',
      invitedUserIds: undefined,
      memberLimit: undefined,
    });
  });

  it('updates character counter as description changes', () => {
    const textarea = el.querySelector('[data-testid="room-description"]') as HTMLTextAreaElement;
    textarea.value = 'Hello';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const counter = el.querySelector('[data-testid="description-counter"]') as HTMLElement;
    expect(counter.textContent).toContain('5 / 256');
  });
});
