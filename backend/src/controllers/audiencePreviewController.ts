import { Request, Response, NextFunction } from 'express';
import {
  AudiencePreviewRequestSchema,
  AudiencePreviewResponse,
} from '../contracts/audiencePreview';
import { IAudienceEvaluationService } from '../services/audienceEvaluationService';

export class AudiencePreviewController {
  constructor(private readonly evaluationService: IAudienceEvaluationService) {}

  preview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validate incoming HTTP payload against the Zod contract schema
      const validatedPayload = AudiencePreviewRequestSchema.parse(req.body);

      // Delegate evaluation entirely to the business service layer
      const result: AudiencePreviewResponse = await this.evaluationService.previewAudience(
        validatedPayload
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
