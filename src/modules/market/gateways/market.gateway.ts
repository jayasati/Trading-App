import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { SubscribeMessage,MessageBody,ConnectedSocket } from '@nestjs/websockets';

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

  @SubscribeMessage('join-stock')
  handleJoinStock(
    @MessageBody() stockId :string,
    @ConnectedSocket() client :Socket,
  ){
    client.join(stockId);
    this.logger.log(`client ${client.id} joined stock room ${stockId}`);
  }

  @SubscribeMessage('leave-stock')
  handleLeaveStock(
    @MessageBody() stockId : string,
    @ConnectedSocket() client :Socket,
  ){
    client.leave(stockId);
    this.logger.log(`Client ${client.id} left stock room : ${stockId}`);
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
    this.server.to(stockId).emit('price-update', {
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