import { Module } from '@nestjs/common';
import { MarketService } from './market.service';
import { MarketController } from './market.controller';
import { PrismaModule } from 'src/prisma/prisam.module';
import { RedisModule } from 'src/common/redis/redis.module';
@Module({
  imports:[
    PrismaModule,
    RedisModule,
  ],
  providers: [MarketService],
  controllers: [MarketController]
})
export class MarketModule {}
