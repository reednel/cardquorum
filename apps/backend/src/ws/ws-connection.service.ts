import { Injectable } from '@nestjs/common';
import { WebSocket } from 'ws';
import { UserIdentity } from '@cardquorum/shared';

export interface TrackedClient {
  id: string;
  ws: WebSocket;
  identity: UserIdentity;
}

export type DisconnectListener = (tracked: TrackedClient) => void | Promise<void>;

export const MAX_CONNECTIONS_PER_USER = 5;

@Injectable()
export class WsConnectionService {
  private clients = new Map<WebSocket, TrackedClient>();
  private clientsById = new Map<string, TrackedClient>();
  private disconnectListeners: DisconnectListener[] = [];
  private nextId = 1;

  onDisconnect(listener: DisconnectListener): void {
    this.disconnectListeners.push(listener);
  }

  async notifyDisconnect(ws: WebSocket): Promise<TrackedClient | undefined> {
    const tracked = this.clients.get(ws);
    if (!tracked) return undefined;

    for (const listener of this.disconnectListeners) {
      await listener(tracked);
    }

    this.clients.delete(ws);
    this.clientsById.delete(tracked.id);
    return tracked;
  }

  trackClient(ws: WebSocket, identity: UserIdentity): TrackedClient | null {
    const existing = this.getClientsByUserId(identity.userId);
    if (existing.length >= MAX_CONNECTIONS_PER_USER) {
      return null;
    }

    const id = `conn-${this.nextId++}`;
    const tracked: TrackedClient = { id, ws, identity };
    this.clients.set(ws, tracked);
    this.clientsById.set(id, tracked);
    return tracked;
  }

  untrackClient(ws: WebSocket): TrackedClient | undefined {
    const tracked = this.clients.get(ws);
    if (tracked) {
      this.clients.delete(ws);
      this.clientsById.delete(tracked.id);
    }
    return tracked;
  }

  getTracked(ws: WebSocket): TrackedClient | undefined {
    return this.clients.get(ws);
  }

  getTrackedById(id: string): TrackedClient | undefined {
    return this.clientsById.get(id);
  }

  getClientsByUserId(userId: number): TrackedClient[] {
    const result: TrackedClient[] = [];
    for (const tracked of this.clients.values()) {
      if (tracked.identity.userId === userId) {
        result.push(tracked);
      }
    }
    return result;
  }

  getAllClients(): IterableIterator<TrackedClient> {
    return this.clients.values();
  }
}
