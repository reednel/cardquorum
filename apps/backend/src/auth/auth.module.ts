import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CredentialRepository, UserRepository } from '@cardquorum/db';
import { AUTH_STRATEGY_TOKEN, AuthStrategyService } from './auth-strategy.interface';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { BasicAuthStrategy } from './basic/basic-auth.strategy';
import { OidcAuthStrategy } from './oidc/oidc-auth.strategy';
import { WsAuthGuard } from './ws-auth.guard';

@Module({
  providers: [
    {
      provide: BasicAuthStrategy,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new BasicAuthStrategy(config.getOrThrow<string>('JWT_SECRET')),
    },
    {
      provide: AUTH_STRATEGY_TOKEN,
      inject: [ConfigService, BasicAuthStrategy, CredentialRepository],
      useFactory: (
        config: ConfigService,
        basic: BasicAuthStrategy,
        credentialRepo: CredentialRepository,
      ): AuthStrategyService => {
        const strategy = config.get<string>('AUTH_STRATEGY', 'basic');
        if (strategy === 'basic') {
          return basic;
        }
        if (strategy === 'oidc') {
          return new OidcAuthStrategy(
            config.getOrThrow<string>('OIDC_ISSUER'),
            config.getOrThrow<string>('OIDC_CLIENT_ID'),
            credentialRepo,
          );
        }
        throw new Error(`Unknown AUTH_STRATEGY: ${strategy}`);
      },
    },
    {
      provide: AuthService,
      inject: [UserRepository, CredentialRepository, BasicAuthStrategy],
      useFactory: (
        userRepo: UserRepository,
        credentialRepo: CredentialRepository,
        basic: BasicAuthStrategy,
      ) => new AuthService(userRepo, credentialRepo, basic),
    },
    WsAuthGuard,
  ],
  controllers: [AuthController],
  exports: [AUTH_STRATEGY_TOKEN, WsAuthGuard],
})
export class AuthModule {}
