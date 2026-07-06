import { Injectable, ConflictException, NotFoundException, UnauthorizedException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { PasskeysRepository } from './passkeys.repository';

type WebAuthnModule = typeof import('@simplewebauthn/server');
type RegistrationResponseJSON = any;
type AuthenticationResponseJSON = any;

@Injectable()
export class PasskeysService implements OnModuleInit {
  private readonly rpName: string;
  private readonly rpId: string;
  private readonly origin: string;
  private webauthn!: WebAuthnModule;

  constructor(
    private readonly passkeysRepo: PasskeysRepository,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.rpName = this.configService.get<string>('TOTP_ISSUER', 'CloudNest');
    this.rpId = this.configService.get<string>('WEBAUTHN_RP_ID', 'localhost');
    this.origin = this.configService.get<string>('WEBAUTHN_ORIGIN', 'http://localhost:3000');
  }

  async onModuleInit() {
    this.webauthn = await import('@simplewebauthn/server');
  }

  async generateRegistrationOptions(userId: string, userName: string) {
    const existingKeys = await this.passkeysRepo.findByUserId(userId);
    const excludeCredentials = existingKeys.map((k: any) => ({
      id: k.credentialId,
      transports: ['internal' as const],
    }));

    const options = await this.webauthn.generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpId,
      userName,
      userDisplayName: userName,
      attestationType: 'none',
      excludeCredentials,
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { currentChallenge: options.challenge },
    });

    return options;
  }

  async verifyRegistration(userId: string, response: RegistrationResponseJSON, deviceName: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.currentChallenge) {
      throw new BadRequestException('No registration challenge found');
    }

    const verification = await this.webauthn.verifyRegistrationResponse({
      response,
      expectedChallenge: user.currentChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpId,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException('Passkey registration verification failed');
    }

    const { credential } = verification.registrationInfo;
    const credentialId = credential.id;
    const publicKey = Buffer.from(credential.publicKey);
    const counter = credential.counter;

    const existing = await this.passkeysRepo.findByCredentialId(credentialId);
    if (existing) {
      throw new ConflictException('Passkey already registered');
    }

    await this.prisma.$transaction(async (tx: any) => {
      await this.passkeysRepo.create({
        userId,
        credentialId,
        publicKey,
        counter,
        transports: response.response.transports?.join(',') ?? undefined,
        deviceName,
      });

      await this.prisma.user.update({
        where: { id: userId },
        data: { currentChallenge: null },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'passkey.register',
          resource: 'passkey',
          resourceId: userId,
        },
      });
    });

    return { success: true, deviceName };
  }

  async generateAuthenticationOptions(email?: string) {
    let allowCredentials: { id: string; transports?: string[] }[] | undefined;
    let storedUserId: string | undefined;

    if (email) {
      const user = await this.prisma.user.findUnique({ where: { email } });
      if (user) {
        storedUserId = user.id;
        const keys: any[] = await this.passkeysRepo.findByUserId(user.id);
        allowCredentials = keys.map((k: any) => ({
          id: k.credentialId,
          transports: ['internal'],
        }));
      }
    }

    const options = await this.webauthn.generateAuthenticationOptions({
      rpID: this.rpId,
      allowCredentials: allowCredentials?.length ? (allowCredentials as any) : undefined,
      userVerification: 'preferred',
    });

    const res: any = { ...options };
    if (storedUserId) {
      await this.prisma.user.update({
        where: { id: storedUserId },
        data: { currentChallenge: options.challenge },
      });
      res.userId = storedUserId;
    }
    return res;
  }

  async verifyAuthentication(response: AuthenticationResponseJSON) {
    const credentialId = response.id;
    const passkey = await this.passkeysRepo.findByCredentialId(credentialId);
    if (!passkey) {
      throw new UnauthorizedException('Passkey not found');
    }

    const user = await this.prisma.user.findUnique({ where: { id: passkey.userId } });
    if (!user || !user.currentChallenge) {
      throw new BadRequestException('No authentication challenge found');
    }

    const verification = await this.webauthn.verifyAuthenticationResponse({
      response,
      expectedChallenge: user.currentChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpId,
      credential: {
        id: passkey.credentialId,
        publicKey: passkey.publicKey,
        counter: passkey.counter,
        transports: passkey.transports?.split(',') as any,
      },
    });

    if (!verification.verified) {
      throw new UnauthorizedException('Passkey authentication failed');
    }

    await this.prisma.$transaction(async (tx: any) => {
      await this.passkeysRepo.updateCounter(passkey.id, verification.authenticationInfo.newCounter);
      await this.prisma.user.update({
        where: { id: passkey.userId },
        data: { currentChallenge: null },
      });
      await tx.auditLog.create({
        data: {
          userId: passkey.userId,
          action: 'passkey.login',
          resource: 'passkey',
          resourceId: passkey.id,
        },
      });
    });

    const accessToken = this.jwtService.sign({ sub: passkey.userId, email: user.email });
    return { accessToken };
  }

  async list(userId: string) {
    return this.passkeysRepo.findByUserId(userId);
  }

  async delete(userId: string, id: string) {
    const passkey = await this.passkeysRepo.findById(id);
    if (!passkey || passkey.userId !== userId) {
      throw new NotFoundException('Passkey not found');
    }
    await this.prisma.$transaction(async (tx: any) => {
      await this.passkeysRepo.delete(id);
      await tx.auditLog.create({
        data: {
          userId,
          action: 'passkey.delete',
          resource: 'passkey',
          resourceId: id,
        },
      });
    });
    return { success: true };
  }
}
