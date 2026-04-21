import React, { useState, useEffect } from 'react';
import { hostApi } from '../services/api';
import dayjs from 'dayjs';

const defaultForm = {
  name: '', host_key: '', max_concurrency: 5,
  accept_global_expand: true, supported_sites: [], host_tags: [], remark: ''
};

export default function HostList({ showToast }) {
  const [hosts, setHosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editHost, setEditHost] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [submitting, setSubmitting] = useState(false);

  const siteOptions = ['pinterest', 'behance', 'unsplash', 'dribbble', 'generic'];
  const tagOptions = ['general', 'high-perf', 'test', 'proxy'];

  useEffect(() => {
    loadHosts();
    const timer = setInterval(loadHosts, 10000);
    return () => clearInterval(timer);
  }, []);

  async function loadHosts() {
    try {
      const res = await hostApi.list();
      setHosts(res.data.data);
    } catch (err) {
      console.error('加载主机失败:', err);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditHost(null);
    setForm(defaultForm);
    setShowModal(true);
  }

  function openEdit(host) {
    setEditHost(host);
    setForm({
      name: host.name,
      host_key: host.host_key,
      max_concurrency: host.max_concurrency,
      accept_global_expand: host.accept_global_expand,
      supported_sites: Array.isArray(host.supported_sites)
        ? host.supported_sites
        : (typeof host.supported_sites === 'string' ? JSON.parse(host.supported_sites || '[]') : []),
      host_tags: Array.isArray(host.host_tags)
        ? host.host_tags
        : (typeof host.host_tags === 'string' ? JSON.parse(host.host_tags || '[]') : []),
      remark: host.remark || ''
    });
    setShowModal(true);
  }

  function updateForm(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function toggleArrayItem(field, item) {
    setForm(prev => {
      const arr = prev[field] || [];
      return {
        ...prev,
        [field]: arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item]
      };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return showToast('请输入主机名称', 'error');
    if (!editHost && !form.host_key.trim()) return showToast('请输入主机密钥', 'error');

    setSubmitting(true);
    try {
      if (editHost) {
        await hostApi.update(editHost.id, {
          name: form.name,
          max_concurrency: parseInt(form.max_concurrency),
          accept_global_expand: form.accept_global_expand,
          supported_sites: form.supported_sites,
          host_tags: form.host_tags,
          remark: form.remark
        });
        showToast('主机更新成功', 'success');
      } else {
        await hostApi.create({
          name: form.name,
          host_key: form.host_key,
          max_concurrency: parseInt(form.max_concurrency),
          accept_global_expand: form.accept_global_expand,
          supported_sites: form.supported_sites,
          host_tags: form.host_tags,
          remark: form.remark
        });
        showToast('主机创建成功', 'success');
      }
      setShowModal(false);
      loadHosts();
    } catch (err) {
      showToast(err.response?.data?.error || '操作失败', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(host) {
    const newStatus = host.status === 'disabled' ? 'offline' : 'disabled';
    try {
      await hostApi.update(host.id, { status: newStatus });
      showToast(newStatus === 'disabled' ? '主机已禁用' : '主机已启用', 'success');
      loadHosts();
    } catch (err) {
      showToast('操作失败', 'error');
    }
  }

  async function handleDeleteHost(host) {
    if (!confirm(`确定删除主机“${host.name}”吗？如果对应 worker 还在运行，它会再次自动注册。`)) return;
    try {
      await hostApi.delete(host.id);
      showToast('主机已删除', 'success');
      loadHosts();
    } catch (err) {
      showToast(err.response?.data?.error || '删除主机失败', 'error');
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>主机管理</h2>
        <button className="btn btn-primary" onClick={openCreate}>+ 添加主机</button>
      </div>

      {loading ? <div className="loading">加载中...</div> : (
        <>
          {hosts.length === 0 ? (
            <div className="card"><div className="empty">暂无主机，点击右上角添加</div></div>
          ) : (
            <div className="host-grid">
              {hosts.map(host => {
                const loadRate = host.max_concurrency > 0
                  ? Math.round((host.running_count / host.max_concurrency) * 100) : 0;
                return (
                  <div key={host.id} className="host-card">
                    <div className="host-card-header">
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{host.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                          #{host.id} · {host.ip_info || '未知IP'}
                        </div>
                      </div>
                      <span className={`status-tag status-${host.status}`}>{host.status}</span>
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span>负载 {host.running_count}/{host.max_concurrency}</span>
                        <span style={{ color: loadRate > 80 ? 'var(--danger)' : 'var(--text-muted)' }}>
                          {loadRate}%
                        </span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill"
                          style={{
                            width: `${Math.min(loadRate, 100)}%`,
                            background: loadRate > 80 ? 'var(--danger)' : loadRate > 50 ? 'var(--warning)' : 'var(--success)'
                          }} />
                      </div>
                    </div>

                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                      <div>待处理: {host.pending_count} · 最大并发: {host.max_concurrency}</div>
                      <div>接受全局扩采: {host.accept_global_expand ? '是' : '否'}</div>
                      {host.last_heartbeat_at && (
                        <div>最后心跳: {dayjs(host.last_heartbeat_at).format('HH:mm:ss')}</div>
                      )}
                      {host.remark && <div style={{ marginTop: 4, fontStyle: 'italic' }}>{host.remark}</div>}
                    </div>

                    {(() => {
                      let sites = host.supported_sites;
                      if (typeof sites === 'string') { try { sites = JSON.parse(sites); } catch { sites = []; } }
                      return sites && sites.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          {sites.map(s => <span key={s} className="tag" style={{ margin: '2px' }}>{s}</span>)}
                        </div>
                      );
                    })()}

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn btn-xs btn-outline" onClick={() => openEdit(host)}>编辑</button>
                      <button className={`btn btn-xs ${host.status === 'disabled' ? 'btn-success' : 'btn-warning'}`}
                        onClick={() => toggleStatus(host)}>
                        {host.status === 'disabled' ? '启用' : '禁用'}
                      </button>
                      <button className="btn btn-xs btn-danger" onClick={() => handleDeleteHost(host)}>删除</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{editHost ? '编辑主机' : '添加主机'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>主机名称 <span className="required">*</span></label>
                  <input className="form-control" value={form.name}
                    onChange={e => updateForm('name', e.target.value)}
                    placeholder="如: CloudServer-A" />
                </div>
                <div className="form-group">
                  <label>主机密钥 <span className="required">*</span></label>
                  <input className="form-control" value={form.host_key}
                    onChange={e => updateForm('host_key', e.target.value)}
                    disabled={!!editHost}
                    placeholder="唯一标识符，创建后不可修改" />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>最大并发数</label>
                  <input type="number" className="form-control" value={form.max_concurrency}
                    onChange={e => updateForm('max_concurrency', e.target.value)} min={1} max={50} />
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={form.accept_global_expand}
                      onChange={e => updateForm('accept_global_expand', e.target.checked)} />
                    接受全局扩采任务
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label>支持站点</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  {siteOptions.map(s => (
                    <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                      <input type="checkbox"
                        checked={(form.supported_sites || []).includes(s)}
                        onChange={() => toggleArrayItem('supported_sites', s)} />
                      {s}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>标签</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  {tagOptions.map(t => (
                    <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                      <input type="checkbox"
                        checked={(form.host_tags || []).includes(t)}
                        onChange={() => toggleArrayItem('host_tags', t)} />
                      {t}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>备注</label>
                <textarea className="form-control" rows={2} value={form.remark}
                  onChange={e => updateForm('remark', e.target.value)} placeholder="可选" />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>取消</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? '提交中...' : (editHost ? '保存更改' : '创建主机')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
