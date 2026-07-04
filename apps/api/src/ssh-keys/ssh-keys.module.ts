import { Module } from '@nestjs/common';
import { SshKeysController } from './ssh-keys.controller';
import { SshKeysService } from './ssh-keys.service';
import { SshKeysRepository } from './ssh-keys.repository';

@Module({
  controllers: [SshKeysController],
  providers: [SshKeysService, SshKeysRepository],
  exports: [SshKeysService],
})
export class SshKeysModule {}
