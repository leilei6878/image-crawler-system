import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { jobApi } from '../services/api';
import dayjs from 'dayjs';

export default function JobList({ showToast }) {
  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadJobs();
    const timer = setInterval(loadJobs, 8000);
    return () => clearInterval(timer);
  }, [page, statusFilter]);

  async function loadJobs() {
    try {
      const params = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      const res = await jobApi.list(params);
      setJobs(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      showToast('加载任务列表失败', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(id, action) {
    try {
      if (action === 'pause') await jobApi.pause(id);
      else if (action === 'resume') await jobApi.resume(id);
      else if (action === 'cancel') await jobApi.cancel(id);
      else if (action === 'delete') {
        if (!confirm('确定要删除此任务吗？')) return;
        await jobApi.delete(id);
      }
      showToast('操作成功', 'success');
      loadJobs();
    } catch (err) {
      showToast(err.response?.data?.error || '操作失败', 'error');
    }
  }

  const statuses = ['', 'queued', 'running', 'paused', 'completed', 'failed', 'cancelled', 'scheduled'];

  return (
    <div>
      <div className="page-header">
        <h2>任务管理</h2>
        <Link to="/jobs/create" className="btn btn-primary">+ 创建任务</Link>
      </div>

      <div className="card">
        <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {statuses.map(s => (
            <button key={s} className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => { setStatusFilter(s); setPage(1); }}>
              {s || '全部'}
            </button>
          ))}
        </div>

        {loading ? <div className="loading">加载中...</div> : (
          <>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>ID</th><th>任务名称</th><th>站点</th><th>主机</th>
                    <th>状态</th><th>并发</th><th>图片数</th>
                    <th>待处理</th><th>运行中</th><th>失败</th>
                    <th>创建时间</th><th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map(job => (
                    <tr key={job.id}>
                      <td>{job.id}</td>
                      <td>
                        <Link to={`/jobs/${job.id}`} style={{ color: 'var(--primary)', fontWeight: 500 }}>
                          {job.name}
                        </Link>
                      </td>
                      <td><span className="tag">{job.site_type}</span></td>
                      <td>{job.host_name || '-'}</td>
                      <td><span className={`status-tag status-${job.status}`}>{job.status}</span></td>
                      <td>{job.concurrency}</td>
                      <td style={{ fontWeight: 600 }}>{job.image_count || 0}</td>
                      <td>{job.pending_tasks || 0}</td>
                      <td>{job.running_tasks || 0}</td>
                      <td style={{ color: job.failed_tasks > 0 ? 'var(--danger)' : 'inherit' }}>
                        {job.failed_tasks || 0}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {dayjs(job.created_at).format('MM-DD HH:mm')}
                      </td>
                      <td>
                        <div className="action-group">
                          {['queued', 'running'].includes(job.status) && (
                            <button className="btn btn-xs btn-warning" onClick={() => handleAction(job.id, 'pause')}>暂停</button>
                          )}
                          {job.status === 'paused' && (
                            <button className="btn btn-xs btn-success" onClick={() => handleAction(job.id, 'resume')}>恢复</button>
                          )}
                          {!['completed', 'cancelled', 'deleted', 'failed'].includes(job.status) && (
                            <button className="btn btn-xs btn-outline" onClick={() => handleAction(job.id, 'cancel')}>取消</button>
                          )}
                          <button className="btn btn-xs btn-danger" onClick={() => handleAction(job.id, 'delete')}>删除</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {jobs.length === 0 && <div className="empty">暂无任务</div>}

            {total > 20 && (
              <div className="pagination">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  第 {page} 页 / 共 {Math.ceil(total / 20)} 页
                </span>
                <button disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)}>下一页</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
