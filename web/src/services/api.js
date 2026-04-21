import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

export const jobApi = {
  list: (params) => api.get('/jobs', { params }),
  detail: (id, params) => api.get(`/jobs/${id}`, { params }),
  downloadImages: (id, params) => api.get(`/jobs/${id}/download-images`, { params, responseType: 'blob' }),
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

export default api;
