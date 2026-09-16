export default function Avatar({ initials, name, sub, imageUrl }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={name || ''}
          className="avatar-mini"
          style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        />
      ) : initials ? <span className="avatar-mini">{initials}</span> : null}
      <span>
        <span className="cell-strong">{name}</span>
        {sub ? <div className="cell-muted" style={{ marginTop: 2 }}>{sub}</div> : null}
      </span>
    </span>
  );
}
