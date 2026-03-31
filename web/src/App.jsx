import React, { useState, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import JobList from './pages/JobList';
import JobCreate from './pages/JobCreate';
import JobDetail from './pages/JobDetail';
import HostList from './pages/HostList';
import LogList from './pages/LogList';

function Toast({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
      ))}
    </div>
  );
}

export default function App() {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  return (
    <Router>
      <div className="app-layout">
        <aside className="sidebar">
          <div className="sidebar-header">
            <h1>采集调度系统</h1>
            <p>分布式图片采集平台</p>
          </div>
          <nav className="sidebar-nav">
            <NavLink to="/" end>
              <span className="nav-icon">▪</span> 系统总览
            </NavLink>
            <NavLink to="/jobs">
              <span className="nav-icon">▶</span> 任务管理
            </NavLink>
            <NavLink to="/jobs/create">
              <span className="nav-icon">+</span> 创建任务
            </NavLink>
            <NavLink to="/hosts">
              <span className="nav-icon">⚙</span> 主机管理
            </NavLink>
            <NavLink to="/logs">
              <span className="nav-icon">≡</span> 系统日志
            </NavLink>
          </nav>
        </aside>

        <main className="main-content">
          <Toast toasts={toasts} />
          <Routes>
            <Route path="/" element={<Dashboard showToast={showToast} />} />
            <Route path="/jobs" element={<JobList showToast={showToast} />} />
            <Route path="/jobs/create" element={<JobCreate showToast={showToast} />} />
            <Route path="/jobs/:id" element={<JobDetail showToast={showToast} />} />
            <Route path="/hosts" element={<HostList showToast={showToast} />} />
            <Route path="/logs" element={<LogList showToast={showToast} />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
