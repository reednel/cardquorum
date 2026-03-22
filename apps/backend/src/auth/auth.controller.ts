import { randomBytes } from 'crypto';
import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyReply, FastifyRequest } from 'fastify';
import { StrategiesResponse, UserIdentity } from '@cardquorum/shared';
import { AuthService } from './auth.service';
import {
  buildClearOidcStateCookie,
  buildClearSessionCookie,
  buildOidcStateCookie,
  buildSessionCookie,
} from './cookie';
import { HttpAuthGuard, REQUEST_USER_KEY } from './http-auth.guard';
import { SessionService } from './session.service';

@Controller('auth')
export class AuthController {
  private readonly nodeEnv: string;

  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    config: ConfigService,
  ) {
    this.nodeEnv = config.get('NODE_ENV', 'development');
  }

  @Get('strategies')
  strategies(): StrategiesResponse {
    return { strategies: this.authService.enabledStrategies };
  }

  @Post('register')
  async register(
    @Body() dto: { username: string; displayName: string; password: string },
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<UserIdentity> {
    const { sessionId, user } = await this.authService.register(dto);
    reply.header('Set-Cookie', buildSessionCookie(sessionId, this.nodeEnv));
    return user;
  }

  @Post('login')
  async login(
    @Body() dto: { username: string; password: string },
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<UserIdentity> {
    const { sessionId, user } = await this.authService.login(dto);
    reply.header('Set-Cookie', buildSessionCookie(sessionId, this.nodeEnv));
    return user;
  }

  @Get('oidc/login')
  oidcLogin(@Res({ passthrough: true }) reply: FastifyReply): void {
    const state = randomBytes(32).toString('base64url');
    const url = this.authService.getOidcAuthorizationUrl(state);
    reply.header('Set-Cookie', buildOidcStateCookie(state, this.nodeEnv));
    reply.status(302).redirect(url);
  }

  @Get('oidc/callback')
  async oidcCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const cookieState = (request as any).cookies?.['cq_oidc_state'];
    if (!cookieState || cookieState !== state) {
      reply.header('Set-Cookie', buildClearOidcStateCookie(this.nodeEnv));
      reply.status(302).redirect('/login?error=invalid_state');
      return;
    }

    try {
      const { sessionId } = await this.authService.oidcCallback(code);
      reply
        .header('Set-Cookie', buildSessionCookie(sessionId, this.nodeEnv))
        .header('Set-Cookie', buildClearOidcStateCookie(this.nodeEnv));
      reply.status(302).redirect('/');
    } catch {
      reply.header('Set-Cookie', buildClearOidcStateCookie(this.nodeEnv));
      reply.status(302).redirect('/login?error=oidc_failed');
    }
  }

  @UseGuards(HttpAuthGuard)
  @Get('me')
  me(@Req() request: FastifyRequest): UserIdentity {
    return (request as any)[REQUEST_USER_KEY];
  }

  @UseGuards(HttpAuthGuard)
  @Post('logout')
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ ok: true }> {
    const sessionId = (request as any).cookies?.['cq_session'];
    if (sessionId) {
      await this.sessionService.deleteSession(sessionId);
    }
    reply.header('Set-Cookie', buildClearSessionCookie(this.nodeEnv));
    return { ok: true };
  }
}
