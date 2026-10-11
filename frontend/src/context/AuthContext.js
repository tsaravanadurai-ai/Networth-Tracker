import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.get('/auth/verify')
        .then(res => {
          setUser({ username: res.data.username, role: res.data.role, status: res.data.status, token });
        })
        .catch(() => {
          localStorage.removeItem('token');
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    const { token, username: name, role, status } = res.data;
    localStorage.setItem('token', token);
    setUser({ username: name, role, status, token });
    return res.data;
  };

  const signup = async (username, password, familyCode) => {
    const res = await api.post('/auth/signup', { username, password, familyCode });
    const { token, username: name, role, status } = res.data;
    localStorage.setItem('token', token);
    setUser({ username: name, role, status, token });
    return res.data;
  };

  // Re-read role and approval status, e.g. after the head approves a request.
  const refresh = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    const res = await api.get('/auth/verify');
    const next = { username: res.data.username, role: res.data.role, status: res.data.status, token };
    setUser(next);
    return next;
  }, []);

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, refresh, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
