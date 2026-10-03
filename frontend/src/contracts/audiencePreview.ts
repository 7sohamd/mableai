/**
 * Supported event types in the Mable Audience Builder.
 */
export type EventType =
  | 'page_view'
  | 'product_view'
  | 'add_to_cart'
  | 'checkout_started'
  | 'purchase';

/**
 * Supported condition comparison operators.
 */
export type ConditionOperator = 'at_least' | 'exactly';

/**
 * Individual audience definition condition.
 */
export interface AudienceCondition {
  id?: string;
  eventType: EventType;
  operator: ConditionOperator;
  count: number;
  withinDays: number;
}

/**
 * Payload structure for POST /v1/audiences/preview.
 */
export interface AudiencePreviewRequest {
  name: string;
  asOf: string;
  conditions: AudienceCondition[];
}

/**
 * Single event item that contributed as proof of matching a condition.
 */
export interface MatchedEvent {
  eventId: string;
  eventType: EventType;
  timestamp: string;
  properties?: Record<string, unknown>;
}

/**
 * Disambiguated condition evidence for a matched user.
 */
export interface ConditionEvidence {
  conditionIndex: number;
  conditionId?: string;
  eventType: EventType;
  operator: ConditionOperator;
  targetCount: number;
  actualCount: number;
  withinDays: number;
  windowStart: string;
  windowEnd: string;
  events: MatchedEvent[];
}

/**
 * User matched by the audience preview.
 */
export interface MatchedUser {
  userId: string;
  isAnonymous: boolean;
  evidence: ConditionEvidence[];
}

/**
 * Response structure for POST /v1/audiences/preview.
 */
export interface AudiencePreviewResponse {
  name: string;
  asOf: string;
  totalMatchedUsers: number;
  matchedAnonymousUsers: number;
  matchedUsers: MatchedUser[];
}

/**
 * Centralized API error structure.
 */
export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
  };
}
