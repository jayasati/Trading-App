import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MarketService } from './market.service';


@ApiTags('Market')
@Controller('market')
export class MarketController {
    constructor(private marketService :MarketService){}

    @Get('price/:stockId')
    getPrice(@Param('stockId') stockId:string){
        return this.marketService.getLatestPrice(stockId);
    }
}
