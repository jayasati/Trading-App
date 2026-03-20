import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletController } from './wallet.controller';

@Module({
  controllers: [WalletController], 
  providers: [WalletService, PrismaService],
  exports: [WalletService],
})
export class WalletModule {}
