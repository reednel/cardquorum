import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CredentialRepository, SessionRepository, UserRepository } from '@cardquorum/db';
import { AuthStrategy } from '@cardquorum/shared';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { HttpAuthGuard } from './http-auth.guard';
import { SessionService } from './session.service';
import { WsAuthGuard } from './ws-auth.guard';

@Module({
  providers: [
    {
      provide: SessionService,
      inject: [SessionRepository],
      useFactory: (sessionRepo: SessionRepository) => new SessionService(sessionRepo),
    },
    {
      provide: AuthService,
      inject: [UserRepository, CredentialRepository, SessionService, ConfigService],
      useFactory: async (
        userRepo: UserRepository,
        credentialRepo: CredentialRepository,
        sessionService: SessionService,
        config: ConfigService,
      ) => {
        const strategies = config
          .get<string>('AUTH_STRATEGIES', 'basic')
          .split(',')
          .map((s: string) => s.trim()) as AuthStrategy[];

        const service = new AuthService(userRepo, credentialRepo, sessionService, {
          strategies,
          oidcIssuer: config.get('OIDC_ISSUER'),
          oidcClientId: config.get('OIDC_CLIENT_ID'),
          oidcClientSecret: config.get('OIDC_CLIENT_SECRET'),
          oidcRedirectUri: config.get('OIDC_REDIRECT_URI'),
        });

        await service.initOidc();
        return service;
      },
    },
    {
      provide: HttpAuthGuard,
      inject: [SessionService],
      useFactory: (sessionService: SessionService) => new HttpAuthGuard(sessionService),
    },
    {
      provide: WsAuthGuard,
      inject: [SessionService],
      useFactory: (sessionService: SessionService) => new WsAuthGuard(sessionService),
    },
  ],
  controllers: [AuthController],
  exports: [HttpAuthGuard, WsAuthGuard, SessionService, AuthService],
})
export class AuthModule {}
