import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PasskeysService } from './passkeys.service';
import { CompleteRegisterDto } from './dto/register-passkey.dto';
import { StartAuthDto, CompleteAuthDto } from './dto/auth-passkey.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Passkeys')
@Controller('auth/passkeys')
export class PasskeysController {
  constructor(private readonly service: PasskeysService) {}

  @Post('register/start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start passkey registration - returns challenge + options' })
  async startRegister(
    @CurrentUser('id') userId: string,
    @CurrentUser('email') email: string,
  ) {
    return this.service.generateRegistrationOptions(userId, email);
  }

  @Post('register/complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Complete passkey registration - verify browser response' })
  async completeRegister(
    @CurrentUser('id') userId: string,
    @Body() dto: CompleteRegisterDto,
  ) {
    return this.service.verifyRegistration(userId, dto.response as any, dto.deviceName);
  }

  @Post('login/start')
  @ApiOperation({ summary: 'Start passkey authentication - returns challenge + options' })
  async startAuth(@Body() dto: StartAuthDto) {
    return this.service.generateAuthenticationOptions(dto.email);
  }

  @Post('login/complete')
  @ApiOperation({ summary: 'Complete passkey authentication - verify assertion, return JWT' })
  async completeAuth(@Body() dto: CompleteAuthDto) {
    return this.service.verifyAuthentication(dto.response as any);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List registered passkeys' })
  async list(@CurrentUser('id') userId: string) {
    return this.service.list(userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a passkey' })
  async delete(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.delete(userId, id);
  }
}
