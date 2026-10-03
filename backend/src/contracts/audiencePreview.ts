import { z } from 'zod';

/**
 * Supported event types in the Mable Audience Builder.
 */
export const EventTypeEnum = z.enum([
  'page_view',
  'product_view',
  'add_to_cart',
  'checkout_started',
  'purchase',
]);
export type EventType = z.infer<typeof EventTypeEnum>;

/**
 * Supported condition comparison operators.
 */
export const ConditionOperatorEnum = z.enum(['at_least', 'exactly']);
export type ConditionOperator = z.infer<typeof ConditionOperatorEnum>;

/**
 * Single condition schema for audience membership evaluation.
 */
export const AudienceConditionSchema = z.object({
  id: z.string().optional(),
  eventType: EventTypeEnum,
  operator: ConditionOperatorEnum,
  count: z
    .number({ required_error: 'count is required' })
    .int('count must be an integer')
    .nonnegative('count must be greater than or equal to 0'),
  withinDays: z
    .number({ required_error: 'withinDays is required' })
    .int('withinDays must be an integer')
    .positive('withinDays must be greater than 0'),
});
export type AudienceCondition = z.infer<typeof AudienceConditionSchema>;

/**
 * Request payload schema for POST /v1/audiences/preview.
 * - All conditions combined via AND semantics.
 * - asOf controls evaluation cutoff; server clock must never be used.
 */
export const AudiencePreviewRequestSchema = z.object({
  name: z.string({ required_error: 'Audience name is required' }).trim().min(1, 'Audience name cannot be empty'),
  asOf: z
    .string({ required_error: 'asOf timestamp is required' })
    .datetime({ message: 'asOf must be a valid ISO 8601 timestamp string' }),
  conditions: z
    .array(AudienceConditionSchema, { required_error: 'conditions array is required' })
    .min(1, 'At least one condition is required for audience preview'),
});
export type AudiencePreviewRequest = z.infer<typeof AudiencePreviewRequestSchema>;

/**
 * Represents an individual event record serving as proof of condition satisfaction.
 */
export const MatchedEventSchema = z.object({
  eventId: z.string(),
  eventType: EventTypeEnum,
  timestamp: z.string(),
  properties: z.record(z.unknown()).optional(),
});
export type MatchedEvent = z.infer<typeof MatchedEventSchema>;

/**
 * Evidence item for a specific condition satisfied by a user.
 * Disambiguates identical event types using conditionIndex, conditionId, and explicit window bounds.
 */
export const ConditionEvidenceSchema = z.object({
  conditionIndex: z.number().int().nonnegative(),
  conditionId: z.string().optional(),
  eventType: EventTypeEnum,
  operator: ConditionOperatorEnum,
  targetCount: z.number().int().nonnegative(),
  actualCount: z.number().int().nonnegative(),
  withinDays: z.number().int().positive(),
  windowStart: z.string(),
  windowEnd: z.string(),
  events: z.array(MatchedEventSchema),
});
export type ConditionEvidence = z.infer<typeof ConditionEvidenceSchema>;

/**
 * Matched user details along with condition-by-condition satisfaction evidence.
 */
export const MatchedUserSchema = z.object({
  userId: z.string(),
  isAnonymous: z.boolean(),
  evidence: z.array(ConditionEvidenceSchema),
});
export type MatchedUser = z.infer<typeof MatchedUserSchema>;

/**
 * Response payload schema for POST /v1/audiences/preview.
 */
export const AudiencePreviewResponseSchema = z.object({
  name: z.string(),
  asOf: z.string(),
  totalMatchedUsers: z.number().int().nonnegative(),
  matchedAnonymousUsers: z.number().int().nonnegative(),
  matchedUsers: z.array(MatchedUserSchema),
});
export type AudiencePreviewResponse = z.infer<typeof AudiencePreviewResponseSchema>;

/**
 * Standard centralized error response structure.
 */
export const ApiErrorDetailSchema = z.object({
  field: z.string().optional(),
  message: z.string(),
});
export type ApiErrorDetail = z.infer<typeof ApiErrorDetailSchema>;

export const ApiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(ApiErrorDetailSchema).optional(),
  }),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
