export default function ErrorState({ message, onRetry }) {
  return (
    <div className="error-state">
      {message || 'Something went wrong loading this data.'}
      {onRetry ? (
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={onRetry}>Retry</button>
        </div>
      ) : null}
    </div>
  );
}
