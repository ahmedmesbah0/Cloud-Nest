import { IsString, IsOptional, IsArray, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOAuthClientDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiProperty()
  @IsArray()
  @IsString({ each: true })
  redirectUris!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logo?: string;
}

export class AuthorizeDto {
  @ApiProperty()
  @IsString()
  clientId!: string;

  @ApiProperty()
  @IsString()
  redirectUri!: string;

  @ApiPropertyOptional({ default: 'read' })
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  codeChallenge?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  codeChallengeMethod?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  responseType?: string;
}

export class ApproveDenyDto {
  @ApiProperty()
  @IsString()
  clientId!: string;

  @ApiProperty()
  @IsString()
  redirectUri!: string;

  @ApiProperty()
  @IsString()
  action!: 'approve' | 'deny';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  codeChallenge?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  codeChallengeMethod?: string;
}

export class TokenDto {
  @ApiProperty()
  @IsString()
  code!: string;

  @ApiProperty()
  @IsString()
  clientId!: string;

  @ApiProperty()
  @IsString()
  clientSecret!: string;

  @ApiProperty()
  @IsString()
  redirectUri!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  codeVerifier?: string;

  @ApiPropertyOptional({ default: 'authorization_code' })
  @IsOptional()
  @IsString()
  grantType?: string;
}
