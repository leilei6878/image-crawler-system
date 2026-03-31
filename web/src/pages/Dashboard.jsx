import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { statsApi, jobApi, hostApi } from '../services/api';

export default function Dashboard({ showToast }) {
  const [stats, setStats] = useState(null);
  const [recentJobs, setRecentJobs] = useState([]);
  const [hosts, setHosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 10000);
    return () => clearInterval(timer);
  }, []);

  async function loadData() {
    try {
      const [statsRes, jobsRes, hostsRes] = await Promise.all([
        statsApi.overview(),
        jobApi.list({ limit: 5 }),
        hostApi.list()
      ]);
      setStats(statsRes.data);
      setRecentJobs(jobsRes.data.data);
      setHosts(hostsRes.data.data);
    } catch (err) {
      console.error('加载数据失败:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="loading">加载中...</div>;

  return (
    <div>
      <div className="page-header">
        <h2>系统总览</h2>
      </div>

      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.jobs?.total_jobs || 0}</div>
            <div className="stat-label">总任务数</div>
          </div>
          <div className="stat-card info">
            <div className="stat-value">{stats.jobs?.running_jobs || 0}</div>
            <div className="stat-label">运行中</div>
          </div>
          <div className="stat-card success">
            <div className="stat-value">{stats.jobs?.completed_jobs || 0}</div>
            <div className="stat-label">已完成</div>
          </div>
          <div className="stat-card warning">
            <div className="stat-value">{stats.hosts?.online_hosts || 0}</div>
            <div className="stat-label">在线主机</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.images?.total_images || 0}</div>
            <div className="stat-label">采集图片</div>
          </div>
          <div className="stat-card danger">
            <div className="stat-value">{stats.jobs?.failed_jobs || 0}</div>
            <div className="stat-label">失败任务</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div className="card">
          <div className="card-header">
            <h3>最近任务</h3>
            <Link to="/jobs" className="btn btn-outline btn-sm">查看全部</Link>
          </div>
          {recentJobs.length === 0 ? (
            <div className="empty">暂无任务</div>
          ) : (
            <table>
              <thead>
                <tr><th>任务名</th><th>状态</th><th>图片数</th></tr>
              </thead>
              <tbody>
                {recentJobs.map(job => (
                  <tr key={job.id}>
                    <td><Link to={`/jobs/${job.id}`}>{job.name}</Link></td>
                    <td><span className={`status-tag status-${job.status}`}>{job.status}</span></td>
                    <td>{job.image_count || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3>主机状态</h3>
            <Link to="/hosts" className="btn btn-outline btn-sm">管理主机</Link>
          </div>
          {hosts.length === 0 ? (
            <div className="empty">暂无主机</div>
          ) : (
            <table>
              <thead>
                <tr><th>主机名</th><th>状态</th><th>负载</th><th>待处理</th></tr>
              </thead>
              <tbody>
                {hosts.map(host => (
                  <tr key={host.id}>
                    <td>{host.name}</td>
                    <td><span className={`status-tag status-${host.status}`}>{host.status}</span></td>
                    <td>{host.running_count}/{host.max_concurrency}</td>
                    <td>{host.pending_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {stats?.tasks && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header"><h3>任务队列状态</h3></div>
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="stat-card warning">
              <div className="stat-value">{stats.tasks.pending_tasks || 0}</div>
              <div className="stat-label">待处理</div>
            </div>
            <div className="stat-card info">
              <div className="stat-value">{stats.tasks.running_tasks || 0}</div>
              <div className="stat-label">执行中</div>
            </div>
            <div className="stat-card success">
              <div className="stat-value">{stats.tasks.success_tasks || 0}</div>
              <div className="stat-label">已成功</div>
            </div>
            <div className="stat-card danger">
              <div className="stat-value">{stats.tasks.failed_tasks || 0}</div>
              <div className="stat-label">已失败</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
