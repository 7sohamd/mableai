import { config } from '../config/env';
import type {
  AudiencePreviewRequest,
  AudiencePreviewResponse,
  ApiErrorResponse,
} from '../contracts/audiencePreview';

/**
 * A domain error carrying a structured API error payload.
 * Thrown by previewAudience when the backend returns a non-2xx response.
 */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly payload: ApiErrorResponse
  ) {
    super(payload.error.message);
    this.name = 'ApiError';
  }
}

/**
 * Calls POST /v1/audiences/preview.
 *
 * Throws:
 *   - ApiError        when the server returns a structured error (4xx / 5xx)
 *   - Error           for network failures (fetch rejects)
 *
 * Never invents field names. The request body exactly matches the backend
 * AudiencePreviewRequest contract; the returned value exactly matches
 * AudiencePreviewResponse.
 */
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
