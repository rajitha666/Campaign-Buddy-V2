import { ICONS } from './Icons';

const ACTION_TITLES = {
  view: 'View', edit: 'Edit', delete: 'Delete', target: 'Targets',
  items: 'Edit products', viewItems: 'View products', approve: 'Approve', decline: 'Decline',
};

// Presentational only — ResourcePage (or any custom page) owns data fetching,
// paging state, and passes rows already resolved to the shape it wants.
export default function DataTable({
  columns, rows, rowKey = 'id',
  actions = [], onAction,
  excel, onExport,
  page = 1, pageSize = 25, total = 0, onPageChange, onPageSizeChange,
  search, onSearchChange,
  emptyTitle = 'Nothing to show yet', emptyHint = 'No data available in table.',
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(page * pageSize, total);

  return (
    <div className="table-card">
      <div className="table-toolbar">
        <div className="entries-select">
          Show
          <select value={pageSize} onChange={(e) => onPageSizeChange?.(Number(e.target.value))}>
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          entries
        </div>
        <div className="toolbar-right">
          {excel ? <button className="btn-excel" onClick={onExport}>⬇ Excel</button> : null}
          {onSearchChange ? (
            <div className="search-box">
              {ICONS.search}
              <input placeholder="Search..." value={search} onChange={(e) => onSearchChange(e.target.value)} />
            </div>
          ) : null}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state"><div className="big">{emptyTitle}</div>{emptyHint}</div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((c) => <th key={c.key}>{c.label}</th>)}
                {actions.length > 0 ? <th>Action</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row[rowKey] ?? JSON.stringify(row)}>
                  {columns.map((c) => <td key={c.key}>{c.render ? c.render(row) : row[c.key]}</td>)}
                  {actions.length > 0 ? (
                    <td>
                      <div className="row-actions">
                        {actions.map((a) => (
                          <div key={a} className={`icon-btn ${a}`} title={ACTION_TITLES[a] || a} onClick={() => onAction?.(a, row)}>
                            {ICONS[a]}
                          </div>
                        ))}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 ? (
        <div className="table-footer">
          <span>Showing {showingFrom} to {showingTo} of {total} entries</span>
          <div className="pager">
            <button disabled={page <= 1} onClick={() => onPageChange?.(page - 1)}>Previous</button>
            <button className="active">{page}</button>
            <button disabled={page >= totalPages} onClick={() => onPageChange?.(page + 1)}>Next</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
