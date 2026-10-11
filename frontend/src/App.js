import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth, can, TAB_ROUTES } from './context/AuthContext';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import MemberPage from './pages/MemberPage';
import EntryPage from './pages/EntryPage';
import ReportsPage from './pages/ReportsPage';
import ExtrasPage from './pages/ExtrasPage';
import SharesPage from './pages/SharesPage';
import HouseholdPage from './pages/HouseholdPage';
import SettingsPage from './pages/SettingsPage';
import PendingPage from './pages/PendingPage';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" />;
  if (user.status && user.status !== 'approved') return <PendingPage />;
  return children;
}

// Tabs that only show data never get a view-only banner.
const READ_ONLY_TABS = new Set(['dashboard', 'reports']);

// A page in the menu. Sends people without access to the first page they can open,
// and shows a view-only notice (with edit buttons hidden) when they can only look.
function TabPage({ tab, children }) {
  const { user } = useAuth();
  if (tab && !can(user, tab, 'view')) {
    const first = TAB_ROUTES.find(([t]) => can(user, t, 'view'));
    return <Navigate to={first ? first[1] : '/settings/password'} replace />;
  }
  const viewOnly = tab && !READ_ONLY_TABS.has(tab) && !can(user, tab, 'edit');
  return (
    <div className="app-container">
      <Navbar />
      <main className={'main-content' + (viewOnly ? ' view-only' : '')}>
        {viewOnly && <p className="view-only-note">View only. Ask the head of the family if you need to make changes here.</p>}
        {children}
      </main>
    </div>
  );
}

const page = (tab, el) => <ProtectedRoute><TabPage tab={tab}>{el}</TabPage></ProtectedRoute>;

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />
      <Route path="/" element={page('dashboard', <Dashboard />)} />
      <Route path="/member/:id" element={page('dashboard', <MemberPage />)} />
      <Route path="/entry" element={page('entries', <EntryPage />)} />
      <Route path="/reports" element={page('reports', <ReportsPage />)} />
      <Route path="/shares" element={page('shares', <SharesPage />)} />
      <Route path="/extras" element={page('extras', <ExtrasPage />)} />
      <Route path="/home" element={page('home', <HouseholdPage />)} />
      {['/settings', '/settings/:section'].map(path => (
        <Route key={path} path={path} element={page(null, <SettingsPage />)} />
      ))}
      <Route path="/gold-prices" element={<Navigate to="/settings/gold" replace />} />
      <Route path="/family" element={<Navigate to="/settings/family" replace />} />
      <Route path="/password" element={<Navigate to="/settings/password" replace />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
