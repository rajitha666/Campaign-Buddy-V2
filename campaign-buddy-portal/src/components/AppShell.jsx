import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const STORAGE_KEY = 'cb_nav_collapsed';

function loadCollapsed() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(loadCollapsed);

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Auto-collapse on narrow viewports; restore the stored choice when it widens.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 980px)');
    const apply = () => { if (mq.matches) setCollapsed(true); else setCollapsed(loadCollapsed()); };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return (
    <div id="app-shell" className={collapsed ? 'nav-collapsed' : ''}>
      <Sidebar collapsed={collapsed} onToggleCollapse={toggle} />
      <div className="main">
        <Topbar />
        <div className="content"><Outlet /></div>
      </div>
    </div>
  );
}
