import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

export const jobApi = {
  list: (params) => api.get('/jobs', { params }),
  detail: (id, params) => api.get(`/jobs/${id}`, { params }),
  downloadImages: (id, params) => api.get(`/jobs/${id}/download-images`, {
    params,
    responseType: 'blob',
    timeout: 0,
  }),
  create: (data) => api.post('/jobs', data),
  pause: (id) => api.post(`/jobs/${id}/pause`),
  resume: (id) => api.post(`/jobs/${id}/resume`),
  cancel: (id) => api.post(`/jobs/${id}/cancel`),
  delete: (id) => api.delete(`/jobs/${id}`),
};

export const hostApi = {
  list: () => api.get('/hosts'),
  detail: (id) => api.get(`/hosts/${id}`),
  create: (data) => api.post('/hosts', data),
  update: (id, data) => api.put(`/hosts/${id}`, data),
  delete: (id) => api.delete(`/hosts/${id}`),
  heartbeat: (data) => api.post('/hosts/heartbeat', data),
};

export const imageApi = {
  list: (params) => api.get('/images', { params }),
  expand: (id, data) => api.post(`/images/${id}/expand`, data),
  delete: (id) => api.delete(`/images/${id}`),
  favorite: (id) => api.post(`/images/${id}/favorite`),
};

export const statsApi = {
  overview: () => api.get('/stats/overview'),
  logs: (params) => api.get('/stats/logs', { params }),
};

export const socialApi = {
  meta: () => api.get('/social/meta'),
  listSources: (params) => api.get('/social/sources', { params }),
  createSource: (data) => api.post('/social/sources', data),
  listJobs: (params) => api.get('/social/jobs', { params }),
  createJob: (data) => api.post('/social/jobs', data),
  runJob: (id) => api.post(`/social/jobs/${id}/run`),
  jobStatus: (id) => api.get(`/social/jobs/${id}/status`),
  listRuns: (params) => api.get('/social/runs', { params }),
};

export default api;
