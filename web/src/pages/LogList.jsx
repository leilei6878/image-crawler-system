import React, { useState, useEffect } from 'react';
import { statsApi } from '../services/api';
import dayjs from 'dayjs';

export default function LogList({ showToast }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadLogs();
    const timer = setInterval(loadLogs, 5000);
    return () => clearInterval(timer);
  }, [page, level]);

  async function loadLogs() {
    try {
      const params = { page, limit: 50 };
      if (level) params.level = level;
      const res = await statsApi.logs(params);
      setLogs(res.data.data);
    } catch (err) {
      console.error('加载日志失败:', err);
    } finally {
      setLoading(false);
    }
  }

  const levels = ['', 'info', 'warn', 'error', 'debug'];

  const levelColors = {
    info: '#3b82f6',
    warn: '#f59e0b',
    error: '#ef4444',
    debug: '#94a3b8',
  };

  return (
    <div>
      <div className="page-header">
        <h2>系统日志</h2>
      </div>

      <div className="card">
        <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {levels.map(l => (
            <button key={l} className={`btn btn-sm ${level === l ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => { setLevel(l); setPage(1); }}>
              {l || '全部'}
            </button>
          ))}
        </div>

        {loading ? <div className="loading">加载中...</div> : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 80 }}>级别</th>
                  <th style={{ width: 120 }}>操作</th>
                  <th>消息</th>
                  <th style={{ width: 60 }}>任务ID</th>
                  <th style={{ width: 140 }}>时间</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 12,
                        fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                        background: `${levelColors[log.level] || '#94a3b8'}20`,
                        color: levelColors[log.level] || '#94a3b8',
                      }}>
                        {log.level}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{log.action}</td>
                    <td style={{ fontSize: 13 }}>{log.message}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {log.job_id ? `#${log.job_id}` : '-'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {dayjs(log.created_at).format('MM-DD HH:mm:ss')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {logs.length === 0 && !loading && <div className="empty">暂无日志</div>}

        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>第 {page} 页</span>
          <button disabled={logs.length < 50} onClick={() => setPage(p => p + 1)}>下一页</button>
        </div>
      </div>
    </div>
  );
}
