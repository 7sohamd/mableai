import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import { createAudienceRouter } from './audienceRoutes';

/**
 * Creates the root API router.
 *
 * @param db - Optional Database injection forwarded to sub-routers.
 *   When present (test scenario), sub-routers use this connection rather
 *   than the process-level singleton.
 */
export const createApiRouter = (db?: Database.Database): Router => {
  const router = Router();

  // Basic health check endpoint — does not touch the database
  router.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Audience endpoints
  router.use('/v1/audiences', createAudienceRouter(db));

  return router;
};
