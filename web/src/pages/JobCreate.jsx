import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { jobApi, hostApi } from '../services/api';

export default function JobCreate({ showToast }) {
  const navigate = useNavigate();
  const [hosts, setHosts] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: '',
    site_type: 'pinterest',
    host_id: '',
    initial_urls: '',
    concurrency: 3,
    auto_scroll_seconds: 30,
    auto_scroll_max_rounds: 10,
    page_timeout_seconds: 60,
    max_retry_count: 3,
    max_images: '',
    start_mode: 'immediate',
    scheduled_at: '',
    filter_logic: 'and',
    min_like: '', min_favorite: '', min_comment: '', min_share: '',
    min_width: '', min_height: '', ratio_min: '', ratio_max: '',
    exclude_video: false, exclude_collage: false, only_detail_accessible: false,
  });

  useEffect(() => {
    hostApi.list().then(res => setHosts(res.data.data)).catch(() => {});
  }, []);

  function updateForm(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return showToast('请输入任务名称', 'error');
    if (!form.host_id) return showToast('请选择执行主机', 'error');
    if (!form.initial_urls.trim()) return showToast('请输入入口URL', 'error');

    setSubmitting(true);
    try {
      const urls = form.initial_urls.split('\n').map(u => u.trim()).filter(Boolean);
      const data = {
        name: form.name,
        site_type: form.site_type,
        host_id: parseInt(form.host_id),
        initial_urls: urls,
        concurrency: parseInt(form.concurrency),
        auto_scroll_seconds: parseInt(form.auto_scroll_seconds),
        auto_scroll_max_rounds: parseInt(form.auto_scroll_max_rounds),
        page_timeout_seconds: parseInt(form.page_timeout_seconds),
        max_retry_count: parseInt(form.max_retry_count),
        max_images: form.max_images ? parseInt(form.max_images) : null,
        start_mode: form.start_mode,
        scheduled_at: form.start_mode === 'scheduled' ? form.scheduled_at : null,
        filters: {
          logic_mode: form.filter_logic,
          min_like: form.min_like ? parseInt(form.min_like) : null,
          min_favorite: form.min_favorite ? parseInt(form.min_favorite) : null,
          min_comment: form.min_comment ? parseInt(form.min_comment) : null,
          min_share: form.min_share ? parseInt(form.min_share) : null,
          min_width: form.min_width ? parseInt(form.min_width) : null,
          min_height: form.min_height ? parseInt(form.min_height) : null,
          ratio_min: form.ratio_min ? parseFloat(form.ratio_min) : null,
          ratio_max: form.ratio_max ? parseFloat(form.ratio_max) : null,
          exclude_video: form.exclude_video,
          exclude_collage: form.exclude_collage,
          only_detail_accessible: form.only_detail_accessible,
        }
      };

      const res = await jobApi.create(data);
      showToast('任务创建成功', 'success');
      navigate(`/jobs/${res.data.id}`);
    } catch (err) {
      showToast(err.response?.data?.error || '创建失败', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const siteTypes = ['pinterest', 'behance', 'unsplash', 'dribbble', 'generic'];

  return (
    <div>
      <div className="page-header"><h2>创建采集任务</h2></div>

      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="card-header"><h3>基础信息</h3></div>
          <div className="form-row">
            <div className="form-group">
              <label>任务名称 <span className="required">*</span></label>
              <input className="form-control" value={form.name}
                onChange={e => updateForm('name', e.target.value)}
                placeholder="如: Pinterest宠物图片采集" />
            </div>
            <div className="form-group">
              <label>站点类型 <span className="required">*</span></label>
              <select className="form-control" value={form.site_type}
                onChange={e => updateForm('site_type', e.target.value)}>
                {siteTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>执行主机 <span className="required">*</span></label>
            <select className="form-control" value={form.host_id}
              onChange={e => updateForm('host_id', e.target.value)}>
              <option value="">-- 请选择主机 --</option>
              {hosts.map(h => (
                <option key={h.id} value={h.id} disabled={h.status === 'disabled'}>
                  {h.name} [{h.status}] - 运行:{h.running_count}/{h.max_concurrency} 待处理:{h.pending_count}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>入口URL <span className="required">*</span>（每行一个）</label>
            <textarea className="form-control" rows={4} value={form.initial_urls}
              onChange={e => updateForm('initial_urls', e.target.value)}
              placeholder="https://www.pinterest.com/search/pins/?q=cats" />
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>采集参数</h3></div>
          <div className="form-row-4">
            <div className="form-group">
              <label>并发数</label>
              <input type="number" className="form-control" value={form.concurrency}
                onChange={e => updateForm('concurrency', e.target.value)} min={1} max={20} />
            </div>
            <div className="form-group">
              <label>自动滚动(秒)</label>
              <input type="number" className="form-control" value={form.auto_scroll_seconds}
                onChange={e => updateForm('auto_scroll_seconds', e.target.value)} min={0} />
            </div>
            <div className="form-group">
              <label>最大滚动轮数</label>
              <input type="number" className="form-control" value={form.auto_scroll_max_rounds}
                onChange={e => updateForm('auto_scroll_max_rounds', e.target.value)} min={1} />
            </div>
            <div className="form-group">
              <label>页面超时(秒)</label>
              <input type="number" className="form-control" value={form.page_timeout_seconds}
                onChange={e => updateForm('page_timeout_seconds', e.target.value)} min={10} />
            </div>
            <div className="form-group">
              <label>最大重试次数</label>
              <input type="number" className="form-control" value={form.max_retry_count}
                onChange={e => updateForm('max_retry_count', e.target.value)} min={0} max={10} />
            </div>
            <div className="form-group">
              <label>最大图片数(空=不限)</label>
              <input type="number" className="form-control" value={form.max_images}
                onChange={e => updateForm('max_images', e.target.value)} min={1} />
            </div>
            <div className="form-group">
              <label>启动方式</label>
              <select className="form-control" value={form.start_mode}
                onChange={e => updateForm('start_mode', e.target.value)}>
                <option value="immediate">立即启动</option>
                <option value="scheduled">定时启动</option>
              </select>
            </div>
            {form.start_mode === 'scheduled' && (
              <div className="form-group">
                <label>定时时间</label>
                <input type="datetime-local" className="form-control"
                  value={form.scheduled_at}
                  onChange={e => updateForm('scheduled_at', e.target.value)} />
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>筛选规则（可选）</h3></div>
          <div className="form-group">
            <label>逻辑模式</label>
            <select className="form-control" style={{ width: 120 }} value={form.filter_logic}
              onChange={e => updateForm('filter_logic', e.target.value)}>
              <option value="and">AND（全部满足）</option>
              <option value="or">OR（任一满足）</option>
            </select>
          </div>
          <div className="form-row-4">
            <div className="form-group">
              <label>最小点赞数</label>
              <input type="number" className="form-control" value={form.min_like}
                onChange={e => updateForm('min_like', e.target.value)} placeholder="不限" min={0} />
            </div>
            <div className="form-group">
              <label>最小收藏数</label>
              <input type="number" className="form-control" value={form.min_favorite}
                onChange={e => updateForm('min_favorite', e.target.value)} placeholder="不限" min={0} />
            </div>
            <div className="form-group">
              <label>最小宽度(px)</label>
              <input type="number" className="form-control" value={form.min_width}
                onChange={e => updateForm('min_width', e.target.value)} placeholder="不限" min={0} />
            </div>
            <div className="form-group">
              <label>最小高度(px)</label>
              <input type="number" className="form-control" value={form.min_height}
                onChange={e => updateForm('min_height', e.target.value)} placeholder="不限" min={0} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={form.exclude_video}
                  onChange={e => updateForm('exclude_video', e.target.checked)} />
                排除视频
              </label>
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={form.exclude_collage}
                  onChange={e => updateForm('exclude_collage', e.target.checked)} />
                排除拼图
              </label>
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={form.only_detail_accessible}
                  onChange={e => updateForm('only_detail_accessible', e.target.checked)} />
                仅可访问详情页
              </label>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" onClick={() => navigate('/jobs')}>取消</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? '创建中...' : '创建任务'}
          </button>
        </div>
      </form>
    </div>
  );
}
