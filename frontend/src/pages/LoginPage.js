import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [familyCode, setFamilyCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, signup } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (isSignUp && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        await signup(username, password, familyCode);
      } else {
        await login(username, password);
      }
    } catch (err) {
      setError(err.response?.data?.error || (isSignUp ? 'Sign up failed. Please try again.' : 'Invalid credentials. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setError('');
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Family Net Worth</h1>
        <p className="subtitle">{isSignUp ? 'Create your account' : 'Track your family\'s financial growth'}</p>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              type="text"
              className="form-control"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isSignUp ? 'Min 6 characters' : 'Enter your password'}
            />
          </div>
          {isSignUp && (
            <div className="form-group">
              <label className="form-label">Confirm Password</label>
              <input
                type="password"
                className="form-control"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
              />
            </div>
          )}
          {isSignUp && (
            <div className="form-group">
              <label className="form-label" htmlFor="family-code">Family code</label>
              <input
                id="family-code"
                type="text"
                className="form-control"
                value={familyCode}
                onChange={(e) => setFamilyCode(e.target.value.toUpperCase())}
                placeholder="Ask the head of your family"
                autoCapitalize="characters"
                autoComplete="off"
                style={{ letterSpacing: '0.15em', fontWeight: 600 }}
              />
              <p style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: '0.35rem' }}>
                After you sign up, the head of the family approves your request before you can see anything.
              </p>
            </div>
          )}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? (isSignUp ? 'Creating account...' : 'Signing in...') : (isSignUp ? 'Sign Up' : 'Sign In')}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.9rem', color: 'var(--gray-500)' }}>
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <span onClick={toggleMode} style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: '600' }}>
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </span>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
