import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { DebitDto } from './dto/wallet.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @ApiOperation({ summary: 'Get wallet with recent transactions' })
  async get(@CurrentUser('id') userId: string) {
    return this.walletService.getWallet(userId);
  }

  @Get('balance')
  @ApiOperation({ summary: 'Get wallet balance' })
  async balance(@CurrentUser('id') userId: string) {
    const balance = await this.walletService.getBalance(userId);
    return { balance };
  }

  @Get('transactions')
  @ApiOperation({ summary: 'List recent transactions' })
  async transactions(@CurrentUser('id') userId: string) {
    return this.walletService.listTransactions(userId);
  }

  @Post('debit')
  @ApiOperation({ summary: 'Deduct funds from wallet' })
  async debit(@CurrentUser('id') userId: string, @Body() dto: DebitDto) {
    return this.walletService.debit(userId, dto.amount, dto.reference);
  }
}
