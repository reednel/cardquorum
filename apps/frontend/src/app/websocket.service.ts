import { Injectable, signal } from '@angular/core';
import { WS_EMIT } from '@cardquorum/shared';

interface WsMessage {
  event: string;
  data: unknown;
}

type Handler = (data: unknown) => void;

@Injectable({ providedIn: 'root' })
export class WebSocketService {
  readonly connected = signal(false);

  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private authFailureHandler: (() => void) | null = null;
  private pendingMessages: { event: string; data: unknown }[] = [];
  private connectCallbacks = new Set<() => void>();

  connect(): void {
    this.intentionalClose = false;
    this.reconnectAttempts = 0;
    this.doConnect();
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.pendingMessages = [];
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected.set(false);
  }

  /** Register a handler called when WS closes with 4001 (auth failure). */
  onAuthFailure(handler: () => void): void {
    this.authFailureHandler = handler;
  }

  /** Register a callback that fires every time the WS connection opens (including reconnects). */
  onConnect(callback: () => void): () => void {
    this.connectCallbacks.add(callback);
    return () => this.connectCallbacks.delete(callback);
  }

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<T>(event: string, handler: (data: T) => void): () => void {
    let handlers = this.handlers.get(event);
    if (!handlers) {
      handlers = new Set();
      this.handlers.set(event, handlers);
    }
    handlers.add(handler as Handler);

    return () => {
      handlers!.delete(handler as Handler);
      if (handlers!.size === 0) {
        this.handlers.delete(event);
      }
    };
  }

  send(event: string, data: unknown): void {
    if (this.connected() && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, data }));
    } else {
      this.pendingMessages.push({ event, data });
    }
  }

  private doConnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${location.host}/ws`);

    this.ws.onopen = () => {
      // Transport-level connection established. Don't set connected or flush
      // the queue yet — wait for the server's ws:connected event, which confirms
      // that handleConnection (auth + tracking) has completed.
      this.reconnectAttempts = 0;
    };

    this.ws.onclose = (event: CloseEvent) => {
      this.connected.set(false);
      if (this.intentionalClose) return;

      if (event.code === 4001) {
        this.authFailureHandler?.();
        return;
      }

      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onerror is always followed by onclose, which handles reconnection
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);

        // Server signals that the connection is authenticated and tracked.
        // Now safe to flush queued messages and notify connect callbacks.
        if (msg.event === WS_EMIT.CONNECTED) {
          this.connected.set(true);
          for (const pending of this.pendingMessages) {
            this.ws!.send(JSON.stringify(pending));
          }
          this.pendingMessages = [];
          for (const cb of this.connectCallbacks) {
            cb();
          }
          return;
        }

        const handlers = this.handlers.get(msg.event);
        if (handlers) {
          for (const handler of handlers) {
            handler(msg.data);
          }
        }
      } catch {
        // Ignore malformed messages
      }
    };
  }

  private scheduleReconnect(): void {
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30_000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, delay);
  }
}
