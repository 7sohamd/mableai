/**
 * AudienceBuilder integration tests.
 *
 * These tests render <App />, interact via user-event, and assert DOM output.
 * The API boundary (fetch) is mocked at the module level — no real HTTP calls.
 * All expected results are specified explicitly, not derived from re-running
 * the implementation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import type { AudiencePreviewResponse } from '../contracts/audiencePreview';

// ---------------------------------------------------------------------------
// Mock the API module so no real HTTP is issued
// ---------------------------------------------------------------------------

vi.mock('../api/audienceApi', () => ({
  previewAudience: vi.fn(),
  ApiError: class ApiError extends Error {
    statusCode: number;
    payload: unknown;
    constructor(
      statusCode: number,
      payload: {
        error: {
          code: string;
          message: string;
          details?: { field?: string; message: string }[];
        };
      }
    ) {
      super(payload.error.message);
      this.name = 'ApiError';
      this.statusCode = statusCode;
      this.payload = payload;
    }
  },
}));

import { previewAudience, ApiError } from '../api/audienceApi';
const mockPreviewAudience = vi.mocked(previewAudience);

// ---------------------------------------------------------------------------
// Fixture responses
// ---------------------------------------------------------------------------

const SUCCESS_RESPONSE: AudiencePreviewResponse = {
  name: 'Viewed but not purchased',
  asOf: '2026-09-29T00:00:00.000Z',
  totalMatchedUsers: 2,
  matchedAnonymousUsers: 2,
  matchedUsers: [
    {
      userId: 'anon_match_a',
      isAnonymous: true,
      evidence: [
        {
          conditionIndex: 0,
          eventType: 'product_view',
          operator: 'at_least',
          targetCount: 2,
          actualCount: 3,
          withinDays: 7,
          windowStart: '2026-09-22T00:00:00.000Z',
          windowEnd: '2026-09-29T00:00:00.000Z',
          events: [],
        },
        {
          conditionIndex: 1,
          eventType: 'purchase',
          operator: 'exactly',
          targetCount: 0,
          actualCount: 0,
          withinDays: 7,
          windowStart: '2026-09-22T00:00:00.000Z',
          windowEnd: '2026-09-29T00:00:00.000Z',
          events: [],
        },
      ],
    },
    {
      userId: 'anon_match_b',
      isAnonymous: true,
      evidence: [
        {
          conditionIndex: 0,
          eventType: 'product_view',
          operator: 'at_least',
          targetCount: 2,
          actualCount: 2,
          withinDays: 7,
          windowStart: '2026-09-22T00:00:00.000Z',
          windowEnd: '2026-09-29T00:00:00.000Z',
          events: [],
        },
        {
          conditionIndex: 1,
          eventType: 'purchase',
          operator: 'exactly',
          targetCount: 0,
          actualCount: 0,
          withinDays: 7,
          windowStart: '2026-09-22T00:00:00.000Z',
          windowEnd: '2026-09-29T00:00:00.000Z',
          events: [],
        },
      ],
    },
  ],
};

const EMPTY_RESPONSE: AudiencePreviewResponse = {
  name: 'Empty Audience',
  asOf: '2026-09-29T00:00:00.000Z',
  totalMatchedUsers: 0,
  matchedAnonymousUsers: 0,
  matchedUsers: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup() {
  const user = userEvent.setup();
  const utils = render(<App />);
  return { user, ...utils };
}



// Reset mocks between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Initial render
// ---------------------------------------------------------------------------

describe('Initial form state', () => {
  it('renders the page heading', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Audience Builder', level: 1 })).toBeInTheDocument();
  });

  it('pre-fills the audience name field', () => {
    setup();
    const nameInput = screen.getByLabelText(/audience name/i);
    expect(nameInput).toHaveValue('Viewed but not purchased');
  });

  it('pre-fills the asOf field with the canonical timestamp', () => {
    setup();
    const asOfInput = screen.getByLabelText(/evaluate as of/i);
    expect(asOfInput).toHaveValue('2026-09-29T00:00:00.000Z');
  });

  it('renders two conditions by default', () => {
    setup();
    expect(screen.getByText('Condition 1')).toBeInTheDocument();
    expect(screen.getByText('Condition 2')).toBeInTheDocument();
    expect(screen.queryByText('Condition 3')).not.toBeInTheDocument();
  });

  it('renders the Preview audience button', () => {
    setup();
    expect(screen.getByRole('button', { name: /preview audience/i })).toBeInTheDocument();
  });

  it('does not show results on initial render', () => {
    setup();
    expect(screen.queryByRole('region', { name: /audience preview results/i })).not.toBeInTheDocument();
  });

  it('does not show an error card on initial render', () => {
    setup();
    expect(screen.queryByText(/preview failed/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. Adding and removing conditions
// ---------------------------------------------------------------------------

describe('Adding and removing conditions', () => {
  it('adds a condition when "+ Add condition" is clicked', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /add condition/i }));
    expect(screen.getByText('Condition 3')).toBeInTheDocument();
  });

  it('removes a condition when the Remove button for that condition is clicked', async () => {
    const { user } = setup();
    // Add a third condition so we can remove one without dropping below 1
    await user.click(screen.getByRole('button', { name: /add condition/i }));
    expect(screen.getByText('Condition 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /remove condition 3/i }));
    expect(screen.queryByText('Condition 3')).not.toBeInTheDocument();
  });

  it('hides the Remove button when only one condition remains', async () => {
    const { user } = setup();
    // Remove condition 2 — only one left
    await user.click(screen.getByRole('button', { name: /remove condition 2/i }));

    // No Remove buttons should be present at all
    expect(screen.queryByRole('button', { name: /remove condition/i })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 3. Editing condition fields (scoped to condition 1's group)
// ---------------------------------------------------------------------------

describe('Editing condition fields', () => {
  it('changes event type for condition 1', async () => {
    const { user } = setup();
    // Scope to the condition 1 group to avoid multiple-element issues
    const cond1Group = screen.getByRole('group', { name: 'Condition 1' });
    const eventTypeSelect = within(cond1Group).getByRole('combobox', { name: /event type/i });
    await user.selectOptions(eventTypeSelect, 'purchase');
    expect(eventTypeSelect).toHaveValue('purchase');
  });

  it('changes operator for condition 1', async () => {
    const { user } = setup();
    const cond1Group = screen.getByRole('group', { name: 'Condition 1' });
    const operatorSelect = within(cond1Group).getByRole('combobox', { name: /operator/i });
    await user.selectOptions(operatorSelect, 'exactly');
    expect(operatorSelect).toHaveValue('exactly');
  });

  it('updates count value for condition 1', async () => {
    const { user } = setup();
    const cond1Group = screen.getByRole('group', { name: 'Condition 1' });
    const countInput = within(cond1Group).getByRole('spinbutton', { name: /^count$/i });
    await user.clear(countInput);
    await user.type(countInput, '5');
    expect(countInput).toHaveValue(5);
  });

  it('updates withinDays value for condition 1', async () => {
    const { user } = setup();
    const cond1Group = screen.getByRole('group', { name: 'Condition 1' });
    const withinInput = within(cond1Group).getByRole('spinbutton', { name: /within days/i });
    await user.clear(withinInput);
    await user.type(withinInput, '30');
    expect(withinInput).toHaveValue(30);
  });
});

// ---------------------------------------------------------------------------
// 4. Client-side validation
// ---------------------------------------------------------------------------

describe('Client-side validation', () => {
  it('shows an error and does not call the API when name is empty', async () => {
    const { user } = setup();
    const nameInput = screen.getByLabelText(/audience name/i);
    await user.clear(nameInput);
    await user.click(screen.getByRole('button', { name: /preview audience/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(mockPreviewAudience).not.toHaveBeenCalled();
  });

  it('shows an error and does not call the API when asOf is invalid', async () => {
    const { user } = setup();
    const asOfInput = screen.getByLabelText(/evaluate as of/i);
    await user.clear(asOfInput);
    await user.type(asOfInput, 'not-a-date');
    await user.click(screen.getByRole('button', { name: /preview audience/i }));

    await screen.findByText(/valid iso 8601/i);
    expect(mockPreviewAudience).not.toHaveBeenCalled();
  });

  it('shows error when count is not a valid integer (decimal input)', async () => {
    // jsdom's type=number input strips the minus sign (browser behavior),
    // so we test the same validation path using a decimal value instead.
    // The onChange handler runs Number(e.target.value) which gives NaN for
    // incomplete decimals, and Number.isInteger(NaN) === false.
    const { user } = setup();
    const cond1Group = screen.getByRole('group', { name: 'Condition 1' });
    const countInput = within(cond1Group).getByRole('spinbutton', { name: /^count$/i });
    // Force the React controlled value to a non-integer by firing a change event
    // with a float that the number input accepts (e.g., 1.5).
    // userEvent.type on type=number: after clearing, typing "1.5" is accepted.
    await user.clear(countInput);
    await user.type(countInput, '1.5');
    await user.click(screen.getByRole('button', { name: /preview audience/i }));

    // The validation checks Number.isInteger(count) — 1.5 is not an integer.
    await screen.findByText(/non-negative integer/i);
    expect(mockPreviewAudience).not.toHaveBeenCalled();
  });

  it('shows error when withinDays is zero', async () => {
    const { user } = setup();
    const cond1Group = screen.getByRole('group', { name: 'Condition 1' });
    const withinInput = within(cond1Group).getByRole('spinbutton', { name: /within days/i });
    await user.clear(withinInput);
    await user.type(withinInput, '0');
    await user.click(screen.getByRole('button', { name: /preview audience/i }));

    await screen.findByText(/positive integer/i);
    expect(mockPreviewAudience).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 5. Loading state and duplicate-submission prevention
// ---------------------------------------------------------------------------

describe('Loading state', () => {
  it('disables the submit button while loading and shows loading text', async () => {
    let resolvePreview!: (v: AudiencePreviewResponse) => void;
    mockPreviewAudience.mockReturnValueOnce(
      new Promise<AudiencePreviewResponse>((res) => {
        resolvePreview = res;
      })
    );

    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /preview audience/i }));

    const loadingBtn = await screen.findByRole('button', { name: /previewing/i });
    expect(loadingBtn).toBeDisabled();

    // Resolve and wait for results to appear
    resolvePreview(SUCCESS_RESPONSE);
    await screen.findByText('anon_match_a');
  });

  it('prevents duplicate submissions: button disabled prevents second click', async () => {
    let resolvePreview!: (v: AudiencePreviewResponse) => void;
    mockPreviewAudience.mockReturnValueOnce(
      new Promise<AudiencePreviewResponse>((res) => {
        resolvePreview = res;
      })
    );

    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /preview audience/i }));

    // Verify the button is disabled (can't be clicked again)
    const loadingBtn = await screen.findByRole('button', { name: /previewing/i });
    expect(loadingBtn).toBeDisabled();

    // API should only have been called once
    expect(mockPreviewAudience).toHaveBeenCalledTimes(1);

    resolvePreview(SUCCESS_RESPONSE);
    await screen.findByText('anon_match_a');
  });

  it('disables all form controls while loading', async () => {
    let resolvePreview!: (v: AudiencePreviewResponse) => void;
    mockPreviewAudience.mockReturnValueOnce(
      new Promise<AudiencePreviewResponse>((res) => {
        resolvePreview = res;
      })
    );

    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /preview audience/i }));

    await screen.findByRole('button', { name: /previewing/i });

    // All condition selects should be disabled
    const selects = screen.getAllByRole('combobox');
    for (const s of selects) {
      expect(s).toBeDisabled();
    }

    resolvePreview(SUCCESS_RESPONSE);
    await screen.findByText('anon_match_a');
  });
});

// ---------------------------------------------------------------------------
// 6. Successful preview
// ---------------------------------------------------------------------------

describe('Successful preview', () => {
  it('renders matched user IDs from the API response', async () => {
    mockPreviewAudience.mockResolvedValueOnce(SUCCESS_RESPONSE);
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /preview audience/i }));

    expect(await screen.findByText('anon_match_a')).toBeInTheDocument();
    expect(await screen.findByText('anon_match_b')).toBeInTheDocument();
  });

  it('renders totalMatchedUsers count in the summary', async () => {
    mockPreviewAudience.mockResolvedValueOnce(SUCCESS_RESPONSE);
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /preview audience/i }));

    await screen.findByText('anon_match_a');

    // The summary section shows the total count
    const resultsSection = screen.getByRole('region', { name: /audience preview results/i });
    // totalMatchedUsers = 2, shown as large number
    expect(within(resultsSection).getAllByText('2').length).toBeGreaterThanOrEqual(1);
  });

  it('renders condition evidence with actualCount from the API response', async () => {
    mockPreviewAudience.mockResolvedValueOnce(SUCCESS_RESPONSE);
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /preview audience/i }));

    // anon_match_a has actualCount=3 for product_view — find it in that user's card
    const matchAText = await screen.findByText('anon_match_a');
    const userCard = matchAText.closest('li')!;
    expect(within(userCard).getByText('3')).toBeInTheDocument();
  });

  it('sends the exact request shape the backend expects', async () => {
    mockPreviewAudience.mockResolvedValueOnce(SUCCESS_RESPONSE);
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /preview audience/i }));

    await screen.findByText('anon_match_a');

    expect(mockPreviewAudience).toHaveBeenCalledWith({
      name: 'Viewed but not purchased',
      asOf: '2026-09-29T00:00:00.000Z',
      conditions: [
        { eventType: 'product_view', operator: 'at_least', count: 2, withinDays: 7 },
        { eventType: 'purchase', operator: 'exactly', count: 0, withinDays: 7 },
      ],
    });
  });

  it('does not show error card after a successful response', async () => {
    mockPreviewAudience.mockResolvedValueOnce(SUCCESS_RESPONSE);
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /preview audience/i }));
    await screen.findByText('anon_match_a');

    expect(screen.queryByText(/preview failed/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 7. Empty results
// ---------------------------------------------------------------------------

describe('Empty results', () => {
  it('shows the empty state when totalMatchedUsers is 0', async () => {
    mockPreviewAudience.mockResolvedValueOnce(EMPTY_RESPONSE);
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /preview audience/i }));

    expect(await screen.findByText(/no users matched/i)).toBeInTheDocument();
  });

  it('shows 0 in the summary when the audience is empty', async () => {
    mockPreviewAudience.mockResolvedValueOnce(EMPTY_RESPONSE);
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /preview audience/i }));

    await screen.findByText(/no users matched/i);
    const resultsSection = screen.getByRole('region', { name: /audience preview results/i });
    // Both totalMatchedUsers and matchedAnonymousUsers are 0
    const zeros = within(resultsSection).getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(1);
  });

  it('does not render any user list items when the audience is empty', async () => {
    mockPreviewAudience.mockResolvedValueOnce(EMPTY_RESPONSE);
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /preview audience/i }));

    await screen.findByText(/no users matched/i);
    expect(screen.queryByTitle('anon_match_a')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 8. API validation error (4xx from backend)
// ---------------------------------------------------------------------------

describe('API validation error', () => {
  it('shows the error card with the backend message', async () => {
    const err = new ApiError(400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        details: [
          { field: 'conditions.0.count', message: 'count must be greater than or equal to 0' },
        ],
      },
    });
    mockPreviewAudience.mockRejectedValueOnce(err);

    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /preview audience/i }));

    expect(await screen.findByText(/preview failed/i)).toBeInTheDocument();
    expect(screen.getByText(/invalid request payload/i)).toBeInTheDocument();
    expect(screen.getByText(/conditions.0.count/i)).toBeInTheDocument();
  });

  it('does not show results when the API returns an error', async () => {
    const err = new ApiError(400, {
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request payload' },
    });
    mockPreviewAudience.mockRejectedValueOnce(err);

    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /preview audience/i }));

    await screen.findByText(/preview failed/i);
    expect(screen.queryByRole('region', { name: /audience preview results/i })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 9. Network / server failure and retry
// ---------------------------------------------------------------------------

describe('Network failure and retry', () => {
  it('shows error card on network failure', async () => {
    mockPreviewAudience.mockRejectedValueOnce(
      new Error('Network error: could not reach the backend.')
    );

    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /preview audience/i }));

    expect(await screen.findByText(/preview failed/i)).toBeInTheDocument();
    expect(screen.getByText(/network error/i)).toBeInTheDocument();
  });

  it('shows a Retry button after a network failure', async () => {
    mockPreviewAudience.mockRejectedValueOnce(
      new Error('Network error: could not reach the backend.')
    );

    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /preview audience/i }));

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('retry calls the API again and shows results on success', async () => {
    mockPreviewAudience
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(SUCCESS_RESPONSE);

    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /preview audience/i }));

    // First call fails
    const retryBtn = await screen.findByRole('button', { name: /retry/i });
    await user.click(retryBtn);

    // Second call succeeds
    expect(await screen.findByText('anon_match_a')).toBeInTheDocument();
    expect(mockPreviewAudience).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// 10. Stale results warning after rule change
// ---------------------------------------------------------------------------

describe('Stale results warning', () => {
  it('does not show stale banner before any preview', () => {
    setup();
    expect(screen.queryByText(/rules have changed/i)).not.toBeInTheDocument();
  });

  it('shows a stale results banner when the user edits rules after a preview', async () => {
    mockPreviewAudience.mockResolvedValueOnce(SUCCESS_RESPONSE);
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /preview audience/i }));
    await screen.findByText('anon_match_a');

    // Edit the audience name — should mark as dirty
    const nameInput = screen.getByLabelText(/audience name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Changed Name');

    expect(screen.getByText(/rules have changed/i)).toBeInTheDocument();
  });

  it('removes the stale banner after a fresh preview', async () => {
    mockPreviewAudience.mockResolvedValue(SUCCESS_RESPONSE);
    const { user } = setup();

    // First preview
    await user.click(screen.getByRole('button', { name: /preview audience/i }));
    await screen.findByText('anon_match_a');

    // Edit to trigger stale
    const nameInput = screen.getByLabelText(/audience name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Name');
    expect(screen.getByText(/rules have changed/i)).toBeInTheDocument();

    // Second preview — stale banner should disappear
    await user.click(screen.getByRole('button', { name: /preview audience/i }));
    await screen.findByText('anon_match_a');

    expect(screen.queryByText(/rules have changed/i)).not.toBeInTheDocument();
  });
});
