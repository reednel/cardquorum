import { NestFastifyApplication } from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';

export async function registerHelmet(
  app: NestFastifyApplication,
  nodeEnv = process.env.NODE_ENV ?? 'development',
): Promise<void> {
  const isDev = nodeEnv !== 'production';

  await app.register(helmet, {
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'"],
        fontSrc: ["'self'"],
        connectSrc: isDev ? ["'self'", 'ws://localhost:*'] : ["'self'", 'wss:'],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  });
}
