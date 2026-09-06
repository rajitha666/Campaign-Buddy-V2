export default function Badge({ type = 'muted', children }) {
  return <span className={`badge ${type}`}>{children}</span>;
}
