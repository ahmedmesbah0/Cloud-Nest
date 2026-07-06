import { Module } from '@nestjs/common';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';
import { OAuthRepository } from './oauth.repository';

@Module({
  controllers: [OAuthController],
  providers: [OAuthService, OAuthRepository],
  exports: [OAuthService],
})
export class OAuthModule {}
