import { IsInt, IsString, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreditDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  amount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference?: string;
}

export class DebitDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  amount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference?: string;
}
