export type EventType =
  | 'page_view'
  | 'product_view'
  | 'add_to_cart'
  | 'checkout_started'
  | 'purchase';


export type ConditionOperator = 'at_least' | 'exactly';

export interface AudienceCondition {
  id?: string;
  eventType: EventType;
  operator: ConditionOperator;
  count: number;
  withinDays: number;
}

export interface AudiencePreviewRequest {
  name: string;
  asOf: string;
  conditions: AudienceCondition[];
}

export interface MatchedEvent {
  eventId: string;
  eventType: EventType;
  timestamp: string;
  properties?: Record<string, unknown>;
}

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

export interface MatchedUser {
  userId: string;
  isAnonymous: boolean;
  evidence: ConditionEvidence[];
}

export interface AudiencePreviewResponse {
  name: string;
  asOf: string;
  totalMatchedUsers: number;
  matchedAnonymousUsers: number;
  matchedUsers: MatchedUser[];
}

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
