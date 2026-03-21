import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '../src/config/config.module'
import { PrismaModule } from './prisma/prisam.module';
import { AuthModule } from './modules/auth/auth.module';
import { StocksModule } from './modules/stocks/stocks.module';
import { UsersModule } from './modules/users/users.module';
import { MarketModule } from './modules/market/market.module';
import { ScheduleModule } from '@nestjs/schedule';
import { OrdersModule } from './modules/orders/orders.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { PositionsModule } from './modules/positions/positions.module';
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuthModule,
    StocksModule,
    UsersModule,
    MarketModule,
    ScheduleModule.forRoot(),
    OrdersModule,
    WalletModule,
    PositionsModule,

  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
