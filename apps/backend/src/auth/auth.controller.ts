import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { UserIdentity } from '@cardquorum/shared';
import { AuthService } from './auth.service';
import { HttpAuthGuard, REQUEST_USER_KEY } from './http-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: { username: string; displayName: string; password: string }) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: { username: string; password: string }) {
    return this.authService.login(dto);
  }

  @UseGuards(HttpAuthGuard)
  @Get('me')
  me(@Req() request: FastifyRequest): UserIdentity {
    return (request as any)[REQUEST_USER_KEY];
  }
}
