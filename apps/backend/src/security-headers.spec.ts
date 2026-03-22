import { Controller, Get, Module } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { registerHelmet } from './helmet';

@Controller('test')
class TestController {
  @Get()
  get() {
    return { ok: true };
  }
}

@Module({ controllers: [TestController] })
class TestModule {}

describe('Security headers', () => {
  let app: NestFastifyApplication;

  afterEach(async () => {
    await app?.close();
  });

  async function createApp(nodeEnv: string) {
    const moduleRef = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api');
    await registerHelmet(app, nodeEnv);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    return app;
  }

  function parseCsp(header: string): Record<string, string> {
    const directives: Record<string, string> = {};
    for (const part of header.split(';')) {
      const trimmed = part.trim();
      const spaceIdx = trimmed.indexOf(' ');
      if (spaceIdx === -1) {
        directives[trimmed] = '';
      } else {
        directives[trimmed.slice(0, spaceIdx)] = trimmed.slice(spaceIdx + 1);
      }
    }
    return directives;
  }

  it('should set CSP header in production', async () => {
    await createApp('production');

    const res = await app.inject({ method: 'GET', url: '/api/test' });

    const csp = res.headers['content-security-policy'] as string;
    expect(csp).toBeDefined();

    const directives = parseCsp(csp);
    expect(directives['default-src']).toBe("'none'");
    expect(directives['script-src']).toBe("'self'");
    expect(directives['style-src']).toBe("'self'");
    expect(directives['img-src']).toBe("'self'");
    expect(directives['font-src']).toBe("'self'");
    expect(directives['connect-src']).toBe("'self'");
    expect(directives['worker-src']).toBe("'self'");
    expect(directives['manifest-src']).toBe("'self'");
    expect(directives['base-uri']).toBe("'self'");
    expect(directives['form-action']).toBe("'self'");
    expect(directives['frame-ancestors']).toBe("'none'");
  });

  it('should include ws://localhost:* in connect-src for development', async () => {
    await createApp('development');

    const res = await app.inject({ method: 'GET', url: '/api/test' });

    const csp = res.headers['content-security-policy'] as string;
    const directives = parseCsp(csp);
    expect(directives['connect-src']).toBe("'self' ws://localhost:*");
  });

  it('should NOT include ws://localhost:* in connect-src for production', async () => {
    await createApp('production');

    const res = await app.inject({ method: 'GET', url: '/api/test' });

    const csp = res.headers['content-security-policy'] as string;
    expect(csp).not.toContain('ws://localhost');
  });

  it('should set X-Content-Type-Options header', async () => {
    await createApp('production');

    const res = await app.inject({ method: 'GET', url: '/api/test' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('should set X-Frame-Options header', async () => {
    await createApp('production');

    const res = await app.inject({ method: 'GET', url: '/api/test' });
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('should NOT set Cross-Origin-Embedder-Policy', async () => {
    await createApp('production');

    const res = await app.inject({ method: 'GET', url: '/api/test' });
    expect(res.headers['cross-origin-embedder-policy']).toBeUndefined();
  });
});
