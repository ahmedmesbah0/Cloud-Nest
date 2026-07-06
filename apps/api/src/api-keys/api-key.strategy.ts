import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-http-bearer';
import { ApiKeysService } from './api-keys.service';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'api-key') {
  constructor(private readonly apiKeysService: ApiKeysService) {
    super({ passReqToCallback: true });
  }

  async validate(req: any, token: string) {
    const clientIp = req?.ip || req?.socket?.remoteAddress || '0.0.0.0';
    const result = await this.apiKeysService.authenticate(token, clientIp);
    return { id: result.userId, apiKeyId: result.keyId, isApiKey: true };
  }
}
