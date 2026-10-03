import express, { Express } from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { config } from './config/env';
import { createApiRouter } from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

/**
 * Creates and configures the Express application.
 *
 * @param db - Optional Database instance to inject for testing.
 *   When provided (typically an in-memory DB in tests), the application uses
 *   that connection instead of opening the configured file-based database.
 *   When omitted, the application uses the process-level singleton from getDb().
 */
export const createApp = (db?: Database.Database): Express => {
  const app = express();

  // Configure middleware
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    })
  );
  app.use(express.json());

  // Mount API routes — pass the injected DB through so routes don't open
  // their own connection when a test DB is provided.
  app.use('/', createApiRouter(db));

  // Handle unmatched routes
  app.use(notFoundHandler);

  // Centralized error handler
  app.use(errorHandler);

  return app;
};
