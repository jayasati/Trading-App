// src/modules/positions/positions.controller.ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PositionsService } from './positions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';

@ApiTags('Positions')
@Controller('positions')
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  // GET /positions — today's intraday positions with live MTM P&L
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get()
  getPositions(@GetUser() user: any) {
    return this.positionsService.getUserPositions(user.userId);
  }
}