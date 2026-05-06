import React, { useCallback, useState } from 'react';
import { BrowserRouter as Router, NavLink, Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import HostList from './pages/HostList';
import JobCreate from './pages/JobCreate';
import JobDetail from './pages/JobDetail';
import JobList from './pages/JobList';
import LogList from './pages/LogList';
import SocialCrawling from './pages/SocialCrawling';

function Toast({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
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
              <span className="nav-icon">□</span> 系统总览
            </NavLink>
            <NavLink to="/jobs">
              <span className="nav-icon">≡</span> 任务管理
            </NavLink>
            <NavLink to="/jobs/create">
              <span className="nav-icon">+</span> 创建任务
            </NavLink>
            <NavLink to="/social">
              <span className="nav-icon">◎</span> 社媒采集
            </NavLink>
            <NavLink to="/hosts">
              <span className="nav-icon">▣</span> 主机管理
            </NavLink>
            <NavLink to="/logs">
              <span className="nav-icon">☰</span> 系统日志
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
            <Route path="/social" element={<SocialCrawling showToast={showToast} />} />
            <Route path="/hosts" element={<HostList showToast={showToast} />} />
            <Route path="/logs" element={<LogList showToast={showToast} />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
