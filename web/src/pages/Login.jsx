import React, { useState } from 'react';
import api from '../services/api';

export default function Login({ onAuthenticated }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    sessionStorage.setItem('crawler-admin-token', token.trim());
    try {
      await api.get('/social/meta');
      onAuthenticated();
    } catch (failure) {
      sessionStorage.removeItem('crawler-admin-token');
      setError(failure.response?.status === 401 ? '管理密钥不正确' : '无法连接采集服务');
    } finally { setBusy(false); }
  }
  return (
    <main className="login-page">
      <form onSubmit={submit} className="login-form">
        <h1>分布式图片采集</h1>
        <label htmlFor="admin-token">管理密钥</label>
        <input id="admin-token" className="form-control" type="password" autoComplete="off" required
          value={token} onChange={event => setToken(event.target.value)} />
        {error && <p role="alert" className="social-error">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? '连接中...' : '连接管理端'}</button>
      </form>
    </main>
  );
}
