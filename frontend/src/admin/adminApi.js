// Клиент admin API. Токен передаётся в заголовке X-Admin-Token.
// Пустой базовый адрес = тот же домен (same-origin); в dev — VITE_API_URL.
const API = import.meta.env.VITE_API_URL ?? '';
const ADMIN = `${API}/api/v1/admin`;
const VPN = `${API}/api/v1`;

async function get(path, token) {
  const res = await fetch(`${ADMIN}${path}`, { headers: { 'X-Admin-Token': token } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(data.error || `HTTP ${res.status}`); err.status = res.status; throw err; }
  return data;
}

async function vpnGet(path, token) {
  const res = await fetch(`${VPN}${path}`, { headers: { 'X-Admin-Token': token } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(data.error || `HTTP ${res.status}`); err.status = res.status; throw err; }
  return data;
}

async function vpnPost(path, token, body = {}) {
  const res = await fetch(`${VPN}${path}`, {
    method: 'POST',
    headers: { 'X-Admin-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(data.error || `HTTP ${res.status}`); err.status = res.status; throw err; }
  return data;
}

async function vpnDelete(path, token) {
  const res = await fetch(`${VPN}${path}`, { method: 'DELETE', headers: { 'X-Admin-Token': token } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(data.error || `HTTP ${res.status}`); err.status = res.status; throw err; }
  return data;
}

async function vpnPatch(path, token, body = {}) {
  const res = await fetch(`${VPN}${path}`, {
    method: 'PATCH',
    headers: { 'X-Admin-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(data.error || `HTTP ${res.status}`); err.status = res.status; throw err; }
  return data;
}

export const verifyToken = (token) => get('/session', token);

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
export const listPending = (token) => vpnGet('/vpn/pending', token).then((d) => d.pending);
export const approveSubscription = (token, id) => vpnPost(`/vpn/subscriptions/${id}/approve`, token);
export const denySubscription = (token, id, reason) => vpnPost(`/vpn/subscriptions/${id}/deny`, token, { reason });
export const revokeSubscription = (token, id, reason) => vpnPost(`/vpn/subscriptions/${id}/revoke`, token, { reason });
export const updateSubscription = (token, id, body) => vpnPatch(`/vpn/subscriptions/${id}`, token, body);
export const getUserRouting = (token, username) => vpnGet(`/vpn/users/${encodeURIComponent(username)}/routing`, token).then((d) => d.profile);
export const listChats = (token) => vpnGet('/vpn/chats', token).then((d) => d.chats);
export const getChatMessages = (token, userSub) => vpnGet(`/vpn/chats/messages?user=${encodeURIComponent(userSub)}`, token).then((d) => d.messages);
export const sendChatMessage = (token, userSub, text) => vpnPost('/vpn/chats/messages', token, { userSub, text });
export const deleteSubscription = (token, id) => vpnDelete(`/vpn/subscriptions/${id}`, token);
export const getStats = (token) => vpnGet('/vpn/stats', token);
export const listUsers = (token) => vpnGet('/vpn/users', token).then((d) => d.users);
export const listDevices = (token) => vpnGet('/vpn/devices', token).then((d) => d.devices);
export const revokeDevice = (token, id) => vpnDelete(`/vpn/devices/${id}`, token);
export const deleteUser = (token, username) => vpnDelete(`/vpn/users/${encodeURIComponent(username)}`, token);
export const setUserBlocked = (token, username, blocked) => vpnPost(`/vpn/users/${encodeURIComponent(username)}/block`, token, { blocked });
export const saveUserLimits = (token, username, body) => vpnPatch(`/vpn/users/${encodeURIComponent(username)}/limits`, token, body);