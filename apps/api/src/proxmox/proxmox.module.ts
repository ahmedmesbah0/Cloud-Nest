import { Module, Global } from '@nestjs/common';
import { ProxmoxService } from './proxmox.service';

@Global()
@Module({
  providers: [ProxmoxService],
  exports: [ProxmoxService],
})
export class ProxmoxModule {}
