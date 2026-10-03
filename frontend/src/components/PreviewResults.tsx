import type { AudiencePreviewResponse, ConditionEvidence } from '../contracts/audiencePreview';
import styles from './PreviewResults.module.css';

interface PreviewResultsProps {
  result: AudiencePreviewResponse;
}

/** Format an ISO 8601 timestamp as a short human-readable date. */
function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return iso;
  }
}

function EvidenceRow({ ev }: { ev: ConditionEvidence }) {
  const windowLabel = `${fmtDate(ev.windowStart)} – ${fmtDate(ev.windowEnd)}`;
  const operatorLabel = ev.operator === 'at_least' ? 'at least' : 'exactly';

  return (
    <div className={styles.evidenceRow}>
      <span className={styles.evidenceType}>{ev.eventType.replace(/_/g, ' ')}</span>
      <span className={styles.evidenceDetail}>
        {operatorLabel} {ev.targetCount} · observed{' '}
        <strong>{ev.actualCount}</strong>
      </span>
      <span className={styles.evidenceWindow}>{windowLabel}</span>
    </div>
  );
}

export function PreviewResults({ result }: PreviewResultsProps) {
  const hasMatches = result.totalMatchedUsers > 0;

  return (
    <section className={styles.wrapper} aria-label="Audience preview results" aria-live="polite">
      {/* Summary bar */}
      <div className={styles.summary}>
        <div className={styles.summaryItem}>
          <span className={styles.summaryValue}>{result.totalMatchedUsers}</span>
          <span className={styles.summaryLabel}>Total matched</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryValue}>{result.matchedAnonymousUsers}</span>
          <span className={styles.summaryLabel}>Anonymous</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryAudienceName}>{result.name}</span>
          <span className={styles.summaryLabel}>
            as of {fmtDate(result.asOf)}
          </span>
        </div>
      </div>

      {/* Empty state */}
      {!hasMatches && (
        <div className={styles.emptyState} role="status">
          <span className={styles.emptyIcon} aria-hidden="true">🔍</span>
          <p className={styles.emptyTitle}>No users matched</p>
          <p className={styles.emptySubtitle}>
            No anonymous users satisfied all conditions in the specified window.
          </p>
        </div>
      )}

      {/* Matched users */}
      {hasMatches && (
        <ul className={styles.userList} aria-label={`${result.totalMatchedUsers} matched users`}>
          {result.matchedUsers.map((user) => (
            <li key={user.userId} className={styles.userCard}>
              <div className={styles.userHeader}>
                <span className={styles.userId} title={user.userId}>
                  {user.userId}
                </span>
                <span className={styles.anonBadge} aria-label="Anonymous user">
                  {user.isAnonymous ? 'Anonymous' : 'Named'}
                </span>
              </div>

              {user.evidence.length > 0 && (
                <div className={styles.evidenceBlock}>
                  <p className={styles.evidenceHeading}>Condition evidence</p>
                  {user.evidence.map((ev) => (
                    <EvidenceRow key={ev.conditionIndex} ev={ev} />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
