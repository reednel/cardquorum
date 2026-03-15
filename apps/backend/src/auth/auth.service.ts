import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { CredentialRepository, UserRepository } from '@cardquorum/db';
import { LoginRequest, LoginResponse, RegisterRequest } from '@cardquorum/shared';
import { BasicAuthStrategy } from './basic/basic-auth.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly credentialRepo: CredentialRepository,
    private readonly basicStrategy: BasicAuthStrategy,
  ) {}

  async register(dto: RegisterRequest): Promise<LoginResponse> {
    const existing = await this.userRepo.findByUsername(dto.username);
    if (existing) {
      throw new ConflictException('Username already taken');
    }

    const user = await this.userRepo.create({
      username: dto.username,
      displayName: dto.displayName,
    });

    const passwordHash = await bcrypt.hash(dto.password, 10);
    await this.credentialRepo.upsertCredential(user.id, 'basic', passwordHash);

    const token = await this.basicStrategy.createToken({
      userId: user.id,
      displayName: user.displayName,
    });

    return { token };
  }

  async login(dto: LoginRequest): Promise<LoginResponse> {
    const user = await this.userRepo.findByUsername(dto.username);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const hash = await this.credentialRepo.findCredentialByUserId(user.id, 'basic');
    if (!hash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, hash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.basicStrategy.createToken({
      userId: user.id,
      displayName: user.displayName,
    });

    return { token };
  }
}
