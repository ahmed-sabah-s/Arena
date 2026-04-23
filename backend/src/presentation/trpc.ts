import { initTRPC, TRPCError } from '@trpc/server';
import { Context } from './context';
import { ZodError } from 'zod';
import { AppError } from '../shared/errors';

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

// Base router and procedure
export const router = t.router;
export const publicProcedure = t.procedure;

// Middleware to check authentication
const isAuthenticated = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to access this resource',
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

// Protected procedure (requires authentication)
export const protectedProcedure = t.procedure.use(isAuthenticated);

const statusToTrpcCode = (statusCode: number) => {
  const map: Record<number, TRPCError['code']> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'UNPROCESSABLE_CONTENT',
    429: 'TOO_MANY_REQUESTS',
  };
  return map[statusCode] ?? 'INTERNAL_SERVER_ERROR';
};

// Middleware to handle AppError and catch-all for unexpected errors
export const errorHandler = t.middleware(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error instanceof TRPCError) throw error;

    if (error instanceof AppError) {
      throw new TRPCError({
        code: statusToTrpcCode(error.statusCode),
        message: error.message,
      });
    }

    // Unexpected errors — log internally, never expose details
    console.error('[Unhandled error]', error);
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// Public procedure with error handling
export const publicProcedureWithErrorHandling = publicProcedure.use(errorHandler);

// Protected procedure with error handling
export const protectedProcedureWithErrorHandling = protectedProcedure.use(errorHandler);
