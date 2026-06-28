import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import MemberPage from './pages/MemberPage';
import EntryPage from './pages/EntryPage';
import ReportsPage from './pages/ReportsPage';
import GoldPricePage from './pages/GoldPricePage';
import ExtrasPage from './pages/ExtrasPage';

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
      <Route path="/gold-prices" element={
        <ProtectedRoute>
          <div className="app-container">
            <Navbar />
            <main className="main-content"><GoldPricePage /></main>
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
