import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApiErrorResponse } from '../contracts/audiencePreview';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Array<{ field?: string; message: string }>
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * 404 Not Found Middleware
 */
export const notFoundHandler = (req: Request, res: Response, _next: NextFunction): void => {
  const response: ApiErrorResponse = {
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.originalUrl}`,
    },
  };
  res.status(404).json(response);
};

/**
 * Centralized error handler middleware.
 * Ensures all API errors follow the uniform ApiErrorResponse contract.
 */
export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));

    const response: ApiErrorResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        details,
      },
    };
    res.status(400).json(response);
    return;
  }

  if (err instanceof AppError) {
    const response: ApiErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    };
    res.status(err.statusCode).json(response);
    return;
  }

  // SyntaxError from invalid JSON body parsing
  if (err instanceof SyntaxError && 'body' in err) {
    const response: ApiErrorResponse = {
      error: {
        code: 'INVALID_JSON',
        message: 'Malformed JSON payload in request body',
      },
    };
    res.status(400).json(response);
    return;
  }

  // Fallback internal server error
  console.error('Unhandled internal error:', err);
  const response: ApiErrorResponse = {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred',
    },
  };
  res.status(500).json(response);
};
