import React, { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { imageApi, socialApi } from '../services/api';

const platformLabels = {
  xiaohongshu: '小红书',
  weibo: '微博',
  instagram: 'Instagram',
  pinterest: 'Pinterest',
  tiktok: 'TikTok',
  website: '公开网站',
  other: '其他'
};

const crawlModeLabels = {
  historical: '历史采集',
  incremental: '增量采集',
  temporary: '临时采集'
};

const scheduleLabels = {
  manual: '手动',
  interval: '间隔',
  cron: 'Cron'
};

const emptySource = {
  platform: 'website',
  account_name: '',
  profile_url: '',
  crawl_mode: 'historical',
  schedule_type: 'manual',
  max_items: 50,
  rate_limit_policy: {
    requests_per_minute: 6,
    min_delay_seconds: 10,
    burst: 1
  },
  notes: ''
};

const emptyJob = {
  source_id: '',
  crawl_mode: 'historical',
  schedule_type: 'manual',
  max_items: 50,
  interval_seconds: 3600,
  cron_expression: '',
  notes: ''
};

function formatTime(value) {
  if (!value) return '-';
  return dayjs(value).format('MM-DD HH:mm');
}

function statusClass(status) {
  return `status-tag status-${status || 'pending'}`;
}

function optionValue(option) {
  return typeof option === 'string' ? option : option.value;
}

function optionSupported(option) {
  return typeof option === 'string' ? true : option.supported !== false;
}

function optionNote(option) {
  return typeof option === 'string' ? '' : option.note || '';
}

function ErrorText({ value }) {
  if (!value) return null;
  return <div className="social-error">{value}</div>;
}

function runButtonLabel(job, runningJobId) {
  if (job.execution_mode !== 'real') return '未支持';
  if (runningJobId === job.id) return '运行中';
  if (['failed', 'partial_failed', 'cancelled', 'completed'].includes(job.status)) return '重试';
  return '运行';
}

function canCancelJob(job) {
  return ['queued', 'running', 'scheduled'].includes(job.status);
}

export default function SocialCrawling({ showToast }) {
  const [meta, setMeta] = useState({ platforms: [], crawl_modes: [], schedule_types: [] });
  const [sources, setSources] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [runs, setRuns] = useState([]);
  const [sourceForm, setSourceForm] = useState(emptySource);
  const [editingSourceId, setEditingSourceId] = useState(null);
  const [jobForm, setJobForm] = useState(emptyJob);
  const [selectedSourceId, setSelectedSourceId] = useState(null);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingSource, setSavingSource] = useState(false);
  const [savingJob, setSavingJob] = useState(false);
  const [runningJobId, setRunningJobId] = useState(null);
  const [cancellingJobId, setCancellingJobId] = useState(null);
  const [downloadingImageId, setDownloadingImageId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAll();
    const timer = setInterval(loadLists, 8000);
    return () => clearInterval(timer);
  }, []);

  async function loadAll() {
    try {
      setError('');
      const [metaRes, sourceRes, jobRes, runRes] = await Promise.all([
        socialApi.meta(),
        socialApi.listSources(),
        socialApi.listJobs(),
        socialApi.listRuns()
      ]);
      setMeta(metaRes.data);
      applyLists(sourceRes.data.data, jobRes.data.data, runRes.data.data);
    } catch (err) {
      const message = err.response?.data?.error || '加载社媒采集数据失败';
      setError(message);
      showToast?.(message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadLists() {
    try {
      const [sourceRes, jobRes, runRes] = await Promise.all([
        socialApi.listSources(),
        socialApi.listJobs(),
        socialApi.listRuns()
      ]);
      applyLists(sourceRes.data.data, jobRes.data.data, runRes.data.data);
    } catch (err) {
      console.error('Failed to refresh social crawling data:', err);
    }
  }

  function applyLists(nextSources, nextJobs, nextRuns) {
    setSources(nextSources);
    setJobs(nextJobs);
    setRuns(nextRuns);

    setSelectedSourceId(current => current || nextSources[0]?.id || null);
    setSelectedRunId(current => current || nextRuns[0]?.id || null);
    setJobForm((current) => ({
      ...current,
      source_id: current.source_id || nextSources[0]?.id || ''
    }));
  }

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === Number(selectedSourceId)) || null,
    [sources, selectedSourceId]
  );

  const selectedJobSource = useMemo(
    () => sources.find((source) => source.id === Number(jobForm.source_id)) || null,
    [sources, jobForm.source_id]
  );

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === Number(selectedRunId)) || runs[0] || null,
    [runs, selectedRunId]
  );

  const sourceJobs = useMemo(
    () => jobs.filter((job) => !selectedSourceId || job.source_id === Number(selectedSourceId)),
    [jobs, selectedSourceId]
  );

  function updateSourceField(field, value) {
    setSourceForm((current) => ({ ...current, [field]: value }));
  }

  function updateRateLimitField(field, value) {
    setSourceForm((current) => ({
      ...current,
      rate_limit_policy: {
        ...current.rate_limit_policy,
        [field]: Number(value)
      }
    }));
  }

  function updateJobField(field, value) {
    setJobForm((current) => ({ ...current, [field]: value }));
  }

  async function handleCreateSource(event) {
    event.preventDefault();
    setSavingSource(true);
    try {
      const payload = {
        ...sourceForm,
        max_items: Number(sourceForm.max_items),
        rate_limit_policy: {
          requests_per_minute: Number(sourceForm.rate_limit_policy.requests_per_minute),
          min_delay_seconds: Number(sourceForm.rate_limit_policy.min_delay_seconds),
          burst: Number(sourceForm.rate_limit_policy.burst)
        }
      };
      const res = editingSourceId
        ? await socialApi.updateSource(editingSourceId, payload)
        : await socialApi.createSource(payload);
      showToast?.(editingSourceId ? '账号源已更新' : '账号源已创建', 'success');
      setEditingSourceId(null);
      setSourceForm({ ...emptySource, rate_limit_policy: { ...emptySource.rate_limit_policy } });
      setSelectedSourceId(res.data.id);
      setJobForm((current) => ({
        ...current,
        source_id: res.data.id,
        crawl_mode: res.data.crawl_mode,
        schedule_type: res.data.schedule_type,
        max_items: res.data.max_items
      }));
      await loadLists();
      setSelectedSourceId(res.data.id);
    } catch (err) {
      showToast?.(err.response?.data?.error || '创建账号源失败', 'error');
    } finally {
      setSavingSource(false);
    }
  }

  function beginEditSource(source) {
    setEditingSourceId(source.id);
    setSourceForm({
      platform: source.platform,
      account_name: source.account_name,
      profile_url: source.profile_url,
      crawl_mode: source.crawl_mode,
      schedule_type: source.schedule_type,
      max_items: source.max_items,
      rate_limit_policy: { ...emptySource.rate_limit_policy, ...(source.rate_limit_policy || {}) },
      notes: source.notes || ''
    });
  }

  function cancelEditSource() {
    setEditingSourceId(null);
    setSourceForm({ ...emptySource, rate_limit_policy: { ...emptySource.rate_limit_policy } });
  }

  async function toggleSource(source) {
    if (source.status === 'unsupported') return;
    const nextStatus = source.status === 'active' ? 'disabled' : 'active';
    try {
      await socialApi.updateSource(source.id, { status: nextStatus });
      showToast?.(nextStatus === 'active' ? '账号源已启用' : '账号源已停用', 'success');
      await loadLists();
    } catch (err) {
      showToast?.(err.response?.data?.error || '更新账号源状态失败', 'error');
    }
  }

  async function handleCreateJob(event) {
    event.preventDefault();
    setSavingJob(true);
    try {
      const payload = {
        ...jobForm,
        source_id: Number(jobForm.source_id),
        max_items: Number(jobForm.max_items),
        interval_seconds: jobForm.schedule_type === 'interval' ? Number(jobForm.interval_seconds) : null,
        cron_expression: jobForm.schedule_type === 'cron' ? jobForm.cron_expression : null
      };
      const res = await socialApi.createJob(payload);
      showToast?.('采集任务已创建', 'success');
      setJobForm((current) => ({
        ...emptyJob,
        source_id: current.source_id,
        crawl_mode: current.crawl_mode,
        schedule_type: current.schedule_type,
        max_items: current.max_items
      }));
      await loadLists();
      setSelectedRunId(res.data.last_run?.id || selectedRunId);
    } catch (err) {
      showToast?.(err.response?.data?.error || '创建任务失败', 'error');
    } finally {
      setSavingJob(false);
    }
  }

  async function handleRunJob(jobId) {
    setRunningJobId(jobId);
    try {
      const res = await socialApi.runJob(jobId);
      showToast?.('任务已入队，等待 Worker 执行', 'success');
      setSelectedRunId(res.data.run.id);
      await loadLists();
    } catch (err) {
      showToast?.(err.response?.data?.error || '运行任务失败', 'error');
    } finally {
      setRunningJobId(null);
    }
  }

  async function handleCancelJob(jobId) {
    setCancellingJobId(jobId);
    try {
      await socialApi.cancelJob(jobId);
      showToast?.('任务已取消', 'success');
      await loadLists();
    } catch (err) {
      showToast?.(err.response?.data?.error || '取消任务失败', 'error');
    } finally {
      setCancellingJobId(null);
    }
  }

  async function handleDownloadImage(imageId) {
    setDownloadingImageId(imageId);
    try {
      await imageApi.download(imageId, {
        max_bytes: 10 * 1024 * 1024,
        timeout_ms: 15000,
        max_redirects: 3
      });
      showToast?.('图片已保存到本地 downloads 目录', 'success');
      await loadLists();
    } catch (err) {
      showToast?.(err.response?.data?.message || err.response?.data?.error || '图片保存失败', 'error');
    } finally {
      setDownloadingImageId(null);
    }
  }

  function selectSource(source) {
    setSelectedSourceId(source.id);
    setJobForm((current) => ({
      ...current,
      source_id: source.id,
      crawl_mode: source.crawl_mode,
      schedule_type: source.schedule_type,
      max_items: source.max_items
    }));
  }

  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div className="social-page">
      <div className="page-header">
        <div>
          <h2>社媒采集管理</h2>
          <p className="page-subtitle">品牌账号源、采集任务、运行结果</p>
        </div>
        <button className="btn btn-outline" onClick={loadAll}>刷新</button>
      </div>

      <ErrorText value={error} />

      <div className="policy-strip">
        <span>公开内容</span>
        <span>不使用登录态</span>
        <span>不绕过验证码</span>
        <span>所有适配器必须限速</span>
      </div>

      <div className="social-summary-grid">
        <div className="stat-card">
          <div className="stat-value">{sources.length}</div>
          <div className="stat-label">账号源</div>
        </div>
        <div className="stat-card info">
          <div className="stat-value">{jobs.length}</div>
          <div className="stat-label">采集任务</div>
        </div>
        <div className="stat-card success">
          <div className="stat-value">{runs.filter((run) => run.status === 'completed').length}</div>
          <div className="stat-label">完成运行</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-value">{runs.reduce((sum, run) => sum + Number(run.image_count || 0), 0)}</div>
          <div className="stat-label">图片资产</div>
        </div>
      </div>

      <div className="social-workbench">
        <form className="card social-form-card" onSubmit={handleCreateSource}>
          <div className="card-header">
            <h3>{editingSourceId ? '编辑账号源' : '创建账号源'}</h3>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>平台</label>
              <select
                className="form-control"
                value={sourceForm.platform}
                disabled={Boolean(editingSourceId)}
                onChange={(event) => updateSourceField('platform', event.target.value)}
              >
                {(meta.platforms.length ? meta.platforms : Object.keys(platformLabels)).map((option) => {
                  const platform = optionValue(option);
                  const supported = optionSupported(option);
                  const note = optionNote(option);
                  return (
                    <option key={platform} value={platform}>
                      {platformLabels[platform] || platform}{supported ? '' : '（mock/未支持）'}{note ? ` - ${note}` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="form-group">
              <label>账号名称</label>
              <input
                className="form-control"
                value={sourceForm.account_name}
                onChange={(event) => updateSourceField('account_name', event.target.value)}
                placeholder="品牌名或公开主页名"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>公开页面 URL</label>
            <input
              className="form-control"
              value={sourceForm.profile_url}
              onChange={(event) => updateSourceField('profile_url', event.target.value)}
              placeholder="https://example.com/brand"
              required
            />
          </div>

          <div className="form-row-3">
            <div className="form-group">
              <label>采集模式</label>
              <select
                className="form-control"
                value={sourceForm.crawl_mode}
                onChange={(event) => updateSourceField('crawl_mode', event.target.value)}
              >
                {(meta.crawl_modes.length ? meta.crawl_modes : Object.keys(crawlModeLabels)).map((option) => {
                  const mode = optionValue(option);
                  return <option key={mode} value={mode}>{crawlModeLabels[mode] || mode}</option>;
                })}
              </select>
            </div>
            <div className="form-group">
              <label>调度类型</label>
              <select
                className="form-control"
                value={sourceForm.schedule_type}
                onChange={(event) => updateSourceField('schedule_type', event.target.value)}
              >
                {(meta.schedule_types.length ? meta.schedule_types : Object.keys(scheduleLabels)).map((option) => {
                  const type = optionValue(option);
                  const supported = optionSupported(option);
                  return (
                    <option key={type} value={type} disabled={!supported}>
                      {scheduleLabels[type] || type}{supported ? '' : '（未实现）'}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="form-group">
              <label>最大条数</label>
              <input
                className="form-control"
                type="number"
                min="1"
                max="1000"
                value={sourceForm.max_items}
                onChange={(event) => updateSourceField('max_items', event.target.value)}
              />
            </div>
          </div>

          <div className="form-row-3">
            <div className="form-group">
              <label>每分钟请求</label>
              <input
                className="form-control"
                type="number"
                min="1"
                value={sourceForm.rate_limit_policy.requests_per_minute}
                onChange={(event) => updateRateLimitField('requests_per_minute', event.target.value)}
              />
            </div>
            <div className="form-group">
              <label>最小间隔秒</label>
              <input
                className="form-control"
                type="number"
                min="0"
                value={sourceForm.rate_limit_policy.min_delay_seconds}
                onChange={(event) => updateRateLimitField('min_delay_seconds', event.target.value)}
              />
            </div>
            <div className="form-group">
              <label>突发上限</label>
              <input
                className="form-control"
                type="number"
                min="1"
                value={sourceForm.rate_limit_policy.burst}
                onChange={(event) => updateRateLimitField('burst', event.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label>备注</label>
            <textarea
              className="form-control"
              value={sourceForm.notes}
              onChange={(event) => updateSourceField('notes', event.target.value)}
              placeholder="平台规则、公开页面说明、后续接入记录"
            />
          </div>

          <div className="action-group">
            <button className="btn btn-primary" disabled={savingSource} type="submit">
              {savingSource ? '保存中...' : editingSourceId ? '保存账号源' : '创建账号源'}
            </button>
            {editingSourceId && <button className="btn btn-outline" type="button" onClick={cancelEditSource}>取消编辑</button>}
          </div>
        </form>

        <form className="card social-form-card" onSubmit={handleCreateJob}>
          <div className="card-header">
            <h3>创建采集任务</h3>
          </div>

          <div className="form-group">
            <label>账号源</label>
            <select
              className="form-control"
              value={jobForm.source_id}
              onChange={(event) => {
                updateJobField('source_id', event.target.value);
                setSelectedSourceId(event.target.value || null);
              }}
              required
            >
              <option value="">选择账号源</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id} disabled={source.status !== 'active'}>
                  #{source.id} {source.account_name} / {platformLabels[source.platform] || source.platform}
                  {source.execution_mode === 'real' ? ' / 真实' : ' / mock未支持'}
                </option>
              ))}
            </select>
            {selectedJobSource?.status !== 'active' && (
              <div className="form-hint">
                当前来源为 {selectedJobSource?.status}，V1 只允许运行公开网站来源；社媒平台真实适配器后续单独接入。
              </div>
            )}
          </div>

          <div className="form-row-3">
            <div className="form-group">
              <label>采集模式</label>
              <select
                className="form-control"
                value={jobForm.crawl_mode}
                onChange={(event) => updateJobField('crawl_mode', event.target.value)}
              >
                {Object.keys(crawlModeLabels).map((mode) => (
                  <option key={mode} value={mode}>{crawlModeLabels[mode]}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>调度类型</label>
              <select
              className="form-control"
              value={jobForm.schedule_type}
              onChange={(event) => updateJobField('schedule_type', event.target.value)}
            >
                {(meta.schedule_types.length ? meta.schedule_types : Object.keys(scheduleLabels)).map((option) => {
                  const type = optionValue(option);
                  const supported = optionSupported(option);
                  return (
                    <option key={type} value={type} disabled={!supported}>
                      {scheduleLabels[type] || type}{supported ? '' : '（未实现）'}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="form-group">
              <label>最大条数</label>
              <input
                className="form-control"
                type="number"
                min="1"
                max="1000"
                value={jobForm.max_items}
                onChange={(event) => updateJobField('max_items', event.target.value)}
              />
            </div>
          </div>

          {jobForm.schedule_type === 'interval' && (
            <div className="form-group">
              <label>间隔秒数</label>
              <input
                className="form-control"
                type="number"
                min="60"
                value={jobForm.interval_seconds}
                onChange={(event) => updateJobField('interval_seconds', event.target.value)}
              />
            </div>
          )}

          {jobForm.schedule_type === 'cron' && (
            <div className="form-group">
              <label>Cron 表达式</label>
              <input
                className="form-control"
                value={jobForm.cron_expression}
                onChange={(event) => updateJobField('cron_expression', event.target.value)}
                placeholder="0 */6 * * *"
              />
            </div>
          )}

          <div className="form-group">
            <label>任务备注</label>
            <textarea
              className="form-control"
              value={jobForm.notes}
              onChange={(event) => updateJobField('notes', event.target.value)}
              placeholder="本次采集目标、窗口期、人工复核要求"
            />
          </div>

          <button
            className="btn btn-primary"
            disabled={savingJob || sources.length === 0 || !jobForm.source_id || selectedJobSource?.status !== 'active'}
            type="submit"
          >
            {savingJob ? '创建中...' : '创建采集任务'}
          </button>
        </form>
      </div>

      <div className="social-grid">
        <section className="card">
          <div className="card-header">
            <h3>账号源</h3>
            <span className="tag">
              {selectedSource ? `${selectedSource.execution_mode || 'unknown'} / ${selectedSource.adapter}` : 'adapter'}
            </span>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>账号</th>
                  <th>平台</th>
                  <th>状态</th>
                  <th>任务</th>
                  <th>图片</th>
                  <th>上次采集</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <tr
                    key={source.id}
                    className={source.id === selectedSourceId ? 'selected-row' : ''}
                    onClick={() => selectSource(source)}
                  >
                    <td>{source.id}</td>
                    <td>
                      <div className="strong-cell">{source.account_name}</div>
                      <div className="muted-cell">{source.profile_url}</div>
                    </td>
                    <td>
                      <span className="tag">{platformLabels[source.platform] || source.platform}</span>
                      <div className="muted-cell">{source.execution_mode || 'unknown'}</div>
                    </td>
                    <td><span className={statusClass(source.status)}>{source.status}</span></td>
                    <td>{source.job_count}</td>
                    <td>{source.image_count}</td>
                    <td>{formatTime(source.last_crawled_at)}</td>
                    <td>
                      <div className="action-group">
                        <button
                          className="btn btn-xs btn-outline"
                          onClick={(event) => { event.stopPropagation(); beginEditSource(source); }}
                        >
                          编辑
                        </button>
                        {source.status !== 'unsupported' && (
                          <button
                            className="btn btn-xs btn-warning"
                            onClick={(event) => { event.stopPropagation(); toggleSource(source); }}
                          >
                            {source.status === 'active' ? '停用' : '启用'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sources.length === 0 && <div className="empty">暂无账号源</div>}
        </section>

        <section className="card">
          <div className="card-header">
            <h3>采集任务</h3>
            <span className="tag">{selectedSource ? selectedSource.account_name : '全部'}</span>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>模式</th>
                  <th>调度</th>
                  <th>状态</th>
                  <th>图片</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {sourceJobs.map((job) => (
                  <tr key={job.id}>
                    <td>{job.id}</td>
                    <td>{crawlModeLabels[job.crawl_mode] || job.crawl_mode}</td>
                    <td>{scheduleLabels[job.schedule_type] || job.schedule_type}</td>
                    <td><span className={statusClass(job.status)}>{job.status}</span></td>
                    <td>{job.image_count || 0}</td>
                    <td>{formatTime(job.created_at)}</td>
                    <td>
                      <div className="action-group">
                        <button
                          className="btn btn-xs btn-success"
                          disabled={
                            runningJobId === job.id ||
                            job.execution_mode !== 'real' ||
                            ['queued', 'running'].includes(job.status)
                          }
                          onClick={() => handleRunJob(job.id)}
                          title={job.execution_mode !== 'real' ? '该平台 V1 尚未接入真实公开采集适配器' : '运行任务'}
                        >
                          {runButtonLabel(job, runningJobId)}
                        </button>
                        <button
                          className="btn btn-xs btn-warning"
                          disabled={!canCancelJob(job) || cancellingJobId === job.id}
                          onClick={() => handleCancelJob(job.id)}
                        >
                          {cancellingJobId === job.id ? '取消中' : '取消'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sourceJobs.length === 0 && <div className="empty">暂无采集任务</div>}
        </section>
      </div>

      <section className="card">
        <div className="card-header">
          <h3>运行结果</h3>
          <div className="run-tabs">
            {runs.slice(0, 6).map((run) => (
              <button
                key={run.id}
                className={`btn btn-xs ${run.id === selectedRun?.id ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setSelectedRunId(run.id)}
              >
                Run #{run.id}
              </button>
            ))}
          </div>
        </div>

        {selectedRun ? (
          <>
            <div className="run-meta">
              <span>状态：<strong>{selectedRun.status}</strong></span>
              <span>图片：<strong>{selectedRun.image_count}</strong></span>
              <span>开始：{formatTime(selectedRun.started_at)}</span>
              <span>结束：{formatTime(selectedRun.finished_at)}</span>
            </div>
            <ErrorText value={selectedRun.error_message || selectedRun.error} />
            <div className="social-image-grid">
              {(selectedRun.images || []).map((image) => (
                <article key={image.id} className="social-image-card">
                  <img src={image.image_url} alt={image.alt_text || image.title || 'social asset'} />
                  <div className="social-image-body">
                    <div className="strong-cell">{image.title || 'Untitled'}</div>
                    <div className="muted-cell">{image.width || '-'} x {image.height || '-'}</div>
                    {image.local_path && <div className="muted-cell">{image.local_path}</div>}
                    <a href={image.source_url} target="_blank" rel="noreferrer">来源页面</a>
                    <button
                      className="btn btn-xs btn-outline"
                      disabled={downloadingImageId === image.id}
                      onClick={() => handleDownloadImage(image.id)}
                    >
                      {downloadingImageId === image.id ? '保存中' : '保存'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {(selectedRun.images || []).length === 0 && <div className="empty">本次运行暂无图片资产</div>}
          </>
        ) : (
          <div className="empty">暂无运行结果</div>
        )}
      </section>
    </div>
  );
}
