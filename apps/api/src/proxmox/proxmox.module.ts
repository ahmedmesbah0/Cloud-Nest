import { Module, Global } from '@nestjs/common';
import { ProxmoxService } from './proxmox.service';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [ProxmoxService],
  exports: [ProxmoxService],
})
export class ProxmoxModule {}
