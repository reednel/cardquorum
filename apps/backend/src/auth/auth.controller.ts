import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Inject,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AUTH_STRATEGY_TOKEN, AuthStrategyService } from './auth-strategy.interface';
import { LoginRequest, RegisterRequest } from '@cardquorum/shared';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(AUTH_STRATEGY_TOKEN)
    private readonly strategy: AuthStrategyService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterRequest) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginRequest) {
    return this.authService.login(dto);
  }

  @Get('me')
  async me(@Headers('authorization') authHeader?: string) {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing token');
    }

    const token = authHeader.slice(7);
    const identity = await this.strategy.validateToken(token);
    if (!identity) {
      throw new UnauthorizedException('Invalid token');
    }

    return identity;
  }
}
