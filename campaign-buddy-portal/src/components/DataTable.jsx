import { ICONS } from './Icons';
import EmptyState from './EmptyState';
import { useAuth } from '../context/AuthContext';
import { applyDesignationLabel } from '../lib/designationLabel';

const ACTION_TITLES = {
  view: 'View', edit: 'Edit', delete: 'Delete', target: 'Targets',
  items: 'Edit products', viewItems: 'View products', approve: 'Approve', decline: 'Decline',
  admins: 'Manage campaign admins',
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
  // Optional row selection (e.g. Promoter Tracking: click a row to highlight
  // that promoter's trail on the map above). Unused unless a page passes it.
  onRowClick, selectedRow,
}) {
  const { designationLabel } = useAuth();
  const label = (c) => applyDesignationLabel(c.label, designationLabel);
  const emptyText = { title: applyDesignationLabel(emptyTitle, designationLabel), hint: applyDesignationLabel(emptyHint, designationLabel) };
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(page * pageSize, total);
  // "Show N entries", search and the pager only earn their space once there is
  // more than a short list. An active search always keeps its box visible so it
  // can be cleared. Smallest page-size choice is 10.
  const longList = total > 10;
  const showSearch = !!onSearchChange && (longList || !!search);
  const showPageSize = longList;
  const showToolbar = showPageSize || !!excel || showSearch;
  const activate = (a, row) => (e) => { e.stopPropagation(); onAction?.(a, row); };
  const onKey = (a, row) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(a, row)(e); } };

  return (
    <div className="table-card">
      {showToolbar ? (
        <div className="table-toolbar">
          {showPageSize ? (
            <div className="entries-select">
              Show
              <select value={pageSize} onChange={(e) => onPageSizeChange?.(Number(e.target.value))} aria-label="Rows per page">
                {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              entries
            </div>
          ) : <div />}
          <div className="toolbar-right">
            {excel ? <button className="btn-excel" onClick={onExport}>⬇ Excel</button> : null}
            {showSearch ? (
              <div className="search-box">
                {ICONS.search}
                <input placeholder="Search..." value={search} onChange={(e) => onSearchChange(e.target.value)} aria-label="Search this table" />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title={emptyText.title} hint={emptyText.hint} />
      ) : (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {columns.map((c) => <th key={c.key} className={c.className}>{label(c)}</th>)}
                  {actions.length > 0 ? <th>Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row[rowKey] ?? JSON.stringify(row)}
                    className={onRowClick ? `is-clickable${row === selectedRow ? ' is-selected' : ''}` : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {columns.map((c) => <td key={c.key} className={c.className}>{c.render ? c.render(row) : row[c.key]}</td>)}
                    {actions.length > 0 ? (
                      <td>
                        <div className="row-actions">
                          {actions.map((a) => (
                            <div key={a} className={`icon-btn ${a}`} role="button" tabIndex={0} title={ACTION_TITLES[a] || a} aria-label={ACTION_TITLES[a] || a} onClick={activate(a, row)} onKeyDown={onKey(a, row)}>
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

          {/* Phone-width fallback for the table above — CSS toggles which one
              shows (see .table-cards / .table-scroll in app.css). Rendered
              unconditionally rather than behind a resize listener since these
              are presentational-only, page-capped lists. */}
          <div className="table-cards">
            {rows.map((row) => (
              <div
                className={`data-card${onRowClick ? ' is-clickable' : ''}${row === selectedRow ? ' is-selected' : ''}`}
                key={row[rowKey] ?? JSON.stringify(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <div className="data-card-field" key={c.key}>
                    <span className="data-card-label">{label(c)}</span>
                    <span className="data-card-value">{c.render ? c.render(row) : row[c.key]}</span>
                  </div>
                ))}
                {actions.length > 0 ? (
                  <div className="data-card-actions row-actions">
                    {actions.map((a) => (
                      <div key={a} className={`icon-btn ${a}`} role="button" tabIndex={0} title={ACTION_TITLES[a] || a} aria-label={ACTION_TITLES[a] || a} onClick={activate(a, row)} onKeyDown={onKey(a, row)}>
                        {ICONS[a]}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}

      {rows.length > 0 ? (
        <div className="table-footer">
          <span>Showing {showingFrom} to {showingTo} of {total} entries</span>
          {totalPages > 1 ? (
            <div className="pager">
              <button disabled={page <= 1} onClick={() => onPageChange?.(page - 1)}>Previous</button>
              <button className="active" aria-current="page">{page}</button>
              <button disabled={page >= totalPages} onClick={() => onPageChange?.(page + 1)}>Next</button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
