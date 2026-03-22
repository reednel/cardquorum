import { Injectable, signal } from '@angular/core';

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

  connect(): void {
    this.intentionalClose = false;
    this.reconnectAttempts = 0;
    this.doConnect();
  }

  disconnect(): void {
    this.intentionalClose = true;
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
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, data }));
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
      this.connected.set(true);
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
