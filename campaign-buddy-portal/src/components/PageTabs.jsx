import { useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { NAV } from '../config/nav';
import { useAuth } from '../context/AuthContext';
import { tabsFor } from '../lib/navTabs';
import { applyDesignationLabel } from '../lib/designationLabel';

// Tabs for pages that share a menu row (config/nav.js `children`): the menu
// stays one level deep and the siblings sit at the top of each page. Real
// links, so every tab keeps its own URL (bookmarks, back button, favorites).
export default function PageTabs() {
  const { persona, designationLabel } = useAuth();
  const { pathname } = useLocation();
  const group = useMemo(() => tabsFor(NAV, persona, pathname), [persona, pathname]);
  if (!group) return null;
  return (
    <nav className="page-tabs" aria-label={`${applyDesignationLabel(group.group, designationLabel)} sections`}>
      {group.tabs.map((t) => (
        <NavLink key={t.path} to={t.path} end className="page-tab" aria-current={t.path === pathname ? 'page' : undefined}>
          {applyDesignationLabel(t.label, designationLabel)}
        </NavLink>
      ))}
    </nav>
  );
}
