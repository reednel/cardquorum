import { Injectable, signal } from '@angular/core';

interface WsMessage {
  event: string;
  data: unknown;
}

type Handler = (data: any) => void;

@Injectable({ providedIn: 'root' })
export class WebSocketService {
  readonly connected = signal(false);

  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();

  connect(url: string): void {
    if (this.ws) this.disconnect();

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.connected.set(true);
    };

    this.ws.onclose = () => {
      this.connected.set(false);
    };

    this.ws.onmessage = (event: MessageEvent) => {
      const msg: WsMessage = JSON.parse(event.data);
      const handlers = this.handlers.get(msg.event);
      if (handlers) {
        for (const handler of handlers) {
          handler(msg.data);
        }
      }
    };
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<T>(event: string, handler: (data: T) => void): () => void {
    let handlers = this.handlers.get(event);
    if (!handlers) {
      handlers = new Set();
      this.handlers.set(event, handlers);
    }
    handlers.add(handler);

    return () => {
      handlers!.delete(handler);
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
}
