import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as Joi from 'joi';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { DrizzleModule } from '../drizzle/drizzle.module';
import { GameModule } from '../game/game.module';
import { HealthModule } from '../health/health.module';
import { RedisModule } from '../redis/redis.module';
import { WsModule } from '../ws/ws.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().uri().required(),
        REDIS_URL: Joi.string().uri().required(),
        LOG_LEVEL: Joi.string().valid('debug', 'info', 'warn', 'error').default('info'),
        PORT: Joi.number().default(3000),
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        AUTH_STRATEGY: Joi.string().valid('basic', 'oidc').default('basic'),
        JWT_SECRET: Joi.string().when('AUTH_STRATEGY', {
          is: 'basic',
          then: Joi.required(),
          otherwise: Joi.optional(),
        }),
        OIDC_ISSUER: Joi.string().uri().when('AUTH_STRATEGY', {
          is: 'oidc',
          then: Joi.required(),
          otherwise: Joi.optional(),
        }),
        OIDC_CLIENT_ID: Joi.string().when('AUTH_STRATEGY', {
          is: 'oidc',
          then: Joi.required(),
          otherwise: Joi.optional(),
        }),
      }),
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', 'info'),
          transport:
            config.get('NODE_ENV') !== 'production'
              ? { target: 'pino-pretty', options: { colorize: true } }
              : undefined,
          redact: ['req.headers.authorization'],
        },
      }),
    }),
    DrizzleModule,
    RedisModule,
    HealthModule,
    AuthModule,
    WsModule,
    ChatModule,
    GameModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
