import { randomBytes } from 'crypto';
import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Logger,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyReply, FastifyRequest } from 'fastify';
import {
  CredentialsResponse,
  SessionIdentity,
  StrategiesResponse,
  UserIdentity,
} from '@cardquorum/shared';
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
    @Body() dto: { username: string; password: string },
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

  @UseGuards(HttpAuthGuard)
  @Patch('oidc/register')
  async oidcRegister(
    @Body() dto: { username: string },
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const user = (request as any)[REQUEST_USER_KEY];
    await this.authService.oidcRegister(user.userId, dto.username);
    reply.status(302).redirect('/');
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

    // Parse action from state (format: "nonce:action" or just "nonce")
    const actionSuffix = state.includes(':') ? state.split(':').slice(1).join(':') : null;

    try {
      if (actionSuffix === 'link' || actionSuffix === 'unlink') {
        // Manual session validation — HttpAuthGuard can't be used on this shared endpoint
        const sessionId = (request as any).cookies?.['cq_session'];
        const session = sessionId ? await this.sessionService.validateSession(sessionId) : null;
        if (!session) {
          reply.header('Set-Cookie', buildClearOidcStateCookie(this.nodeEnv));
          reply.status(302).redirect('/account?error=session_expired');
          return;
        }

        if (actionSuffix === 'link') {
          await this.authService.linkOidcCredential(session.userId, code);
          reply.header('Set-Cookie', buildClearOidcStateCookie(this.nodeEnv));
          reply.status(302).redirect('/account?linked=oidc');
        } else {
          await this.authService.unlinkOidcCredential(session.userId, code);
          reply.header('Set-Cookie', buildClearOidcStateCookie(this.nodeEnv));
          reply.status(302).redirect('/account?unlinked=oidc');
        }
      } else {
        // Existing login flow
        const { sessionId, user } = await this.authService.oidcCallback(code);

        let redirectUrl = null;
        if (actionSuffix === 'delete-account') {
          redirectUrl = '/account?action=delete-account';
        } else if (user.username.startsWith('user_')) {
          redirectUrl = `/register/oidc`;
        } else {
          redirectUrl = '/';
        }
        reply.header('Set-Cookie', [
          buildSessionCookie(sessionId, this.nodeEnv),
          buildClearOidcStateCookie(this.nodeEnv),
        ]);
        reply.status(302).redirect(redirectUrl);
      }
    } catch (err) {
      this.logger.warn(`OIDC callback failed: ${err}`);
      reply.header('Set-Cookie', buildClearOidcStateCookie(this.nodeEnv));

      if (actionSuffix === 'link') {
        const errorParam = err instanceof ConflictException ? 'oidc_conflict' : 'oidc_failed';
        reply.status(302).redirect(`/account?error=${errorParam}`);
      } else if (actionSuffix === 'unlink') {
        const errorParam = err instanceof ConflictException ? 'last_credential' : 'oidc_failed';
        reply.status(302).redirect(`/account?error=${errorParam}`);
      } else {
        reply.status(302).redirect('/login?error=oidc_failed');
      }
    }
  }

  @UseGuards(HttpAuthGuard)
  @Get('credentials')
  async getCredentials(@Req() request: FastifyRequest): Promise<CredentialsResponse> {
    const user = (request as any)[REQUEST_USER_KEY];
    const methods = await this.authService.getCredentialMethods(user.userId);
    return { methods };
  }

  @UseGuards(HttpAuthGuard)
  @Post('credentials/basic')
  async linkBasicCredential(
    @Body() dto: { password: string },
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const user = (request as any)[REQUEST_USER_KEY];
    await this.authService.linkBasicCredential(user.userId, dto.password);
    reply.status(204).send();
  }

  @UseGuards(HttpAuthGuard)
  @Delete('credentials/basic')
  async unlinkBasicCredential(
    @Body() dto: { password: string },
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const user = (request as any)[REQUEST_USER_KEY];
    await this.authService.verifyBasicCredential(user.userId, dto.password);
    await this.authService.unlinkCredential(user.userId, 'basic');
    reply.status(204).send();
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
