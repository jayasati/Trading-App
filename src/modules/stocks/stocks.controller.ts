import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

import { StocksService } from './stocks.service';
import { CreateStockDto } from './dto/create-stock.dto';
import { JwtAuthGuard } from '../../common/gaurds/jwt-auth.guard';
import { RoleGaurd } from '../../common/gaurds/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator';
import { get } from 'http';

@ApiTags('Stocks')
@Controller('stocks')
export class StocksController {
    constructor(private stockService:StocksService){}

    //admin only 
    @ApiBearerAuth()
    @Roles('ADMIN')
    @UseGuards(JwtAuthGuard,RoleGaurd)
    @Post()
    createStock(@Body() dto:CreateStockDto){
        return this.stockService.create(dto);
    }

    //Public
    @Get()
    getALLStocks(){
        return this.stockService.findall();
    }

    //Search
    @Get('search')
    searchStock(@Query('q') query:string){
        return this.stockService.search(query);
    }

}
