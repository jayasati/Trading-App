// PrismaService is @Global() — NEVER re-declare it in sub-modules
import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  controllers: [WalletController],
  providers:   [WalletService],     // ← removed PrismaService (it's global)
  exports:     [WalletService],
})
export class WalletModule {}