import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
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
  @ApiOperation({ summary: 'List SSH keys' })
  async list(@CurrentUser('id') userId: string) {
    return this.service.list(userId);
  }

  @Post()
  @ApiOperation({ summary: 'Add an SSH key' })
  async create(@CurrentUser('id') userId: string, @Body() dto: CreateSshKeyDto) {
    return this.service.create(userId, dto.name, dto.publicKey);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an SSH key' })
  async delete(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.delete(userId, id);
  }
}
