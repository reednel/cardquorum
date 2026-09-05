import { createHash, randomBytes } from 'crypto';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { FastifyReply, FastifyRequest } from 'fastify';
import { CredentialsResponse, SessionIdentity, StrategiesResponse } from '@cardquorum/shared';
import { ChangePasswordDto, LoginDto, PasswordDto, RegisterDto } from './auth.dto';
import { AuthService } from './auth.service';
import {
  buildClearOidcStateCookie,
  buildClearSessionCookie,
  buildOidcStateCookie,
  buildSessionCookie,
  parseOidcStateCookie,
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

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<SessionIdentity> {
    const { sessionId, user } = await this.authService.register(dto);
    reply.header('Set-Cookie', buildSessionCookie(sessionId, this.nodeEnv));
    return user;
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<SessionIdentity> {
    const { sessionId, user } = await this.authService.login(dto);
    reply.header('Set-Cookie', buildSessionCookie(sessionId, this.nodeEnv));
    return user;
  }

  @UseGuards(HttpAuthGuard)
  @Patch('oidc/register')
  async oidcRegister(
    @Body() dto: { username: string },
    @Req() request: FastifyRequest,
  ): Promise<SessionIdentity> {
    const user = (request as any)[REQUEST_USER_KEY];
    await this.authService.oidcRegister(user.userId, dto.username);
    return {
      userId: user.userId,
      username: dto.username,
      displayName: null,
      authMethod: 'oidc',
    };
  }

  @Get('oidc/login')
  oidcLogin(
    @Query('action') action: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): void {
    const nonce = randomBytes(32).toString('base64url');
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const state = randomBytes(32).toString('base64url');
    // Encode action in state using ':' delimiter (safe — base64url doesn't contain ':')
    const statePayload = action ? `${state}:${action}` : state;
    const forceReauth = action === 'delete-account' || action === 'unlink';
    const url = this.authService.getOidcAuthorizationUrl(
      statePayload,
      nonce,
      codeChallenge,
      forceReauth,
    );
    reply.header(
      'Set-Cookie',
      buildOidcStateCookie(nonce, codeVerifier, statePayload, this.nodeEnv),
    );
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

    const rawCookie = (request as any).cookies?.['cq_oidc_state'];
    const parsed = parseOidcStateCookie(rawCookie ? `cq_oidc_state=${rawCookie}` : undefined);

    if (!parsed || parsed.state !== state) {
      this.logger.warn(
        `OIDC state mismatch: cookie=${!!rawCookie}, match=${parsed?.state === state}`,
      );
      reply.header('Set-Cookie', buildClearOidcStateCookie(this.nodeEnv));
      reply.status(302).redirect('/login?error=invalid_state');
      return;
    }

    const { nonce, codeVerifier } = parsed;

    // Parse action from state (format: "randomstate:action" or just "randomstate")
    const actionSuffix = state.includes(':') ? state.split(':').slice(1).join(':') : null;

    try {
      if (actionSuffix === 'link' || actionSuffix === 'unlink') {
        // Manual session validation — HttpAuthGuard can't be used on this shared endpoint
        const sessionId = (request as any).cookies?.['cq_session'];
        const session = sessionId ? await this.sessionService.validateSession(sessionId) : null;
        if (!session) {
          reply.header('Set-Cookie', buildClearOidcStateCookie(this.nodeEnv));
          reply.status(302).redirect('/user/account?error=session_expired');
          return;
        }

        if (actionSuffix === 'link') {
          await this.authService.linkOidcCredential(session.userId, code, nonce, codeVerifier);
          reply.header('Set-Cookie', buildClearOidcStateCookie(this.nodeEnv));
          reply.status(302).redirect('/user/account?linked=oidc');
        } else {
          await this.authService.unlinkOidcCredential(session.userId, code, nonce, codeVerifier);
          reply.header('Set-Cookie', buildClearOidcStateCookie(this.nodeEnv));
          reply.status(302).redirect('/user/account?unlinked=oidc');
        }
      } else {
        // Existing login flow
        const { sessionId, user } = await this.authService.oidcCallback(code, nonce, codeVerifier);

        let redirectUrl = null;
        if (actionSuffix === 'delete-account') {
          redirectUrl = '/user/account?action=delete-account';
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
        reply.status(302).redirect(`/user/account?error=${errorParam}`);
      } else if (actionSuffix === 'unlink') {
        const errorParam = err instanceof ConflictException ? 'last_credential' : 'oidc_failed';
        reply.status(302).redirect(`/user/account?error=${errorParam}`);
      } else {
        reply.status(302).redirect('/login?error=oidc_failed');
      }
    }
  }

  /**
   * Backchannel logout endpoint — called server-to-server by the IdP.
   * No auth guard: the request is authenticated via the signed logout token JWT.
   */
  @Post('oidc/backchannel-logout')
  @HttpCode(200)
  async backchannelLogout(@Req() request: FastifyRequest): Promise<void> {
    const body = (request as any).body as Record<string, string> | undefined;
    const logoutToken = body?.['logout_token'];

    if (!logoutToken || typeof logoutToken !== 'string') {
      throw new BadRequestException('Missing logout_token');
    }

    await this.authService.backchannelLogout(logoutToken);
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
    @Body() dto: PasswordDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const user = (request as any)[REQUEST_USER_KEY];
    await this.authService.linkBasicCredential(user.userId, dto.password);
    reply.status(204).send();
  }

  @UseGuards(HttpAuthGuard)
  @Patch('credentials/basic')
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const user = (request as any)[REQUEST_USER_KEY];
    await this.authService.changePassword(user.userId, dto.currentPassword, dto.newPassword);
    reply.status(204).send();
  }

  @UseGuards(HttpAuthGuard)
  @Delete('credentials/basic')
  async unlinkBasicCredential(
    @Body() dto: PasswordDto,
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
  ): Promise<{ ok: true; endSessionUrl?: string }> {
    const sessionId = (request as any).cookies?.['cq_session'];
    let authMethod: string | undefined;

    if (sessionId) {
      const session = await this.sessionService.validateSession(sessionId);
      authMethod = session?.authMethod;
      await this.sessionService.deleteSession(sessionId);
    }

    reply.header('Set-Cookie', buildClearSessionCookie(this.nodeEnv));

    if (authMethod === 'oidc') {
      const endSessionUrl = this.authService.getEndSessionUrl();
      if (endSessionUrl) {
        return { ok: true, endSessionUrl };
      }
    }

    return { ok: true };
  }
}
