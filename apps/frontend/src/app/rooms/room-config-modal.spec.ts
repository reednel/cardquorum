import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { RoomResponse } from '@cardquorum/shared';
import { RoomConfigModal } from './room-config-modal';
import { RoomService } from './room.service';

const ROOM: RoomResponse = {
  id: 5,
  name: 'Existing Room',
  ownerId: 10,
  ownerDisplayName: 'Alice',
  visibility: 'public',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  onlineCount: 2,
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
