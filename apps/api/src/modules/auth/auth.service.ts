import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login({ identifier, password }: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        isActive: true,
        OR: [{ code: identifier }, { phone: identifier }, { email: identifier }],
      },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      accessToken: await this.jwt.signAsync({ sub: user.id }),
      user: {
        id: user.id,
        code: user.code,
        name: user.name,
        role: user.role,
      },
    };
  }

  static hash(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }
}
