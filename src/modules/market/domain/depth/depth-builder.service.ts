import { Injectable } from '@nestjs/common';
import { MarketDataService } from '../../services/market-data.service';
import { MarketDepthInput } from '../../../orders/matching-engine.service';


@Injectable()
export class DepthBuilderService{
    constructor(
        private marketData :MarketDataService
    ){}

    async build(symbol:string):Promise<MarketDepthInput |null>{
        const quote =await this.marketData.fetchSingleQuote(symbol);
        if(!quote)return null;

        const mid =quote.price;
        const tick =this.getTick(mid);

        const bids=Array.from({length:5},(_,i)=>({
            price:+(mid-i*tick).toFixed(2),
            quantity:1000,
        }));

        const asks=Array.from({length:5},(_,i)=>({
            price:+(mid+(i+1)*tick).toFixed(2),
            quantity:1000,
        }));
        return {bids,asks};
    }

    private getTick(price:number){
        if(price<100)return 0.1;
        return 0.5;
    }
}