import { describe, it, expect } from 'vitest';
import {
  AudiencePreviewRequestSchema,
  AudiencePreviewResponseSchema,
  AudienceConditionSchema,
} from '../../src/contracts/audiencePreview';

describe('Audience Contract Schemas', () => {
  describe('AudienceConditionSchema', () => {
    it('accepts valid condition definitions', () => {
      const condition = {
        id: 'cond_view_prod',
        eventType: 'product_view',
        operator: 'at_least',
        count: 2,
        withinDays: 7,
      };

      const result = AudienceConditionSchema.safeParse(condition);
      expect(result.success).toBe(true);
    });

    it('rejects unsupported eventType', () => {
      const condition = {
        eventType: 'item_clicked',
        operator: 'at_least',
        count: 1,
        withinDays: 7,
      };

      const result = AudienceConditionSchema.safeParse(condition);
      expect(result.success).toBe(false);
    });

    it('rejects unsupported operator', () => {
      const condition = {
        eventType: 'purchase',
        operator: 'less_than',
        count: 1,
        withinDays: 7,
      };

      const result = AudienceConditionSchema.safeParse(condition);
      expect(result.success).toBe(false);
    });

    it('rejects non-positive withinDays', () => {
      const condition = {
        eventType: 'purchase',
        operator: 'exactly',
        count: 0,
        withinDays: 0,
      };

      const result = AudienceConditionSchema.safeParse(condition);
      expect(result.success).toBe(false);
    });

    it('rejects negative count', () => {
      const condition = {
        eventType: 'purchase',
        operator: 'at_least',
        count: -1,
        withinDays: 7,
      };

      const result = AudienceConditionSchema.safeParse(condition);
      expect(result.success).toBe(false);
    });
  });

  describe('AudiencePreviewRequestSchema', () => {
    it('validates canonical preview request structure', () => {
      const validPayload = {
        name: 'Viewed but not purchased',
        asOf: '2026-09-29T00:00:00.000Z',
        conditions: [
          {
            eventType: 'product_view',
            operator: 'at_least',
            count: 2,
            withinDays: 7,
          },
          {
            eventType: 'purchase',
            operator: 'exactly',
            count: 0,
            withinDays: 7,
          },
        ],
      };

      const result = AudiencePreviewRequestSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Viewed but not purchased');
        expect(result.data.conditions).toHaveLength(2);
      }
    });

    it('rejects missing or empty conditions array', () => {
      const invalidPayload = {
        name: 'Empty conditions',
        asOf: '2026-09-29T00:00:00.000Z',
        conditions: [],
      };

      const result = AudiencePreviewRequestSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it('rejects invalid asOf date format', () => {
      const invalidPayload = {
        name: 'Bad date',
        asOf: 'not-a-valid-date',
        conditions: [
          {
            eventType: 'page_view',
            operator: 'at_least',
            count: 1,
            withinDays: 1,
          },
        ],
      };

      const result = AudiencePreviewRequestSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });
  });

  describe('AudiencePreviewResponseSchema', () => {
    it('validates response with evidence structure disambiguating identical event types', () => {
      const validResponse = {
        name: 'Multi-window product viewers',
        asOf: '2026-09-29T00:00:00.000Z',
        totalMatchedUsers: 1,
        matchedAnonymousUsers: 0,
        matchedUsers: [
          {
            userId: 'user_42',
            isAnonymous: false,
            evidence: [
              {
                conditionIndex: 0,
                conditionId: 'cond_short_window',
                eventType: 'product_view',
                operator: 'at_least',
                targetCount: 2,
                actualCount: 3,
                withinDays: 7,
                windowStart: '2026-09-22T00:00:00.000Z',
                windowEnd: '2026-09-29T00:00:00.000Z',
                events: [
                  {
                    eventId: 'evt_1',
                    eventType: 'product_view',
                    timestamp: '2026-09-23T10:00:00.000Z',
                    properties: { productId: 'p1' },
                  },
                ],
              },
              {
                conditionIndex: 1,
                conditionId: 'cond_long_window',
                eventType: 'product_view',
                operator: 'at_least',
                targetCount: 5,
                actualCount: 6,
                withinDays: 30,
                windowStart: '2026-08-30T00:00:00.000Z',
                windowEnd: '2026-09-29T00:00:00.000Z',
                events: [],
              },
            ],
          },
        ],
      };

      const result = AudiencePreviewResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });
  });
});
