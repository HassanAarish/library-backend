// When this server process started, and how long it has been running.
export const STARTED_AT = new Date(Date.now() - process.uptime() * 1000);

export const uptimeSeconds = () => Math.floor(process.uptime());

/** 93784 → "1d 2h 3m 4s"; leading zero parts are left out. */
export const formatUptime = (totalSeconds) => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const parts = [
    [Math.floor(s / 86400), "d"],
    [Math.floor((s % 86400) / 3600), "h"],
    [Math.floor((s % 3600) / 60), "m"],
    [s % 60, "s"],
  ];
  const first = parts.findIndex(([n]) => n > 0);
  return first === -1
    ? "0s"
    : parts
        .slice(first)
        .map(([n, u]) => `${n}${u}`)
        .join(" ");
};

/** Uptime block for /health and the start/stop logs. */
export const uptimeInfo = () => {
  const seconds = uptimeSeconds();
  return { seconds, human: formatUptime(seconds), startedAt: STARTED_AT.toISOString() };
};
