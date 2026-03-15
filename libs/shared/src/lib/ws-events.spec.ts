import { WS_EMIT, WS_EVENT } from './ws-events';

describe('WS_EVENT constants', () => {
  it('should have stable client→server event names', () => {
    expect(WS_EVENT.ROOM_JOIN).toBe('room:join');
    expect(WS_EVENT.ROOM_LEAVE).toBe('room:leave');
    expect(WS_EVENT.CHAT_SEND).toBe('chat:send');
  });
});

describe('WS_EMIT constants', () => {
  it('should have stable server→client event names', () => {
    expect(WS_EMIT.ROOM_JOINED).toBe('room:joined');
    expect(WS_EMIT.MEMBER_JOINED).toBe('member:joined');
    expect(WS_EMIT.MEMBER_LEFT).toBe('member:left');
    expect(WS_EMIT.CHAT_MESSAGE).toBe('chat:message');
    expect(WS_EMIT.MESSAGE_HISTORY).toBe('message:history');
    expect(WS_EMIT.ERROR).toBe('error');
  });
});
