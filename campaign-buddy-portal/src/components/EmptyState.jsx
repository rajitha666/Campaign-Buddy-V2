export default function EmptyState({ title = 'Nothing to show yet', hint }) {
  return (
    <div className="empty-state">
      <div className="big">{title}</div>
      {hint}
    </div>
  );
}
