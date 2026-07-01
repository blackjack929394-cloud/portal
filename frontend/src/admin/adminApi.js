// Клиент admin API. Токен передаётся в заголовке X-Admin-Token.
const API = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const ADMIN = `${API}/api/v1/admin`;
const VPN = `${API}/api/v1`;

async function get(path, token) {
  const res = await fetch(`${ADMIN}${path}`, { headers: { 'X-Admin-Token': token } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function vpnGet(path, token) {
  const res = await fetch(`${VPN}${path}`, { headers: { 'X-Admin-Token': token } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function vpnPost(path, token, body = {}) {
  const res = await fetch(`${VPN}${path}`, {
    method: 'POST',
    headers: { 'X-Admin-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function vpnDelete(path, token) {
  const res = await fetch(`${VPN}${path}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Token': token },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function vpnPatch(path, token, body = {}) {
  const res = await fetch(`${VPN}${path}`, {
    method: 'PATCH',
    headers: { 'X-Admin-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const verifyToken = (token) => get('/session', token);
export const listPasswords = (token) => get('/passwords', token).then((d) => d.entries);
export const getPassword = (token, id) => get(`/passwords/${id}`, token);
export const listGuests = (token) => get('/guests', token).then((d) => d.entries);
export const listEmployees = (token) => get('/employees', token).then((d) => d.entries);

// VPN admin endpoints
export const listNodes = (token) => vpnGet('/vpn/nodes', token).then((d) => d.nodes);
export const createNode = (token, body) => vpnPost('/vpn/nodes', token, body);
export const updateNode = (token, id, body) => vpnPatch(`/vpn/nodes/${id}`, token, body);
export const deleteNode = (token, id) => vpnDelete(`/vpn/nodes/${id}`, token);
export const toggleNode = (token, id) => vpnPost(`/vpn/nodes/${id}/toggle`, token);
export const deployNode = (token, id) => vpnPost(`/vpn/nodes/${id}/deploy`, token);
export const getDeployStatus = (token, id) => vpnGet(`/vpn/nodes/${id}/deploy-status`, token);
export const redeployNode = (token, id) => vpnPost(`/vpn/nodes/${id}/redeploy`, token);
export const listSubscriptions = (token) => vpnGet('/vpn/subscriptions', token).then((d) => d.subscriptions);
export const revokeSubscription = (token, id, reason) => vpnPost(`/vpn/subscriptions/${id}/revoke`, token, { reason });
export const getStats = (token) => vpnGet('/vpn/stats', token);
