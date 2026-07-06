import { IsString, MinLength, MaxLength, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateApiKeyDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ description: 'Comma-separated IP CIDR ranges' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  allowedIps?: string;

  @ApiPropertyOptional({ description: 'Notify on access from unknown IP' })
  @IsOptional()
  @IsBoolean()
  notifyForeignIp?: boolean;
}

export class UpdateApiKeyDto {
  @ApiPropertyOptional({ description: 'Comma-separated IP CIDR ranges' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  allowedIps?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notifyForeignIp?: boolean;
}
