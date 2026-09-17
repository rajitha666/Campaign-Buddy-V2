import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const STORAGE_KEY = 'cb_nav_collapsed';

function loadCollapsed() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

// Below this width the sidebar can't live in the flex layout as a rail (even
// collapsed to icons it eats too much of the screen) — it becomes an
// off-canvas drawer instead, opened by a hamburger button in the topbar.
const PHONE_QUERY = '(max-width: 767px)';
const TABLET_QUERY = '(max-width: 980px)';

function matchesPhone() {
  try { return window.matchMedia(PHONE_QUERY).matches; } catch { return false; }
}

export default function AppShell() {
  const [isPhone, setIsPhone] = useState(matchesPhone);
  const [collapsed, setCollapsed] = useState(() => (matchesPhone() ? false : loadCollapsed()));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const toggleCollapse = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);
  const openMobileNav = useCallback(() => setMobileNavOpen(true), []);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  // Auto-collapse to an icon rail on tablet widths; below phone width the
  // sidebar is hidden entirely and driven by mobileNavOpen instead. Restore
  // the user's stored collapse choice once the viewport widens back out.
  useEffect(() => {
    const mqTablet = window.matchMedia(TABLET_QUERY);
    const mqPhone = window.matchMedia(PHONE_QUERY);
    const apply = () => {
      const phone = mqPhone.matches;
      setIsPhone(phone);
      if (phone) setCollapsed(false);
      else if (mqTablet.matches) setCollapsed(true);
      else setCollapsed(loadCollapsed());
    };
    apply();
    mqTablet.addEventListener('change', apply);
    mqPhone.addEventListener('change', apply);
    return () => {
      mqTablet.removeEventListener('change', apply);
      mqPhone.removeEventListener('change', apply);
    };
  }, []);

  // Widening past phone width while the drawer happens to be open should not
  // leave it "stuck" open once it's no longer an overlay.
  useEffect(() => { if (!isPhone) setMobileNavOpen(false); }, [isPhone]);

  const shellClass = [collapsed ? 'nav-collapsed' : '', mobileNavOpen ? 'mobile-nav-open' : ''].filter(Boolean).join(' ');

  return (
    <div id="app-shell" className={shellClass}>
      {mobileNavOpen ? <div className="mobile-nav-backdrop" onClick={closeMobileNav} /> : null}
      <Sidebar
        collapsed={collapsed}
        isPhone={isPhone}
        onToggleCollapse={isPhone ? closeMobileNav : toggleCollapse}
        onNavigate={closeMobileNav}
      />
      <div className="main">
        <Topbar onOpenMobileNav={openMobileNav} />
        <div className="content"><Outlet /></div>
      </div>
    </div>
  );
}
