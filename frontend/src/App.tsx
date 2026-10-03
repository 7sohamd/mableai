import { useState, useId } from 'react';
import styles from './App.module.css';
import { ConditionEditor, type ConditionValidationErrors } from './components/ConditionEditor';
import { PreviewResults } from './components/PreviewResults';
import { previewAudience, ApiError } from './api/audienceApi';
import type { AudienceCondition, AudiencePreviewResponse } from './contracts/audiencePreview';
import { config } from './config/env';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_AS_OF = '2026-09-29T00:00:00.000Z';

function defaultCondition(): AudienceCondition {
  return { eventType: 'product_view', operator: 'at_least', count: 1, withinDays: 7 };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface FormErrors {
  name?: string;
  asOf?: string;
  conditions: ConditionValidationErrors[];
}

function validate(
  name: string,
  asOf: string,
  conditions: AudienceCondition[]
): FormErrors {
  const errors: FormErrors = { conditions: conditions.map(() => ({})) };

  if (!name.trim()) errors.name = 'Audience name is required.';

  if (!asOf.trim()) {
    errors.asOf = 'Evaluation timestamp is required.';
  } else if (isNaN(Date.parse(asOf))) {
    errors.asOf = 'Must be a valid ISO 8601 timestamp.';
  }

  conditions.forEach((c, i) => {
    const e: ConditionValidationErrors = {};
    if (!Number.isInteger(c.count) || c.count < 0)
      e.count = 'Count must be a non-negative integer.';
    if (!Number.isInteger(c.withinDays) || c.withinDays < 1)
      e.withinDays = 'Within days must be a positive integer.';
    errors.conditions[i] = e;
  });

  return errors;
}

function hasErrors(errors: FormErrors): boolean {
  if (errors.name || errors.asOf) return true;
  return errors.conditions.some((e) => e.count || e.withinDays);
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; result: AudiencePreviewResponse }
  | { status: 'error'; message: string; details?: string[] };

export const App = () => {
  const nameId = useId();
  const asOfId = useId();

  // Form state
  const [name, setName] = useState('Viewed but not purchased');
  const [asOf, setAsOf] = useState(DEFAULT_AS_OF);
  const [conditions, setConditions] = useState<AudienceCondition[]>([
    { eventType: 'product_view', operator: 'at_least', count: 2, withinDays: 7 },
    { eventType: 'purchase', operator: 'exactly', count: 0, withinDays: 7 },
  ]);

  // Validation errors (populated on submit attempt)
  const [errors, setErrors] = useState<FormErrors>({ conditions: [{}, {}] });
  const [submitted, setSubmitted] = useState(false); // show errors after first attempt

  // Preview state
  const [previewState, setPreviewState] = useState<PreviewState>({ status: 'idle' });

  // Whether the user has changed the form since the last successful preview.
  // When true, stale results are visually marked.
  const [isDirty, setIsDirty] = useState(false);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function markDirty() {
    setIsDirty(true);
  }

  function handleNameChange(value: string) {
    setName(value);
    markDirty();
    if (submitted) setErrors((prev) => ({ ...prev, name: value.trim() ? undefined : 'Audience name is required.' }));
  }

  function handleAsOfChange(value: string) {
    setAsOf(value);
    markDirty();
  }

  function handleConditionChange(index: number, updated: AudienceCondition) {
    setConditions((prev) => prev.map((c, i) => (i === index ? updated : c)));
    markDirty();
  }

  function handleAddCondition() {
    setConditions((prev) => [...prev, defaultCondition()]);
    setErrors((prev) => ({ ...prev, conditions: [...prev.conditions, {}] }));
    markDirty();
  }

  function handleRemoveCondition(index: number) {
    setConditions((prev) => prev.filter((_, i) => i !== index));
    setErrors((prev) => ({
      ...prev,
      conditions: prev.conditions.filter((_, i) => i !== index),
    }));
    markDirty();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);

    const errs = validate(name, asOf, conditions);
    setErrors(errs);
    if (hasErrors(errs)) return;

    setPreviewState({ status: 'loading' });
    setIsDirty(false);

    try {
      const result = await previewAudience({ name: name.trim(), asOf, conditions });
      setPreviewState({ status: 'success', result });
    } catch (err) {
      if (err instanceof ApiError) {
        const details = err.payload.error.details?.map(
          (d) => (d.field ? `${d.field}: ${d.message}` : d.message)
        );
        setPreviewState({
          status: 'error',
          message: err.payload.error.message,
          details,
        });
      } else {
        setPreviewState({
          status: 'error',
          message: err instanceof Error ? err.message : 'An unexpected error occurred.',
        });
      }
    }
  }

  async function handleRetry() {
    setPreviewState({ status: 'loading' });
    try {
      const result = await previewAudience({ name: name.trim(), asOf, conditions });
      setPreviewState({ status: 'success', result });
      setIsDirty(false);
    } catch (err) {
      if (err instanceof ApiError) {
        const details = err.payload.error.details?.map(
          (d) => (d.field ? `${d.field}: ${d.message}` : d.message)
        );
        setPreviewState({ status: 'error', message: err.payload.error.message, details });
      } else {
        setPreviewState({
          status: 'error',
          message: err instanceof Error ? err.message : 'An unexpected error occurred.',
        });
      }
    }
  }

  const isLoading = previewState.status === 'loading';

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <div className={styles.brandBadge}>Mable Platform</div>
          <h1 className={styles.title}>Audience Builder</h1>
          <p className={styles.subtitle}>
            Define conditions, preview matching users, and inspect evidence.
          </p>
        </div>
        <div className={styles.apiInfo}>
          API: <code>{config.apiBaseUrl}</code>
        </div>
      </header>

      {/* Builder form */}
      <form onSubmit={handleSubmit} noValidate aria-label="Audience rule builder">
        <div className={styles.formCard}>
          {/* Audience name */}
          <div className={styles.fieldRow}>
            <label htmlFor={nameId} className={styles.fieldLabel}>
              Audience name <span aria-hidden="true" className={styles.required}>*</span>
            </label>
            <input
              id={nameId}
              type="text"
              className={`${styles.textInput} ${submitted && errors.name ? styles.inputError : ''}`}
              value={name}
              disabled={isLoading}
              placeholder="e.g. Viewed but not purchased"
              aria-required="true"
              aria-describedby={submitted && errors.name ? `${nameId}-err` : undefined}
              onChange={(e) => handleNameChange(e.target.value)}
            />
            {submitted && errors.name && (
              <span id={`${nameId}-err`} className={styles.fieldError} role="alert">
                {errors.name}
              </span>
            )}
          </div>

          {/* asOf timestamp */}
          <div className={styles.fieldRow}>
            <label htmlFor={asOfId} className={styles.fieldLabel}>
              Evaluate as of{' '}
              <span className={styles.fieldHint}>(ISO 8601 UTC timestamp)</span>
            </label>
            <input
              id={asOfId}
              type="text"
              className={`${styles.textInput} ${styles.monoInput} ${submitted && errors.asOf ? styles.inputError : ''}`}
              value={asOf}
              disabled={isLoading}
              placeholder="2026-09-29T00:00:00.000Z"
              aria-describedby={submitted && errors.asOf ? `${asOfId}-err` : undefined}
              onChange={(e) => handleAsOfChange(e.target.value)}
            />
            {submitted && errors.asOf && (
              <span id={`${asOfId}-err`} className={styles.fieldError} role="alert">
                {errors.asOf}
              </span>
            )}
          </div>
        </div>

        {/* Conditions */}
        <div className={styles.conditionsSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Conditions</h2>
            <span className={styles.sectionSubtitle}>All conditions must be satisfied (AND)</span>
          </div>

          <div className={styles.conditionList}>
            {conditions.map((cond, i) => (
              <ConditionEditor
                key={i}
                index={i}
                condition={cond}
                errors={submitted ? (errors.conditions[i] ?? {}) : {}}
                canRemove={conditions.length > 1}
                onChange={handleConditionChange}
                onRemove={handleRemoveCondition}
                disabled={isLoading}
              />
            ))}
          </div>

          <button
            type="button"
            className={styles.addConditionBtn}
            onClick={handleAddCondition}
            disabled={isLoading}
          >
            + Add condition
          </button>
        </div>

        {/* Submit */}
        <div className={styles.submitRow}>
          <button
            type="submit"
            className={styles.previewBtn}
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isLoading ? (
              <>
                <span className={styles.spinner} aria-hidden="true" />
                Previewing…
              </>
            ) : (
              'Preview audience'
            )}
          </button>

          {isLoading && (
            <span role="status" className={styles.loadingAnnounce}>
              Fetching audience preview…
            </span>
          )}
        </div>
      </form>

      {/* Error state */}
      {previewState.status === 'error' && (
        <div className={styles.errorCard} role="alert">
          <div className={styles.errorCardHeader}>
            <span className={styles.errorIcon} aria-hidden="true">⚠</span>
            <strong>Preview failed</strong>
          </div>
          <p className={styles.errorMessage}>{previewState.message}</p>
          {previewState.details && previewState.details.length > 0 && (
            <ul className={styles.errorDetails}>
              {previewState.details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
          <button type="button" className={styles.retryBtn} onClick={handleRetry}>
            Retry
          </button>
        </div>
      )}

      {/* Results */}
      {previewState.status === 'success' && (
        <div className={isDirty ? styles.staleWrapper : undefined}>
          {isDirty && (
            <div className={styles.staleBanner} role="status">
              ⚡ Rules have changed — results below may be out of date. Run another preview to refresh.
            </div>
          )}
          <PreviewResults result={previewState.result} />
        </div>
      )}
    </div>
  );
};

export default App;
