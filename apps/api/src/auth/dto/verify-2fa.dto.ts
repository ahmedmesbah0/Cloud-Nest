import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class Verify2faDto {
  @ApiProperty()
  @IsString()
  token!: string;
}
