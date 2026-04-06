import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

export type PlatformChangeChannel =
  | 'agents.changed'
  | 'tasks.changed'
  | 'reviews.changed'
  | 'transactions.changed'
  | 'platform.changed';

@WebSocketGateway({
  namespace: '/updates',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class PlatformEventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(PlatformEventsGateway.name);

  handleConnection(client: Socket): void {
    this.logger.debug(`Realtime client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Realtime client disconnected: ${client.id}`);
  }

  emitChange(channel: PlatformChangeChannel): void {
    this.server?.emit(channel);
  }
}
