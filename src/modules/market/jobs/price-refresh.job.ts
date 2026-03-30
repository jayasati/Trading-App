import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { MarketDataService } from '../services/market-data.service';
import { MarketCacheService } from '../services/market-cache.service';
import { MarketBroadcastService } from '../services/market-broadcast.service';
import { isMarketOpen } from '../../../common/utils/market-hours';
import { Quote } from '../types/market.types';

@Injectable()
export class PriceRefreshJob{
    private readonly logger =new Logger(PriceRefreshJob.name);
    private isRunning =false;

    constructor(
        private prisma :PrismaService,
        private redis : RedisService,
        private marketData :MarketDataService,
        private cache :MarketCacheService,
        private broadcast :MarketBroadcastService,
    ){}

    async execute(){
        //Ensures only one execution at a time
        if(this.isRunning)return;
        this.isRunning=true;

        try{

            //Get relevant stock IDs
            const[recentIds,holdings]=await Promise.all([
                this.redis.getRecentlyViewed(),

                this.prisma.holding.findMany({
                    where :{quantity:{gt:0}},
                    select:{stockId:true},
                    distinct:['stockId'],
                }),
            ]);
            //Avoid duplicate API calls ,Optimize Performance ,Merge + deduplicate
            const ids=[...new Set([...recentIds,...holdings.map(h=>h.stockId)])];
            if(!ids.length)return;

            const marketOpen=isMarketOpen();

            const stocks=await this.prisma.stock.findMany({
                where :{id:{in:ids}, isActive:true},
            });

            const symbols=stocks.map(s=>s.yahooSymbol).filter(Boolean) as string[];
            const quotes=await this.marketData.getLiveQuotes(symbols);
            const map = new Map<string, Quote>(
                quotes.map(q => [q.yahooSymbol, q])
            );

            for(const stock of stocks ){
                let quote: Quote | null = map.get(stock.yahooSymbol!) ?? null;

                if(!quote?.price){
                    quote=await this.marketData.fetchSingleQuote(stock.yahooSymbol!);
                }
                if(!quote?.price)continue;

                await this.prisma.priceHistory.create({
                    data:{
                        stockId:stock.id,
                        price:quote.price,
                        open: quote.open,
                        high: quote.high,
                        low: quote.low,
                        close: quote.close,
                        volume: quote.volume,
                    },
                });

                await this.cache.setPrice(stock.id,quote.price,marketOpen);
                await this.cache.setQuote(stock.id,quote,marketOpen);
                this.broadcast.broadcast(stock.id,quote.price,quote);
            }
            this.logger.log(`price updated`);
        }catch(err: any){
            this.logger.error(err.message);
        }finally{
            this.isRunning=false;
        }
    }
}

