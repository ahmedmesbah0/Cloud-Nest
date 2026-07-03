jest.mock('@otplib/totp', () => ({
  TOTP: jest.fn().mockImplementation(() => ({
    generateSecret: jest.fn().mockReturnValue('mock-secret-abc123'),
    verify: jest.fn().mockResolvedValue({ valid: true, delta: 0 }),
    toURI: jest.fn().mockReturnValue('otpauth://totp/CloudNest:user@example.com?secret=mock'),
  })),
}));

jest.mock('@otplib/plugin-crypto-noble', () => ({
  NobleCryptoPlugin: jest.fn(),
}));

jest.mock('@otplib/plugin-base32-scure', () => ({
  ScureBase32Plugin: jest.fn(),
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mockQR'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/ (GET) returns status ok', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect({ status: 'ok' });
  });
});
