import { Module } from '@nestjs/common';
import { MarketService } from './market.service';
import { MarketController } from './market.controller';
import { PrismaModule } from 'src/prisma/prisam.module';
import { RedisModule } from 'src/common/redis/redis.module';
import { MarketGateway } from './market.gateway';
@Module({
  imports:[
    PrismaModule,
    RedisModule,
  ],
  providers: [MarketService,MarketGateway],
  controllers: [MarketController]
})
export class MarketModule {}
