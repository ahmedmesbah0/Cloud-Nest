import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PasskeysController } from './passkeys.controller';
import { PasskeysService } from './passkeys.service';
import { PasskeysRepository } from './passkeys.repository';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_ACCESS_EXPIRY', '15m') as any,
        },
      }),
    }),
  ],
  controllers: [PasskeysController],
  providers: [PasskeysService, PasskeysRepository],
})
export class PasskeysModule {}
