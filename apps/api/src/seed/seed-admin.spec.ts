const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
  role: {
    upsert: jest.fn(),
  },
  permission: {
    upsert: jest.fn(),
  },
  rolePermission: {
    upsert: jest.fn(),
  },
  userRole: {
    create: jest.fn(),
  },
  $disconnect: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

describe('seedAdmin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips creation when the admin already exists', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

    const { seedAdmin } = await import('./seed-admin');
    await seedAdmin('admin@example.com', 'StrongPassword123!');

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'admin@example.com' },
    });
    expect(mockPrisma.role.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.userRole.create).not.toHaveBeenCalled();
  });
});
