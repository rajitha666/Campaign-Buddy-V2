export default function StatCard({ label, value, delta, deltaDirection }) {
  return (
    <div className="stat-card">
      <div className="l">{label}</div>
      <div className="n">{value}</div>
      {delta ? <div className={`delta ${deltaDirection === 'down' ? 'down' : 'up'}`}>{delta}</div> : null}
    </div>
  );
}
