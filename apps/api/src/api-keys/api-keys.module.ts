import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysRepository } from './api-keys.repository';
import { ApiKeyStrategy } from './api-key.strategy';

@Module({
  imports: [PassportModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ApiKeysRepository, ApiKeyStrategy],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
