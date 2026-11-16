export interface KeyValueProps {
  label: string;
  value: string;
  mono?: boolean;
}

/** Label/value row for summaries inside panels and dialogs. */
export function KeyValue({ label, value, mono = false }: KeyValueProps) {
  return (
    <dl className="ds-key-value">
      <dt>{label}</dt>
      <dd className={mono ? "ds-key-value__value--mono" : undefined}>{value}</dd>
    </dl>
  );
}
