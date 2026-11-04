import config from '../config/index.js';
import { userLimitsStore } from '../models/UserLimits.js';

// Лимиты аккаунта: устройства и трафик.
// Если админ не задал индивидуальные значения — берём дефолт из конфига.

export async function getUserLimits(userSub) {
  const stored = await userLimitsStore.get(userSub);
  return {
    userSub,
    deviceLimit: stored?.deviceLimit ?? config.appAuth.deviceLimit,
    trafficLimitGb: stored?.trafficLimitGb ?? config.vpn.defaultTrafficLimitGb,
    updatedAt: stored?.updatedAt ?? null,
  };
}

export async function setUserLimits(userSub, { deviceLimit, trafficLimitGb }) {
  const current = await getUserLimits(userSub);
  const nextDevice = deviceLimit === undefined ? current.deviceLimit : deviceLimit;
  const nextTraffic = trafficLimitGb === undefined ? current.trafficLimitGb : trafficLimitGb;
  return userLimitsStore.upsert(userSub, {
    deviceLimit: nextDevice,
    trafficLimitGb: nextTraffic,
  });
}
