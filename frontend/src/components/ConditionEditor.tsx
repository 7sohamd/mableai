import type { AudienceCondition, EventType, ConditionOperator } from '../contracts/audiencePreview';
import styles from './ConditionEditor.module.css';

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  page_view: 'Page View',
  product_view: 'Product View',
  add_to_cart: 'Add to Cart',
  checkout_started: 'Checkout Started',
  purchase: 'Purchase',
};

const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  at_least: 'At least',
  exactly: 'Exactly',
};

const EVENT_TYPES: EventType[] = [
  'page_view',
  'product_view',
  'add_to_cart',
  'checkout_started',
  'purchase',
];

const OPERATORS: ConditionOperator[] = ['at_least', 'exactly'];

export interface ConditionValidationErrors {
  count?: string;
  withinDays?: string;
}

interface ConditionEditorProps {
  index: number;
  condition: AudienceCondition;
  errors: ConditionValidationErrors;
  canRemove: boolean;
  onChange: (index: number, updated: AudienceCondition) => void;
  onRemove: (index: number) => void;
  /** True when a preview is in-flight — disables all inputs */
  disabled: boolean;
}

export function ConditionEditor({
  index,
  condition,
  errors,
  canRemove,
  onChange,
  onRemove,
  disabled,
}: ConditionEditorProps) {
  const idPrefix = `cond-${index}`;

  function update(patch: Partial<AudienceCondition>) {
    onChange(index, { ...condition, ...patch });
  }

  return (
    <div className={styles.wrapper} role="group" aria-label={`Condition ${index + 1}`}>
      <div className={styles.header}>
        <span className={styles.conditionLabel}>Condition {index + 1}</span>
        {canRemove && (
          <button
            type="button"
            className={styles.removeBtn}
            onClick={() => onRemove(index)}
            disabled={disabled}
            aria-label={`Remove condition ${index + 1}`}
          >
            Remove
          </button>
        )}
      </div>

      <div className={styles.fields}>
        {/* Event type */}
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-event-type`} className={styles.label}>
            Event type
          </label>
          <select
            id={`${idPrefix}-event-type`}
            className={styles.select}
            value={condition.eventType}
            disabled={disabled}
            onChange={(e) => update({ eventType: e.target.value as EventType })}
          >
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EVENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        {/* Operator */}
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-operator`} className={styles.label}>
            Operator
          </label>
          <select
            id={`${idPrefix}-operator`}
            className={styles.select}
            value={condition.operator}
            disabled={disabled}
            onChange={(e) => update({ operator: e.target.value as ConditionOperator })}
          >
            {OPERATORS.map((op) => (
              <option key={op} value={op}>
                {OPERATOR_LABELS[op]}
              </option>
            ))}
          </select>
        </div>

        {/* Count */}
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-count`} className={styles.label}>
            Count
          </label>
          <input
            id={`${idPrefix}-count`}
            type="number"
            className={`${styles.input} ${errors.count ? styles.inputError : ''}`}
            value={condition.count}
            min={0}
            step={1}
            disabled={disabled}
            aria-describedby={errors.count ? `${idPrefix}-count-err` : undefined}
            onChange={(e) => update({ count: Number(e.target.value) })}
          />
          {errors.count && (
            <span id={`${idPrefix}-count-err`} className={styles.errorMsg} role="alert">
              {errors.count}
            </span>
          )}
        </div>

        {/* Within days */}
        <div className={styles.field}>
          <label htmlFor={`${idPrefix}-within-days`} className={styles.label}>
            Within days
          </label>
          <input
            id={`${idPrefix}-within-days`}
            type="number"
            className={`${styles.input} ${errors.withinDays ? styles.inputError : ''}`}
            value={condition.withinDays}
            min={1}
            step={1}
            disabled={disabled}
            aria-describedby={errors.withinDays ? `${idPrefix}-within-days-err` : undefined}
            onChange={(e) => update({ withinDays: Number(e.target.value) })}
          />
          {errors.withinDays && (
            <span id={`${idPrefix}-within-days-err`} className={styles.errorMsg} role="alert">
              {errors.withinDays}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
