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
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = 'password123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        user: {
          findUnique: jest.fn(),
          findFirst: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
        session: {
          findUnique: jest.fn(),
          create: jest.fn(),
          delete: jest.fn(),
          deleteMany: jest.fn(),
        },
        $connect: jest.fn(),
        $disconnect: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/auth/register (POST) should pass validation for valid input', async () => {
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.user.create as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: testEmail,
      name: 'Test User',
    });

    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: testEmail, password: testPassword, name: 'Test User' })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.email).toBe(testEmail);
  });

  it('/auth/register (POST) should reject duplicate email', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'existing' });
    (prisma.user.create as jest.Mock).mockResolvedValue({ id: 'dummy' });

    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: testEmail, password: testPassword });

    expect(res.status).toBe(409);
  });

  it('/auth/verify-email (POST) should fail with invalid token', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token: 'invalid-token' })
      .expect(400);

    expect(res.body.message).toContain('Invalid or expired');
  });

  it('/auth/login (POST) should reject invalid credentials', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(401);
  });

  it('/auth/forgot-password (POST) should accept valid email', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: testEmail })
      .expect(200);

    expect(res.body.message).toBe('If that email exists, a reset link has been sent');
  });

  it('/auth/refresh (POST) should reject invalid refresh token', async () => {
    (prisma.session.findUnique as jest.Mock).mockResolvedValue(null);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'invalid-token' })
      .expect(401);
  });

  it('/auth/2fa/generate (POST) should reject without auth', async () => {
    await request(app.getHttpServer())
      .post('/auth/2fa/generate')
      .expect(401);
  });
});
