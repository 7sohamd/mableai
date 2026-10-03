import { config } from '../config/env';
import type {
  AudiencePreviewRequest,
  AudiencePreviewResponse,
  ApiErrorResponse,
} from '../contracts/audiencePreview';

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly payload: ApiErrorResponse
  ) {
    super(payload.error.message);
    this.name = 'ApiError';
  }
}

export async function previewAudience(
  request: AudiencePreviewRequest
): Promise<AudiencePreviewResponse> {
  const url = `${config.apiBaseUrl}/v1/audiences/preview`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    throw new Error('Network error: could not reach the backend. Is it running?');
  }

  if (!response.ok) {
    let errorPayload: ApiErrorResponse;
    try {
      errorPayload = (await response.json()) as ApiErrorResponse;
    } catch {
      errorPayload = {
        error: {
          code: 'UNKNOWN_ERROR',
          message: `Server returned HTTP ${response.status}`,
        },
      };
    }
    throw new ApiError(response.status, errorPayload);
  }

  return response.json() as Promise<AudiencePreviewResponse>;
}
