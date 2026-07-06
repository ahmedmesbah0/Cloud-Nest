import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CompleteRegisterDto {
  @ApiProperty({ type: Object })
  @IsNotEmpty()
  response!: Record<string, unknown>;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  deviceName!: string;
}
