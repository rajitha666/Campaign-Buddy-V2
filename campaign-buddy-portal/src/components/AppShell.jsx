import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function AppShell() {
  return (
    <div id="app-shell">
      <Sidebar />
      <div className="main">
        <Topbar />
        <div className="content"><Outlet /></div>
      </div>
    </div>
  );
}
