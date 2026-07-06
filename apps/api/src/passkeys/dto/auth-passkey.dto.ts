import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StartAuthDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;
}

export class CompleteAuthDto {
  @ApiProperty({ type: Object })
  @IsNotEmpty()
  response!: Record<string, unknown>;
}
