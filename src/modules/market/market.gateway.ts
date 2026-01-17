import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server } from 'socket.io';


    @WebSocketGateway({
    cors: {
        origin: '*',
    },
    })
    export class MarketGateway implements OnGatewayInit{
        @WebSocketServer()
        server:Server;
        afterInit() {
            console.log('📡 Market WebSocket Gateway Initialized');
    }
    broadcastPrice(stockId: string, price: number) {
        this.server.emit('price-update', {
        stockId,
        price,
        });
    }


}