import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

function validateEnv(config: Record<string, any>) {
  const nodeEnv = (config.NODE_ENV ?? 'development').toString();

  const leverageRaw = config.INTRADAY_LEVERAGE;
  if (leverageRaw !== undefined) {
    const leverage = Number(leverageRaw);
    const isInt = Number.isInteger(leverage);
    if (!Number.isFinite(leverage) || !isInt || leverage <= 0 || leverage > 20) {
      throw new Error(
        `Invalid INTRADAY_LEVERAGE="${leverageRaw}". ` +
          `Expected an integer between 1 and 20.`,
      );
    }
  } else if (nodeEnv === 'production') {
    // In production we strongly prefer explicit config so trading behavior can't
    // silently change due to defaults.
    throw new Error(
      'INTRADAY_LEVERAGE is required in production (recommended: 5).',
    );
  }

  return config;
}

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true, //  VERY IMPORTANT
      envFilePath: '.env',
      validate: validateEnv,
    }),
  ],
})
export class ConfigModule {}
