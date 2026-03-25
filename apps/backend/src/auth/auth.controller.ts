import { randomBytes } from 'crypto';
import { Body, Controller, Get, Logger, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyReply, FastifyRequest } from 'fastify';
import { SessionIdentity, StrategiesResponse, UserIdentity } from '@cardquorum/shared';
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
  private readonly logger = new Logger(AuthController.name);
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
  oidcLogin(
    @Query('action') action: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): void {
    const nonce = randomBytes(32).toString('base64url');
    // Encode action in state using ':' delimiter (safe — base64url doesn't contain ':')
    const statePayload = action ? `${nonce}:${action}` : nonce;
    const prompt = action === 'delete-account' ? 'login' : undefined;
    const url = this.authService.getOidcAuthorizationUrl(statePayload, prompt);
    reply.header('Set-Cookie', buildOidcStateCookie(statePayload, this.nodeEnv));
    reply.status(302).redirect(url);
  }

  @Get('oidc/callback')
  async oidcCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') oidcError: string,
    @Query('error_description') oidcErrorDesc: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    if (oidcError) {
      this.logger.warn(
        `OIDC provider returned error: ${oidcError} — ${oidcErrorDesc ?? '(no description)'}`,
      );
      reply.header('Set-Cookie', buildClearOidcStateCookie(this.nodeEnv));
      reply.status(302).redirect('/login?error=oidc_failed');
      return;
    }

    if (!code || !state) {
      this.logger.warn(`OIDC callback missing params: code=${!!code}, state=${!!state}`);
      reply.header('Set-Cookie', buildClearOidcStateCookie(this.nodeEnv));
      reply.status(302).redirect('/login?error=oidc_failed');
      return;
    }

    const cookieState = (request as any).cookies?.['cq_oidc_state'];
    if (!cookieState || cookieState !== state) {
      this.logger.warn(
        `OIDC state mismatch: cookie=${!!cookieState}, match=${cookieState === state}`,
      );
      reply.header('Set-Cookie', buildClearOidcStateCookie(this.nodeEnv));
      reply.status(302).redirect('/login?error=invalid_state');
      return;
    }

    try {
      const { sessionId } = await this.authService.oidcCallback(code);

      // Parse action from state (format: "random:action" or just "random")
      const actionSuffix = state.includes(':') ? state.split(':').slice(1).join(':') : null;
      const redirectUrl =
        actionSuffix === 'delete-account' ? '/account?action=delete-account' : '/';

      reply.header('Set-Cookie', [
        buildSessionCookie(sessionId, this.nodeEnv),
        buildClearOidcStateCookie(this.nodeEnv),
      ]);
      reply.status(302).redirect(redirectUrl);
    } catch (err) {
      this.logger.warn(`OIDC callback failed: ${err}`);
      reply.header('Set-Cookie', buildClearOidcStateCookie(this.nodeEnv));
      reply.status(302).redirect('/login?error=oidc_failed');
    }
  }

  @UseGuards(HttpAuthGuard)
  @Get('me')
  me(@Req() request: FastifyRequest): SessionIdentity {
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
