export default function Avatar({ initials, name, sub }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      {initials ? <span className="avatar-mini">{initials}</span> : null}
      <span>
        <span className="cell-strong">{name}</span>
        {sub ? <div className="cell-muted" style={{ marginTop: 2 }}>{sub}</div> : null}
      </span>
    </span>
  );
}
