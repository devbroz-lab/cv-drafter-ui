import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import {
  formatFieldPath,
  instructionForPath,
  normalizeApplied,
  normalizeSkipped,
} from "../../lib/fieldEditDisplay";
import type { FieldEditOutcomeState } from "../../lib/types";
import { Button } from "../ui";

function EditActionCard({
  status,
  path,
  instruction,
  previousValue,
  newValue,
  skipReason,
  index,
  reduceMotion,
}: {
  status: "applied" | "skipped";
  path: string;
  instruction?: string;
  previousValue?: string;
  newValue?: string;
  skipReason?: string;
  index: number;
  reduceMotion: boolean;
}) {
  const isApplied = status === "applied";

  return (
    <motion.li
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduceMotion ? 0 : index * 0.04, duration: 0.35 }}
      className={`field-edit-action-card field-edit-action-card--${status}`}
    >
      <div className="field-edit-action-card__head">
        <div className="min-w-0">
          <p className="field-edit-action-card__label">{formatFieldPath(path)}</p>
          <code className="field-edit-action-card__path">{path}</code>
        </div>
        <span className={`field-edit-action-card__badge field-edit-action-card__badge--${status}`}>
          {isApplied ? "Applied" : "Skipped"}
        </span>
      </div>

      {instruction ? (
        <div className="field-edit-action-card__section">
          <p className="field-edit-action-card__section-title">Your request</p>
          <p className="field-edit-action-card__body">{instruction}</p>
        </div>
      ) : null}

      {isApplied && (previousValue || newValue) ? (
        <div className="field-edit-action-card__section">
          <p className="field-edit-action-card__section-title">What changed</p>
          <div className="field-edit-action-card__diff">
            {previousValue ? (
              <div className="field-edit-action-card__diff-col field-edit-action-card__diff-col--before">
                <span className="field-edit-action-card__diff-tag">Before</span>
                <p className="field-edit-action-card__diff-value">{previousValue}</p>
              </div>
            ) : null}
            {newValue ? (
              <div className="field-edit-action-card__diff-col field-edit-action-card__diff-col--after">
                <span className="field-edit-action-card__diff-tag">After</span>
                <p className="field-edit-action-card__diff-value">{newValue}</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {!isApplied && skipReason ? (
        <div className="field-edit-action-card__section">
          <p className="field-edit-action-card__section-title">Why it was skipped</p>
          <p className="field-edit-action-card__body">{skipReason}</p>
        </div>
      ) : null}
    </motion.li>
  );
}

export function FieldEditOutcomePanel({
  outcome,
  canReEdit,
  onDismiss,
  onReEditSkipped,
}: {
  outcome: FieldEditOutcomeState;
  canReEdit: boolean;
  onDismiss: () => void;
  onReEditSkipped: () => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const { result, submitted } = outcome;
  const applied = result.applied.map(normalizeApplied);
  const skipped = result.skipped.map(normalizeSkipped);
  const allSuccess = skipped.length === 0;

  const cards = [
    ...applied.map((item, i) => ({
      key: `applied-${item.path}`,
      status: "applied" as const,
      path: item.path,
      instruction: item.instruction ?? instructionForPath(item.path, submitted),
      previousValue: item.previous_value,
      newValue: item.new_value,
      index: i,
    })),
    ...skipped.map((item, i) => ({
      key: `skipped-${item.path}`,
      status: "skipped" as const,
      path: item.path,
      instruction: instructionForPath(item.path, submitted),
      skipReason: item.reason,
      index: applied.length + i,
    })),
  ];

  return (
    <motion.div
      layout
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="field-edit-outcome"
    >
      <header className="field-edit-outcome__header">
        <p className="field-edit-outcome__eyebrow">Revision summary</p>
        <div className="field-edit-outcome__title-row">
          <h2 className="field-edit-outcome__title">
            {allSuccess ? "Edits saved" : "Some edits need attention"}
          </h2>
          <div className="field-edit-outcome__counts">
            {applied.length > 0 ? (
              <span className="field-edit-outcome__count field-edit-outcome__count--applied">
                {applied.length} applied
              </span>
            ) : null}
            {skipped.length > 0 ? (
              <span className="field-edit-outcome__count field-edit-outcome__count--skipped">
                {skipped.length} skipped
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <p className="field-edit-outcome__lead">
        {allSuccess
          ? "Your changes are in the CV data. The Word file updates after the pipeline finishes rendering."
          : "Applied changes are already saved. Review skipped items below — you can adjust and try again when the session is complete."}
      </p>

      <ul className="field-edit-outcome__list list-none p-0 m-0">
        <AnimatePresence initial={false}>
          {cards.map((card) => (
            <EditActionCard
              key={card.key}
              status={card.status}
              path={card.path}
              instruction={card.instruction}
              previousValue={"previousValue" in card ? card.previousValue : undefined}
              newValue={"newValue" in card ? card.newValue : undefined}
              skipReason={"skipReason" in card ? card.skipReason : undefined}
              index={card.index}
              reduceMotion={reduceMotion}
            />
          ))}
        </AnimatePresence>
      </ul>

      <div className="field-edit-outcome__actions">
        <Button type="button" variant="secondary" className="session-btn-secondary" onClick={onDismiss}>
          Dismiss
        </Button>
        {skipped.length > 0 && canReEdit ? (
          <Button type="button" className="session-btn-refine" onClick={onReEditSkipped}>
            Refine skipped fields
          </Button>
        ) : null}
      </div>
    </motion.div>
  );
}
