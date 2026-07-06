import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdminService } from './admin.service';
import { AdminRepository } from './admin.repository';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AuthModule } from '../auth/auth.module';
import { ProxmoxModule } from '../proxmox/proxmox.module';
import { ResourcePoolModule } from '../resource-pool/resource-pool.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    ProxmoxModule,
    ResourcePoolModule,
    forwardRef(() => WalletModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET'),
        signOptions: { algorithm: 'HS256' },
      }),
    }),
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminRepository, AdminGuard],
  exports: [AdminService, AdminGuard],
})
export class AdminModule {}
