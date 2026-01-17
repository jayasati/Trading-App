import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SignOptions } from 'jsonwebtoken';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,

    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const expiresIn =
          config.get<string>('JWT_ACCESS_EXPIRES_IN') as SignOptions['expiresIn'];
          
        return {
          secret: config.get<string>('JWT_ACCESS_SECRET')!,
          signOptions: {
            expiresIn,
          },
        };
      },
    }),

  ],
  controllers: [AuthController],
  providers: [AuthService,JwtStrategy],

})
export class AuthModule {}
