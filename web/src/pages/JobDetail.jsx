import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { hostApi, imageApi, jobApi } from '../services/api';

export default function JobDetail({ showToast }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('images');
  const [imgPage, setImgPage] = useState(1);
  const [expandModal, setExpandModal] = useState(null);
  const [expandMode, setExpandMode] = useState('local');
  const [expandHostId, setExpandHostId] = useState('');
  const [hosts, setHosts] = useState([]);
  const [expanding, setExpanding] = useState(false);

  useEffect(() => {
    loadData();
    hostApi.list().then(r => setHosts(r.data.data)).catch(() => {});
    const timer = setInterval(loadData, 8000);
    return () => clearInterval(timer);
  }, [id, imgPage]);

  async function loadData() {
    try {
      const res = await jobApi.detail(id, { img_page: imgPage, img_limit: 50 });
      setData(res.data);
    } catch (err) {
      if (err.response?.status === 404) {
        showToast('任务不存在', 'error');
        navigate('/jobs');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleJobAction(action) {
    try {
      if (action === 'pause') await jobApi.pause(id);
      else if (action === 'resume') await jobApi.resume(id);
      else if (action === 'cancel') await jobApi.cancel(id);
      else if (action === 'delete') {
        if (!confirm('确定删除此任务？')) return;
        await jobApi.delete(id);
        navigate('/jobs');
        return;
      }
      showToast('操作成功', 'success');
      loadData();
    } catch (err) {
      showToast(err.response?.data?.error || '操作失败', 'error');
    }
  }

  async function handleExpand() {
    if (!expandModal) return;
    setExpanding(true);
    try {
      await imageApi.expand(expandModal.id, {
        mode: expandMode,
        target_host_id: expandMode === 'manual' ? parseInt(expandHostId, 10) : undefined,
      });
      showToast('扩采任务已创建', 'success');
      setExpandModal(null);
      loadData();
    } catch (err) {
      showToast(err.response?.data?.error || '扩采失败', 'error');
    } finally {
      setExpanding(false);
    }
  }

  if (loading) return <div className="loading">加载中...</div>;
  if (!data) return <div className="empty">加载失败</div>;

  const { job, filters, images, img_total, page_tasks, task_stats } = data;
  const formatMetric = (value) => {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : 0;
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link to="/jobs">任务管理</Link> / {job.name}
          </div>
          <h2>{job.name}</h2>
        </div>
        <div className="action-group">
          {['queued', 'running'].includes(job.status) && (
            <button className="btn btn-warning" onClick={() => handleJobAction('pause')}>暂停</button>
          )}
          {job.status === 'paused' && (
            <button className="btn btn-success" onClick={() => handleJobAction('resume')}>恢复</button>
          )}
          {!['completed', 'cancelled', 'deleted', 'failed'].includes(job.status) && (
            <button className="btn btn-outline" onClick={() => handleJobAction('cancel')}>取消</button>
          )}
          <button className="btn btn-danger" onClick={() => handleJobAction('delete')}>删除</button>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>任务概览</h3></div>
        <div className="info-grid">
          <div className="info-item">
            <label>状态</label>
            <div className="value"><span className={`status-tag status-${job.status}`}>{job.status}</span></div>
          </div>
          <div className="info-item">
            <label>站点类型</label>
            <div className="value"><span className="tag">{job.site_type}</span></div>
          </div>
          <div className="info-item">
            <label>执行主机</label>
            <div className="value">{job.host_name || `Host #${job.host_id}`}</div>
          </div>
          <div className="info-item">
            <label>并发数</label>
            <div className="value">{job.concurrency}</div>
          </div>
          <div className="info-item">
            <label>创建时间</label>
            <div className="value">{dayjs(job.created_at).format('YYYY-MM-DD HH:mm')}</div>
          </div>
          {job.started_at && (
            <div className="info-item">
              <label>开始时间</label>
              <div className="value">{dayjs(job.started_at).format('MM-DD HH:mm')}</div>
            </div>
          )}
          {job.finished_at && (
            <div className="info-item">
              <label>完成时间</label>
              <div className="value">{dayjs(job.finished_at).format('MM-DD HH:mm')}</div>
            </div>
          )}
          <div className="info-item">
            <label>滚动时长</label>
            <div className="value">{job.auto_scroll_seconds}秒 / {job.auto_scroll_max_rounds}轮</div>
          </div>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <div className="stat-card success">
          <div className="stat-value">{img_total || 0}</div>
          <div className="stat-label">采集图片</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-value">{task_stats?.pending || 0}</div>
          <div className="stat-label">待处理页面</div>
        </div>
        <div className="stat-card info">
          <div className="stat-value">{task_stats?.running || 0}</div>
          <div className="stat-label">执行中页面</div>
        </div>
        <div className="stat-card success">
          <div className="stat-value">{task_stats?.success || 0}</div>
          <div className="stat-label">成功页面</div>
        </div>
        <div className="stat-card danger">
          <div className="stat-value">{task_stats?.failed || 0}</div>
          <div className="stat-label">失败页面</div>
        </div>
      </div>

      {filters && (
        <div className="card">
          <div className="card-header"><h3>筛选规则</h3></div>
          <div className="info-grid">
            <div className="info-item"><label>逻辑</label><div className="value">{filters.logic_mode?.toUpperCase()}</div></div>
            {filters.min_like != null && <div className="info-item"><label>最小点赞</label><div className="value">{filters.min_like}</div></div>}
            {filters.min_favorite != null && <div className="info-item"><label>最小收藏</label><div className="value">{filters.min_favorite}</div></div>}
            {filters.min_comment != null && <div className="info-item"><label>最小评论</label><div className="value">{filters.min_comment}</div></div>}
            {filters.min_share != null && <div className="info-item"><label>最小分享</label><div className="value">{filters.min_share}</div></div>}
            {filters.min_width != null && <div className="info-item"><label>最小宽度</label><div className="value">{filters.min_width}px</div></div>}
            {filters.min_height != null && <div className="info-item"><label>最小高度</label><div className="value">{filters.min_height}px</div></div>}
            <div className="info-item"><label>排除视频</label><div className="value">{filters.exclude_video ? '是' : '否'}</div></div>
            <div className="info-item"><label>排除拼图</label><div className="value">{filters.exclude_collage ? '是' : '否'}</div></div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="tabs">
          <div className={`tab ${activeTab === 'images' ? 'active' : ''}`} onClick={() => setActiveTab('images')}>
            图片 ({img_total})
          </div>
          <div className={`tab ${activeTab === 'tasks' ? 'active' : ''}`} onClick={() => setActiveTab('tasks')}>
            页面任务 ({page_tasks?.length || 0})
          </div>
        </div>

        {activeTab === 'images' && (
          <div>
            {images.length === 0 ? (
              <div className="empty">暂无图片</div>
            ) : (
              <>
                <div className="image-grid">
                  {images.map(img => (
                    <div key={img.id} className="image-card">
                      <img
                        src={img.image_url}
                        alt={img.author_name || '图片'}
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                      <div className="image-card-info">
                        {img.author_name && <div style={{ fontWeight: 500 }}>{img.author_name}</div>}
                        <div>
                          {img.width && img.height && `${img.width}x${img.height}`}
                        </div>
                        <div style={{ marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
                          <span>点赞: {formatMetric(img.like_count)}</span>
                          <span>收藏: {formatMetric(img.favorite_count)}</span>
                          <span>评论: {formatMetric(img.comment_count)}</span>
                          <span>分享: {formatMetric(img.share_count)}</span>
                        </div>
                        <div style={{ marginTop: 2 }}>
                          <span className={`status-tag status-${img.expand_status}`} style={{ fontSize: 11 }}>
                            {img.expand_status}
                          </span>
                        </div>
                      </div>
                      <div className="image-card-actions">
                        {img.detail_page_url && img.expand_status === 'not_expanded' && (
                          <button
                            className="btn btn-xs btn-primary"
                            onClick={() => {
                              setExpandModal(img);
                              setExpandMode('local');
                            }}
                          >
                            扩采
                          </button>
                        )}
                        {img.detail_page_url && (
                          <a
                            href={img.detail_page_url}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-xs btn-outline"
                          >
                            详情页
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {img_total > 50 && (
                  <div className="pagination">
                    <button disabled={imgPage <= 1} onClick={() => setImgPage(p => p - 1)}>上一页</button>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      {imgPage} / {Math.ceil(img_total / 50)}
                    </span>
                    <button disabled={imgPage >= Math.ceil(img_total / 50)} onClick={() => setImgPage(p => p + 1)}>下一页</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className="table-container">
            {page_tasks.length === 0 ? (
              <div className="empty">暂无任务记录</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>类型</th>
                    <th>状态</th>
                    <th>优先级</th>
                    <th>重试次数</th>
                    <th>URL</th>
                    <th>创建时间</th>
                    <th>完成时间</th>
                  </tr>
                </thead>
                <tbody>
                  {page_tasks.map(pt => (
                    <tr key={pt.id}>
                      <td>{pt.id}</td>
                      <td><span className="tag">{pt.task_type}</span></td>
                      <td><span className={`status-tag status-${pt.status}`}>{pt.status}</span></td>
                      <td>{pt.priority}</td>
                      <td>{pt.retry_count}</td>
                      <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <a href={pt.target_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--primary)' }}>
                          {pt.target_url}
                        </a>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {dayjs(pt.created_at).format('MM-DD HH:mm')}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {pt.finished_at ? dayjs(pt.finished_at).format('MM-DD HH:mm') : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {expandModal && (
        <div className="modal-overlay" onClick={() => setExpandModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>图片扩采</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              选择扩采方式，系统将对该图片的详情页发起深度采集。
            </p>

            <div className="expand-options">
              {[
                { mode: 'local', title: '本地扩采', desc: '分配给该任务的原始主机执行' },
                { mode: 'auto', title: '自动调度', desc: '负载均衡器自动选择最优主机' },
                { mode: 'manual', title: '手动指定', desc: '手动选择目标主机执行' },
              ].map(opt => (
                <div
                  key={opt.mode}
                  className={`expand-option ${expandMode === opt.mode ? 'selected' : ''}`}
                  onClick={() => setExpandMode(opt.mode)}
                >
                  <h4>{opt.title}</h4>
                  <p>{opt.desc}</p>
                </div>
              ))}
            </div>

            {expandMode === 'manual' && (
              <div className="form-group">
                <label>选择主机</label>
                <select className="form-control" value={expandHostId} onChange={e => setExpandHostId(e.target.value)}>
                  <option value="">-- 选择主机 --</option>
                  {hosts.filter(h => h.status === 'online').map(h => (
                    <option key={h.id} value={h.id}>
                      {h.name} - 运行:{h.running_count}/{h.max_concurrency}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setExpandModal(null)}>取消</button>
              <button className="btn btn-primary" onClick={handleExpand} disabled={expanding}>
                {expanding ? '提交中...' : '确认扩采'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
