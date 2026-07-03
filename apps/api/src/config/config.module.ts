import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { configSchema } from './config.schema';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validationSchema: configSchema,
      envFilePath: [
        resolve(__dirname, '..', '..', '..', '..', '.env'),
        resolve(__dirname, '..', '..', '..', '..', '.env.local'),
        '.env',
        '.env.local',
      ],
    }),
  ],
})
export class ConfigModule {}
