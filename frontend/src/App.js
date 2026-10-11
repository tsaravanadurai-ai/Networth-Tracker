import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
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

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />
      <Route path="/" element={
        <ProtectedRoute>
          <div className="app-container">
            <Navbar />
            <main className="main-content"><Dashboard /></main>
          </div>
        </ProtectedRoute>
      } />
      <Route path="/member/:id" element={
        <ProtectedRoute>
          <div className="app-container">
            <Navbar />
            <main className="main-content"><MemberPage /></main>
          </div>
        </ProtectedRoute>
      } />
      <Route path="/entry" element={
        <ProtectedRoute>
          <div className="app-container">
            <Navbar />
            <main className="main-content"><EntryPage /></main>
          </div>
        </ProtectedRoute>
      } />
      <Route path="/reports" element={
        <ProtectedRoute>
          <div className="app-container">
            <Navbar />
            <main className="main-content"><ReportsPage /></main>
          </div>
        </ProtectedRoute>
      } />
      <Route path="/shares" element={
        <ProtectedRoute>
          <div className="app-container">
            <Navbar />
            <main className="main-content"><SharesPage /></main>
          </div>
        </ProtectedRoute>
      } />
      <Route path="/extras" element={
        <ProtectedRoute>
          <div className="app-container">
            <Navbar />
            <main className="main-content"><ExtrasPage /></main>
          </div>
        </ProtectedRoute>
      } />
      <Route path="/home" element={
        <ProtectedRoute>
          <div className="app-container">
            <Navbar />
            <main className="main-content"><HouseholdPage /></main>
          </div>
        </ProtectedRoute>
      } />
      {['/settings', '/settings/:section'].map(path => (
        <Route key={path} path={path} element={
          <ProtectedRoute>
            <div className="app-container">
              <Navbar />
              <main className="main-content"><SettingsPage /></main>
            </div>
          </ProtectedRoute>
        } />
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
