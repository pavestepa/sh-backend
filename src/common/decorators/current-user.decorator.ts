import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthenticatedUser {
  userId: string;
}

interface AuthedRequest extends Request {
  user?: AuthenticatedUser;
}

/** Extracts the authenticated user attached by JwtAuthGuard. Never trust body-supplied ids instead. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<AuthedRequest>();
    return request.user as AuthenticatedUser;
  },
);
