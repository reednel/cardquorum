import { IncomingMessage } from 'http';
import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { WsAuthGuard } from '../auth/ws-auth.guard';
import { WsConnectionService } from './ws-connection.service';

@WebSocketGateway({ path: '/ws' })
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(WsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly wsAuthGuard: WsAuthGuard,
    private readonly connectionService: WsConnectionService,
  ) {}

  async handleConnection(client: WebSocket, request: IncomingMessage) {
    const identity = await this.wsAuthGuard.authenticate(request);
    if (!identity) {
      this.logger.warn('WS connection rejected: invalid or missing token');
      client.close(4001, 'Unauthorized');
      return;
    }

    const tracked = this.connectionService.trackClient(client, identity);
    if (!tracked) {
      this.logger.warn(`WS connection rejected: too many connections for user ${identity.userId}`);
      client.close(4002, 'Too many connections');
      return;
    }
    this.logger.log(`Client connected: ${tracked.id} (user: ${identity.userId})`);
  }

  async handleDisconnect(client: WebSocket) {
    const tracked = await this.connectionService.notifyDisconnect(client);
    if (tracked) {
      this.logger.log(`Client disconnected: ${tracked.id}`);
    }
  }
}
