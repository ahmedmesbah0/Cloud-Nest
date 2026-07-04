import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/prisma/prisma.service';
import * as argon2 from 'argon2';
import { TOTP } from '@otplib/totp';
import { NobleCryptoPlugin } from '@otplib/plugin-crypto-noble';
import { ScureBase32Plugin } from '@otplib/plugin-base32-scure';
import * as qrcode from 'qrcode';
import { randomBytes, createHash } from 'node:crypto';

import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Enable2faDto } from './dto/enable-2fa.dto';
import { Verify2faDto } from './dto/verify-2fa.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const totp = new TOTP({ crypto: new NobleCryptoPlugin(), base32: new ScureBase32Plugin() });

@Injectable()
export class AuthService {
  private readonly totpIssuer: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {
    this.totpIssuer = this.configService.get<string>('TOTP_ISSUER', 'CloudNest');
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await argon2.hash(dto.password);

    const adminRole = await this.prisma.role.upsert({
      where: { name: 'admin' },
      update: {},
      create: { name: 'admin', description: 'Administrator with full access' },
    });

    const customerRole = await this.prisma.role.upsert({
      where: { name: 'customer' },
      update: {},
      create: { name: 'customer', description: 'Standard customer' },
    });

    const { user, isFirstUser } = await this.prisma.$transaction(async (tx) => {
      const userCount = await tx.user.count();
      const isFirstUser = userCount === 0;

      const u = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          name: dto.name,
          emailVerified: isFirstUser,
        },
      });

      await tx.userRole.create({
        data: { userId: u.id, roleId: customerRole.id },
      });

      if (isFirstUser) {
        await tx.userRole.create({
          data: { userId: u.id, roleId: adminRole.id },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: u.id,
          action: 'register',
          resource: 'user',
          resourceId: u.id,
        },
      });

      return { user: u, isFirstUser };
    });

    if (isFirstUser) {
      console.log(`First user registered as admin: ${user.email}`);
      // First user (admin) doesn't need email verification
      await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      });
    } else {
      const emailVerifyToken = randomBytes(32).toString('hex');
      await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerifyToken },
      });

      const verifyUrl = `${this.configService.get<string>('NEXT_PUBLIC_API_URL', 'http://localhost:3000')}/auth/verify-email?token=${emailVerifyToken}`;
      await this.mailService.send({
        to: dto.email,
        subject: 'Verify your email',
        text: `Click here to verify your email: ${verifyUrl}`,
        html: `<p>Click <a href="${verifyUrl}">here</a> to verify your email.</p>`,
      });
    }

    return { id: user.id, email: user.email, name: user.name, isAdmin: isFirstUser };
  }

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findFirst({
      where: { emailVerifyToken: token, emailVerified: false },
    });
    if (!user) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { emailVerified: true, emailVerifyToken: null },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'verify-email',
          resource: 'user',
          resourceId: user.id,
        },
      });
    });

    return { message: 'Email verified successfully' };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.emailVerified) {
      throw new UnauthorizedException('Email not verified');
    }

    if (user.totpEnabled) {
      return { requires2fa: true, userId: user.id };
    }

    return this.generateTokens(user.id, user.email);
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
        totpEnabled: true,
        roles: {
          select: { role: { select: { name: true } } },
        },
      },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  async verify2fa(userId: string, dto: Verify2faDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.totpEnabled || !user.totpSecret) {
      throw new UnauthorizedException('2FA not enabled');
    }

    const result = await totp.verify(dto.token, { secret: user.totpSecret });
    if (!result.valid) {
      throw new UnauthorizedException('Invalid 2FA token');
    }

    return this.generateTokens(user.id, user.email);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async refreshToken(refreshToken: string) {
    const hashed = this.hashToken(refreshToken);
    const session = await this.prisma.session.findUnique({
      where: { refreshToken: hashed },
    });
    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    await this.prisma.session.delete({ where: { id: session.id } });

    return this.generateTokens(user.id, user.email);
  }

  async logout(refreshToken: string) {
    const hashed = this.hashToken(refreshToken);
    const sessions = await this.prisma.session.findMany({
      where: { refreshToken: hashed },
      select: { userId: true },
    });
    const userId = sessions.length > 0 ? sessions[0].userId : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.session.deleteMany({
        where: { refreshToken: hashed },
      });
      if (userId) {
        await tx.auditLog.create({
          data: {
            userId,
            action: 'logout',
            resource: 'session',
            resourceId: hashed,
          },
        });
      }
    });
    return { message: 'Logged out successfully' };
  }

  async generate2faSecret(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (user.totpEnabled) {
      throw new BadRequestException('2FA already enabled');
    }

    const secret = totp.generateSecret();
    const otpauthUrl = totp.toURI({ issuer: this.totpIssuer, label: user.email, secret });

    const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);

    return { secret, qrCode: qrCodeDataUrl, otpauthUrl };
  }

  async enable2fa(userId: string, dto: Enable2faDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const secret = dto.token;
    const isValid = (await totp.verify(dto.token, { secret })).valid;
    if (!isValid) {
      throw new BadRequestException('Invalid TOTP token, please try again');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { totpSecret: secret, totpEnabled: true },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'enable-2fa',
          resource: 'user',
          resourceId: userId,
        },
      });
    });

    return { message: '2FA enabled successfully' };
  }

  async disable2fa(userId: string, dto: Verify2faDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.totpEnabled || !user.totpSecret) {
      throw new BadRequestException('2FA not enabled');
    }

    const result = await totp.verify(dto.token, { secret: user.totpSecret });
    if (!result.valid) {
      throw new BadRequestException('Invalid TOTP token');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { totpSecret: null, totpEnabled: false },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'disable-2fa',
          resource: 'user',
          resourceId: userId,
        },
      });
    });

    return { message: '2FA disabled successfully' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      return { message: 'If that email exists, a reset link has been sent' };
    }

    const resetToken = randomBytes(32).toString('hex');
    const resetTokenHash = createHash('sha256').update(resetToken).digest('hex');

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          emailVerifyToken: resetTokenHash,
          updatedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'forgot-password',
          resource: 'user',
          resourceId: user.id,
        },
      });
    });

    const resetUrl = `${this.configService.get<string>('NEXT_PUBLIC_API_URL', 'http://localhost:3000')}/auth/reset-password?token=${resetToken}`;
    await this.mailService.send({
      to: dto.email,
      subject: 'Password reset',
      text: `Click here to reset your password: ${resetUrl}`,
      html: `<p>Click <a href="${resetUrl}">here</a> to reset your password.</p>`,
    });

    return { message: 'If that email exists, a reset link has been sent' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const resetTokenHash = createHash('sha256').update(dto.token).digest('hex');

    const user = await this.prisma.user.findFirst({
      where: { emailVerifyToken: resetTokenHash },
    });
    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await argon2.hash(dto.password);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          emailVerifyToken: null,
          updatedAt: new Date(),
        },
      });
      await tx.session.deleteMany({
        where: { userId: user.id },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'reset-password',
          resource: 'user',
          resourceId: user.id,
        },
      });
    });

    return { message: 'Password reset successfully' };
  }

  private async generateTokens(userId: string, email: string) {
    const accessToken = this.jwtService.sign(
      { sub: userId, email },
    );

    const rawRefreshToken = randomBytes(48).toString('hex');
    const refreshExpiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRY', '7d');

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + this.parseExpiry(refreshExpiresIn));

    const hashedRefreshToken = this.hashToken(rawRefreshToken);
    await this.prisma.session.create({
      data: {
        userId,
        refreshToken: hashedRefreshToken,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresAt,
    };
  }

  private parseExpiry(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 7 * 24 * 60 * 60;
    const value = parseInt(match[1], 10);
    switch (match[2]) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: return 7 * 24 * 60 * 60;
    }
  }
}
