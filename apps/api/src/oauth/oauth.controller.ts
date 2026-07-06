import { Controller, Get, Post, Delete, Param, Body, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OAuthService } from './oauth.service';
import { CreateOAuthClientDto, ApproveDenyDto, TokenDto } from './dto/oauth.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('OAuth2')
@Controller('oauth')
export class OAuthController {
  constructor(private readonly service: OAuthService) {}

  // ── Client management ────────────────────────────────────────────

  @Post('clients')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register a new OAuth application' })
  async registerClient(@CurrentUser('id') userId: string, @Body() dto: CreateOAuthClientDto) {
    return this.service.registerClient(userId, dto.name, dto.redirectUris, dto.logo);
  }

  @Get('clients')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List registered OAuth applications' })
  async listClients(@CurrentUser('id') userId: string) {
    return this.service.listClients(userId);
  }

  @Delete('clients/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete an OAuth application' })
  async deleteClient(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.deleteClient(userId, id);
  }

  // ── Authorization ────────────────────────────────────────────────

  @Get('authorize')
  @ApiOperation({ summary: 'OAuth authorization request — returns consent info' })
  async authorize(
    @Query('client_id') clientId: string,
    @Query('redirect_uri') redirectUri: string,
    @Query('scope') scope?: string,
    @Query('state') state?: string,
    @Query('code_challenge') codeChallenge?: string,
    @Query('code_challenge_method') codeChallengeMethod?: string,
  ) {
    return this.service.authorize(clientId, redirectUri, scope ?? 'read', state ?? null, codeChallenge ?? null, codeChallengeMethod ?? null);
  }

  @Post('consent')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve or deny OAuth consent' })
  async consent(@CurrentUser('id') userId: string, @Body() dto: ApproveDenyDto) {
    if (dto.action === 'deny') {
      return this.service.denyConsent(dto.clientId, dto.redirectUri, dto.state ?? null);
    }
    return this.service.approveConsent(
      userId,
      dto.clientId,
      dto.redirectUri,
      dto.scope ?? 'read',
      dto.state ?? null,
      dto.codeChallenge ?? null,
      dto.codeChallengeMethod ?? null,
    );
  }

  // ── Token ────────────────────────────────────────────────────────

  @Post('token')
  @ApiOperation({ summary: 'Exchange authorization code for access token' })
  async token(@Body() dto: TokenDto) {
    return this.service.token(dto.code, dto.clientId, dto.clientSecret, dto.redirectUri, dto.codeVerifier);
  }
}
