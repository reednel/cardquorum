import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { RoomResponse } from '@cardquorum/shared';
import { CreateRoomModal } from './create-room-modal';
import { RoomService } from './room.service';

const ROOM: RoomResponse = {
  id: 1,
  name: 'New Room',
  ownerId: 10,
  ownerDisplayName: 'Alice',
  visibility: 'public',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  onlineCount: 0,
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
      providers: [{ provide: RoomService, useValue: mockRoomService }],
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

    expect(el.textContent).toContain('A room with that name already exists');
  });

  it('emits closed on cancel click', () => {
    const spy = jest.fn();
    fixture.componentRef.instance.closed.subscribe(spy);

    const cancel = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cancel',
    );
    cancel?.click();
    expect(spy).toHaveBeenCalled();
  });
});
