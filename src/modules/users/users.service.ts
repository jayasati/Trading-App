import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Role, Prisma } from 'src/generated/prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async createUser(email: string, password: string, name?: string) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          password,
          name,
          role: Role.USER,
        },
      });

      await tx.wallet.create({
        data: {
          userId: user.id,
          balance: new Prisma.Decimal(0),
          lockedBalance: new Prisma.Decimal(0),
        },
      });

      return user;
    });
  }
}
