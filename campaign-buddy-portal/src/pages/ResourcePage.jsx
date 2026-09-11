import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RESOURCES } from '../config/resources';
import DataTable from '../components/DataTable';
import FilterBar from '../components/FilterBar';
import Drawer from '../components/Drawer';
import CampaignProductsModal from '../components/CampaignProductsModal';
import ErrorState from '../components/ErrorState';
import Loader from '../components/Loader';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiError } from '../lib/apiClient';

export default function ResourcePage({ resourceKey }) {
  const config = RESOURCES[resourceKey];
  const { currentCampaignId, currentCampaign, isAdmin } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  // Single-date filters (convention: key === 'date') default to today so the
  // picker never shows an empty "YYYY-MM-DD". Date ranges stay open.
  const [filterValues, setFilterValues] = useState(() => {
    const init = {};
    (config?.filters || []).forEach((f) => {
      if (f.type === 'date' && f.key === 'date' && f.defaultToday !== false) {
        init[f.key] = new Date().toISOString().slice(0, 10);
      }
    });
    return init;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState('add');
  const [drawerRow, setDrawerRow] = useState(null);
  const [resolvedFields, setResolvedFields] = useState([]);
  const [productsRow, setProductsRow] = useState(null);

  const needsCampaign = !!config?.scopeToCampaign;
  const campaignId = currentCampaignId;

  const load = useCallback(async () => {
    if (!config) return;
    if (needsCampaign && !campaignId) { setRows([]); setTotal(0); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const query = { page, pageSize, search: search || undefined, ...filterValues };
      const res = await config.fetchList({ campaignId, query });
      let data = res?.data || [];
      if (config.hydrate) data = await config.hydrate(data);
      setRows(data);
      setTotal(res?.meta?.total ?? data.length);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load this data.');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, campaignId, page, pageSize, search, JSON.stringify(filterValues)]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, JSON.stringify(filterValues), campaignId]);

  async function openDrawer(mode, row) {
    setDrawerMode(mode);
    // `editValues` lets a resource re-shape a row into form values (e.g. split a
    // startDate/endDate pair back into a dateRange) when opening the edit drawer.
    const initial = mode === 'edit' && row && config.editValues
      ? { id: row.id, ...config.editValues(row) }
      : (mode === 'add' && config.addDefaults ? config.addDefaults(currentCampaign) : row);
    setDrawerRow(initial || null);
    const fields = await Promise.all((config.formFields || []).map(async (f) => {
      if (f.optionsLoader) {
        try { return { ...f, options: await f.optionsLoader() }; }
        catch { return { ...f, options: [] }; }
      }
      return f;
    }));
    setResolvedFields(fields);
    setDrawerOpen(true);
  }

  async function handleSubmit(values) {
    if (drawerMode === 'edit' && config.updateItem) {
      await config.updateItem({ campaignId, id: drawerRow.id, values });
      push('Saved changes');
    } else if (config.createItem) {
      await config.createItem({ campaignId, values });
      push('Added');
    }
    load();
  }

  async function handleAction(action, row) {
    if (action === 'target' && config.targetRoute) { navigate(config.targetRoute(row, campaignId)); return; }
    if (action === 'viewItems') { setProductsRow(row); return; }
    if (action === 'items' && config.itemsRoute) { navigate(config.itemsRoute(row, campaignId)); return; }
    if (action === 'edit') { openDrawer('edit', row); return; }
    if (action === 'view') { push(`Viewing ${row.name || row.displayName || row.id}`); return; }
    if (action === 'delete') {
      if (!config.deleteItem) { push('Delete is not wired up for this resource yet.', 'error'); return; }
      if (!window.confirm('Delete this record? This cannot be undone.')) return;
      try {
        await config.deleteItem({ campaignId, id: row.id });
        push('Deleted');
        load();
      } catch (e) {
        push(e.message || 'Could not delete', 'error');
      }
      return;
    }
    if (config.onRowAction) {
      try {
        await config.onRowAction({ action, row, campaignId });
        push('Updated');
        load();
      } catch (e) {
        push(e.message || 'Could not update', 'error');
      }
    }
  }

  function exportCsv() {
    if (rows.length === 0) return;
    const headers = config.columns.map((c) => c.label);
    const lines = rows.map((r) => config.columns.map((c) => JSON.stringify(String(r[c.key] ?? ''))).join(','));
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${resourceKey}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (!config) return <ErrorState message={`Unknown resource: ${resourceKey}`} />;

  const readOnly = !isAdmin;
  const visibleActions = readOnly ? (config.actions || []).filter((a) => ['view', 'target', 'viewItems'].includes(a)) : (config.actions || []);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{config.title}</h1>
          <p className="page-sub">{config.subtitle}</p>
        </div>
        {!config.noAdd && !readOnly ? (
          <button className="btn btn-primary" onClick={() => openDrawer('add', null)}>+ {config.addLabel || 'Add New'}</button>
        ) : (!config.noAdd && readOnly ? <div className="locked-note">🔒 Read-only in this view</div> : null)}
      </div>

      {needsCampaign && !campaignId ? (
        <ErrorState message="Select a campaign from the top bar to view this data." />
      ) : (
        <>
          <FilterBar
            filters={config.filters}
            values={filterValues}
            onChange={(k, v) => setFilterValues((f) => ({ ...f, [k]: v }))}
            onLoad={load}
          />
          {loading ? <Loader /> : error ? <ErrorState message={error} onRetry={load} /> : (
            <DataTable
              columns={config.columns}
              rows={rows}
              actions={visibleActions}
              onAction={handleAction}
              excel={config.excel}
              onExport={exportCsv}
              page={page} pageSize={pageSize} total={total}
              onPageChange={setPage} onPageSizeChange={setPageSize}
              search={config.noSearch ? undefined : search}
              onSearchChange={config.noSearch ? undefined : setSearch}
              emptyHint={config.emptyHint}
            />
          )}
        </>
      )}

      <Drawer
        open={drawerOpen}
        title={(drawerMode === 'edit' ? 'Edit ' : '') + (config.addLabel || 'Add New')}
        subtitle={config.title}
        fields={resolvedFields}
        initialValues={drawerRow || {}}
        saveLabel={config.saveLabel || 'Save'}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSubmit}
      />

      {config.viewItemsModal === 'campaignProducts' ? (
        <CampaignProductsModal campaign={productsRow} onClose={() => setProductsRow(null)} />
      ) : null}
    </div>
  );
}
