jest.mock('crypto', () => {
  const actual = jest.requireActual('crypto');
  return {
    ...actual,
    randomUUID: jest.fn(() => 'refresh-uuid-123'),
  };
});

import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService refresh token handling', () => {
  const usersService = {
    findByEmail: jest.fn(),
    createUser: jest.fn(),
  } as any;

  const jwtService = {
    sign: jest.fn(() => 'access.jwt'),
  } as any;

  const prisma = {
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
      delete: jest.fn(),
    },
  } as any;

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(usersService, jwtService, prisma);
  });

  it('stores refresh tokens hashed at rest', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    usersService.createUser.mockResolvedValue({ id: 'u1', email: 'a@b.com', role: 'USER' });
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt1' });

    const result = await service.signup('a@b.com', 'pw', 'A');
    expect(result.refreshToken).toBe('refresh-uuid-123');
    expect(prisma.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: expect.any(String),
        token: expect.any(String),
        expiresAt: expect.any(Date),
      }),
    });

    const storedToken = prisma.refreshToken.create.mock.calls[0][0].data.token as string;
    expect(storedToken).not.toBe('refresh-uuid-123');
    expect(storedToken).toMatch(/^[a-f0-9]{64}$/); // sha256 hex
  });

  it('refresh uses hashed lookup first (new tokens)', async () => {
    const stored = {
      id: 'rt-hash',
      token: 'hashed',
      expiresAt: new Date(Date.now() + 100000),
      user: { id: 'u1', email: 'x@y.com', role: 'USER' },
    };

    prisma.refreshToken.findUnique.mockResolvedValueOnce(stored);
    prisma.refreshToken.delete.mockResolvedValue({ id: stored.id });
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt2' });

    const out = await service.refresh('refresh-uuid-123');
    expect(out.refreshToken).toBe('refresh-uuid-123');
    expect(prisma.refreshToken.delete).toHaveBeenCalledWith({ where: { id: stored.id } });
  });

  it('refresh falls back to plaintext lookup for legacy rows', async () => {
    const legacy = {
      id: 'rt-legacy',
      token: 'refresh-uuid-123',
      expiresAt: new Date(Date.now() + 100000),
      user: { id: 'u1', email: 'x@y.com', role: 'USER' },
    };

    prisma.refreshToken.findUnique
      .mockResolvedValueOnce(null) // hashed miss
      .mockResolvedValueOnce(legacy); // plaintext hit

    prisma.refreshToken.delete.mockResolvedValue({ id: legacy.id });
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt3' });

    await service.refresh('refresh-uuid-123');
    expect(prisma.refreshToken.delete).toHaveBeenCalledWith({ where: { id: legacy.id } });
  });

  it('refresh cleans up expired tokens and throws', async () => {
    const expired = {
      id: 'rt-exp',
      token: 'whatever',
      expiresAt: new Date(Date.now() - 1000),
      user: { id: 'u1', email: 'x@y.com', role: 'USER' },
    };

    prisma.refreshToken.findUnique.mockResolvedValueOnce(expired);
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.refresh('refresh-uuid-123')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { token: { in: ['refresh-uuid-123', expect.any(String)] } },
    });
  });

  it('refresh rotates token (old record deleted)', async () => {
    const stored = {
      id: 'rt-old',
      token: 'hashed',
      expiresAt: new Date(Date.now() + 100000),
      user: { id: 'u1', email: 'x@y.com', role: 'USER' },
    };

    prisma.refreshToken.findUnique.mockResolvedValueOnce(stored);
    prisma.refreshToken.delete.mockResolvedValue({ id: stored.id });
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt-new' });

    await service.refresh('refresh-uuid-123');
    expect(prisma.refreshToken.delete).toHaveBeenCalledWith({ where: { id: 'rt-old' } });
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
  });
});

