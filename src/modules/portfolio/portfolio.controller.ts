import {
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/gaurds/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';

@ApiTags('Portfolio')
@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly prisma: PrismaService) {}

  // 🔐 Protected route
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get()
  async getPortfolio(@GetUser() user: any) {
    return this.prisma.holding.findMany({
      where: { userId: user.userId },
      include: {
        stock: true,
      },
    });
  }
}