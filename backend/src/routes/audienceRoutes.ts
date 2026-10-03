import { Router } from 'express';
import Database from 'better-sqlite3';
import { AudiencePreviewController } from '../controllers/audiencePreviewController';
import { AudienceEvaluationService } from '../services/audienceEvaluationService';
import { SqliteEventRepository, eventRepository } from '../repositories/eventRepository';
import { getDb } from '../db/connection';
import { config } from '../config/env';

/**
 * Creates the audience sub-router.
 *
 * @param injectedDb - Optional Database injection for test isolation.
 *   Tests supply an in-memory DB; production uses the shared singleton.
 */
export const createAudienceRouter = (injectedDb?: Database.Database): Router => {
  const router = Router();

  // Use the injected DB when present (tests), otherwise fall back to the
  // process-level singleton opened against the configured file path.
  const db: Database.Database = injectedDb ?? getDb(config.databasePath);

  // The repository is stateless; pass the chosen connection at call time.
  const repo: SqliteEventRepository = new SqliteEventRepository();
  const evaluationService = new AudienceEvaluationService(repo, db);
  const controller = new AudiencePreviewController(evaluationService);

  // POST /v1/audiences/preview
  router.post('/preview', controller.preview);

  return router;
};

// Suppress unused-import warning — eventRepository is the shared singleton
// exported for optional direct use by other modules.
void eventRepository;
