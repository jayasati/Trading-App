import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class MarketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MarketGateway.name);

  afterInit() {
    this.logger.log('📡 Market WebSocket Gateway Initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // ─── Broadcast price update to ALL connected clients ───
  broadcastPrice(
    stockId: string,
    price: number,
    ohlcv?: {
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    },
  ) {
    this.server.emit('price-update', {
      stockId,
      price,
      open:      ohlcv?.open,
      high:      ohlcv?.high,
      low:       ohlcv?.low,
      close:     ohlcv?.close,
      volume:    ohlcv?.volume,
      updatedAt: new Date(),
    });
  }
}