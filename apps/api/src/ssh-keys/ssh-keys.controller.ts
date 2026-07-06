import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SshKeysService } from './ssh-keys.service';
import { CreateSshKeyDto } from './dto/ssh-key.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('SSH Keys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ssh-keys')
export class SshKeysController {
  constructor(private readonly service: SshKeysService) {}

  @Get()
  @ApiOperation({ summary: 'List SSH keys (optional ?search=)' })
  async list(@CurrentUser('id') userId: string, @Query('search') search?: string) {
    return this.service.list(userId, search);
  }

  @Get('deleted')
  @ApiOperation({ summary: 'List deleted SSH keys' })
  async listDeleted(@CurrentUser('id') userId: string) {
    return this.service.listDeleted(userId);
  }

  @Post()
  @ApiOperation({ summary: 'Add an SSH key' })
  async create(@CurrentUser('id') userId: string, @Body() dto: CreateSshKeyDto) {
    return this.service.create(userId, dto.name, dto.publicKey);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete an SSH key (requires x-confirm header)' })
  async delete(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Headers('x-confirm') confirm?: string,
  ) {
    return this.service.delete(userId, id, confirm === 'true');
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore a deleted SSH key' })
  async restore(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.restore(userId, id);
  }

  @Delete(':id/hard')
  @ApiOperation({ summary: 'Permanently delete an SSH key (requires x-confirm header)' })
  async hardDelete(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Headers('x-confirm') confirm?: string,
  ) {
    return this.service.hardDelete(userId, id, confirm === 'true');
  }
}
