import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { Cron } from '@nestjs/schedule';
import { MarketGateway } from './market.gateway';

@Injectable()
export class MarketService {

    constructor(
        private readonly  prisma :PrismaService,
        private readonly  redis : RedisService,
        private readonly gateway: MarketGateway,
    ){}

    async updatePrice(stockId:string,price:number){
        await this.prisma.priceHistory.create({
            data:{
                stockId,
                price,
            },
        });
        this.gateway.broadcastPrice(stockId, price);

        await this.redis
        .getClient()
        .set(`price:${stockId}`,price.toString());
    }

    async getLatestPrice(stockId:string){
        const cached=await this.redis
        .getClient()
        .get(`price${stockId}`);

        if(cached)return Number(cached);
        const latest =await this.prisma.priceHistory.findFirst({
            where:{stockId},
            orderBy:{timestamp:'desc'},
        })

        return latest?.price;
    }

    //developmrnt only 
    @Cron('*/10 * * * * *')
    async simulateMarket() {
    const stocks = await this.prisma.stock.findMany({
        where: { isActive: true },
    });

    for (const stock of stocks) {
        const randomPrice =
        Math.random() * (500 - 100) + 100;

        await this.updatePrice(stock.id, randomPrice);
    }
    }

}
