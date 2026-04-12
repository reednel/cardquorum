import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { RoomResponse } from '@cardquorum/shared';
import { RoomService } from '../room/room.service';
import { RoomConfigModal } from './room-config-modal';

const ROOM: RoomResponse = {
  id: 5,
  name: 'Existing Room',
  description: null,
  ownerId: 10,
  ownerDisplayName: 'Alice',
  ownerUsername: 'alice',
  visibility: 'public',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  onlineCount: 2,
  memberLimit: null,
  rosterCount: 0,
  isOnRoster: false,
  gameType: null,
  presetName: null,
  gameInProgress: false,
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RoomConfigModal],
  template: `
    <app-room-config-modal
      [room]="room"
      (updated)="updatedRoom = $event"
      (deleted)="wasDeleted = true"
      (closed)="wasClosed = true"
    />
  `,
})
class TestHost {
  room = ROOM;
  updatedRoom: RoomResponse | null = null;
  wasDeleted = false;
  wasClosed = false;
}

describe('RoomConfigModal', () => {
  let fixture: ComponentFixture<TestHost>;
  let host: TestHost;
  let el: HTMLElement;

  const mockRoomService = {
    updateRoom: jest.fn(),
    deleteRoom: jest.fn(),
  };

  beforeEach(async () => {
    HTMLDialogElement.prototype.showModal = jest.fn();
    HTMLDialogElement.prototype.close = jest.fn();
    mockRoomService.updateRoom.mockReset();
    mockRoomService.deleteRoom.mockReset();

    await TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [{ provide: RoomService, useValue: mockRoomService }],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHost);
    host = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('pre-fills form with room data', () => {
    const nameInput = el.querySelector('#config-room-name') as HTMLInputElement;
    expect(nameInput.value).toBe('Existing Room');
  });

  it('pre-fills description from room data', () => {
    host.room = { ...ROOM, description: 'Hello world' };
    fixture = TestBed.createComponent(TestHost);
    host = fixture.componentInstance;
    host.room = { ...ROOM, description: 'Hello world' };
    el = fixture.nativeElement;
    fixture.detectChanges();

    const textarea = el.querySelector(
      '[data-testid="config-room-description"]',
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe('Hello world');
  });

  it('shows description character counter', () => {
    const counter = el.querySelector('[data-testid="config-description-counter"]');
    expect(counter?.textContent?.trim()).toBe('0 / 256');
  });

  it('passes description in updateRoom call', () => {
    const updated = { ...ROOM, name: 'Existing Room', description: 'New desc' };
    mockRoomService.updateRoom.mockReturnValue(of(updated));

    const textarea = el.querySelector(
      '[data-testid="config-room-description"]',
    ) as HTMLTextAreaElement;
    textarea.value = 'New desc';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const submit = el.querySelector('button[type="submit"]') as HTMLButtonElement;
    submit.click();
    fixture.detectChanges();

    expect(mockRoomService.updateRoom).toHaveBeenCalledWith(5, {
      name: 'Existing Room',
      description: 'New desc',
    });
  });

  it('sends null description when field is empty', () => {
    const updated = { ...ROOM, description: null };
    mockRoomService.updateRoom.mockReturnValue(of(updated));

    // Make the form dirty by changing name
    const nameInput = el.querySelector('#config-room-name') as HTMLInputElement;
    nameInput.value = 'Changed';
    nameInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const submit = el.querySelector('button[type="submit"]') as HTMLButtonElement;
    submit.click();
    fixture.detectChanges();

    expect(mockRoomService.updateRoom).toHaveBeenCalledWith(5, {
      name: 'Changed',
      description: null,
    });
  });

  it('save is disabled when form is pristine', () => {
    const btn = el.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('emits updated on successful save', () => {
    const updated = { ...ROOM, name: 'Renamed' };
    mockRoomService.updateRoom.mockReturnValue(of(updated));

    const nameInput = el.querySelector('#config-room-name') as HTMLInputElement;
    nameInput.value = 'Renamed';
    nameInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const submit = el.querySelector('button[type="submit"]') as HTMLButtonElement;
    submit.click();
    fixture.detectChanges();

    expect(host.updatedRoom).toEqual(updated);
  });

  it('shows 409 error on name conflict', () => {
    mockRoomService.updateRoom.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409 })),
    );

    const nameInput = el.querySelector('#config-room-name') as HTMLInputElement;
    nameInput.value = 'Taken';
    nameInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const submit = el.querySelector('button[type="submit"]') as HTMLButtonElement;
    submit.click();
    fixture.detectChanges();

    expect(
      el.querySelector('[data-testid="error-message"]') || el.querySelector('[role="alert"]'),
    ).toBeTruthy();
  });

  it('delete flow: shows confirmation, then emits deleted', () => {
    mockRoomService.deleteRoom.mockReturnValue(of(undefined));

    const deleteBtn = el.querySelector('[data-testid="delete-room-btn"]') as HTMLButtonElement;
    deleteBtn?.click();
    fixture.detectChanges();

    const confirmBtn = el.querySelector(
      '[data-testid="confirm-delete-room-btn"]',
    ) as HTMLButtonElement;
    confirmBtn?.click();
    fixture.detectChanges();

    expect(host.wasDeleted).toBe(true);
  });

  it('prevents double-click on confirm delete', () => {
    mockRoomService.deleteRoom.mockReturnValue(of(undefined));

    const deleteBtn = el.querySelector('[data-testid="delete-room-btn"]') as HTMLButtonElement;
    deleteBtn?.click();
    fixture.detectChanges();

    const confirmBtn = el.querySelector(
      '[data-testid="confirm-delete-room-btn"]',
    ) as HTMLButtonElement;
    confirmBtn?.click();
    confirmBtn?.click();
    fixture.detectChanges();

    expect(mockRoomService.deleteRoom).toHaveBeenCalledTimes(1);
  });
});
