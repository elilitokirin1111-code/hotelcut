import { randomUUID } from 'node:crypto';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from '@hotelcut/auth';
import type { AuthRepository, UserSessionIdentity } from '@hotelcut/domain';
import {
  authSessionSchema,
  emailLoginSchema,
  errorResponseSchema,
  idSchema,
  type AuthSession,
} from '@hotelcut/schemas';

declare module 'fastify' {
  interface FastifyRequest {
    actorUserId: string;
  }
}

export const sessionCookieName = 'hotelcut_session';

interface AuthenticationOptions {
  allowDevelopmentIdentity: boolean;
  guestUserId?: string | undefined;
  repository: AuthRepository | undefined;
  secureSessionCookie: boolean;
  sessionTtlSeconds: number;
}

function cookieValue(request: FastifyRequest, name: string): string | null {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) {
    return null;
  }
  for (const pair of cookieHeader.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0 || pair.slice(0, separator).trim() !== name) {
      continue;
    }
    const value = pair.slice(separator + 1).trim();
    return value || null;
  }
  return null;
}

function sessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  return [
    `${sessionCookieName}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

function expiredSessionCookie(secure: boolean): string {
  return [
    `${sessionCookieName}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

function unauthorized(request: FastifyRequest, reply: FastifyReply, message: string) {
  return reply.code(401).send({
    code: 'UNAUTHENTICATED',
    message,
    requestId: request.id,
  });
}

async function resolveSession(
  request: FastifyRequest,
  repository: AuthRepository | undefined,
): Promise<UserSessionIdentity | null> {
  const token = cookieValue(request, sessionCookieName);
  if (!repository || !token) {
    return null;
  }
  return repository.findUserBySessionTokenHash(hashSessionToken(token), new Date());
}

function toAuthSession(identity: UserSessionIdentity): AuthSession {
  return authSessionSchema.parse({
    user: identity.user,
    expiresAt: identity.expiresAt.toISOString(),
  });
}

export function configureAuthentication(
  app: FastifyInstance,
  options: AuthenticationOptions,
): void {
  app.decorateRequest('actorUserId', '');
  const dummyPasswordHash = hashPassword(generateSessionToken());

  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?', 1)[0] ?? request.url;
    if (!path.startsWith('/v1/') || path.startsWith('/v1/auth/')) {
      return;
    }

    const session = await resolveSession(request, options.repository);
    if (session) {
      request.actorUserId = session.user.id;
      return;
    }

    if (options.guestUserId) {
      request.actorUserId = options.guestUserId;
      return;
    }

    if (options.allowDevelopmentIdentity) {
      const parsedUserId = idSchema.safeParse(request.headers['x-user-id']);
      if (parsedUserId.success) {
        request.actorUserId = parsedUserId.data;
        return;
      }
    }

    return unauthorized(request, reply, 'Sign in to access this resource');
  });

  app.post(
    '/v1/auth/login',
    {
      schema: {
        body: emailLoginSchema,
        response: {
          200: authSessionSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
        summary: 'Create an email and password session',
        tags: ['authentication'],
      },
    },
    async (request, reply) => {
      if (!options.repository) {
        throw new Error('Authentication repository is not configured');
      }

      const body = emailLoginSchema.parse(request.body);
      const credential = await options.repository.findPasswordCredentialByEmail(body.email);
      const passwordMatches = await verifyPassword(
        body.password,
        credential?.passwordHash ?? (await dummyPasswordHash),
      );
      if (!credential || !passwordMatches) {
        return unauthorized(request, reply, 'Email or password is incorrect');
      }

      const token = generateSessionToken();
      const expiresAt = new Date(Date.now() + options.sessionTtlSeconds * 1000);
      await options.repository.createUserSession({
        id: randomUUID(),
        userId: credential.user.id,
        tokenHash: hashSessionToken(token),
        expiresAt,
      });
      reply.header(
        'set-cookie',
        sessionCookie(token, options.sessionTtlSeconds, options.secureSessionCookie),
      );
      return toAuthSession({ user: credential.user, expiresAt });
    },
  );

  app.get(
    '/v1/auth/session',
    {
      schema: {
        response: { 200: authSessionSchema, 204: z.null() },
        security: [{ sessionCookie: [] }],
        summary: 'Read the current server-owned session',
        tags: ['authentication'],
      },
    },
    async (request, reply) => {
      const session = await resolveSession(request, options.repository);
      if (!session) {
        return reply.code(204).send(null);
      }
      return toAuthSession(session);
    },
  );

  app.delete(
    '/v1/auth/session',
    {
      schema: {
        response: { 204: z.null(), 401: errorResponseSchema },
        security: [{ sessionCookie: [] }],
        summary: 'Revoke the current session',
        tags: ['authentication'],
      },
    },
    async (request, reply) => {
      const token = cookieValue(request, sessionCookieName);
      if (token && options.repository) {
        await options.repository.revokeUserSession(hashSessionToken(token));
      }
      reply.header('set-cookie', expiredSessionCookie(options.secureSessionCookie));
      return reply.code(204).send(null);
    },
  );
}
