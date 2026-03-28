/**
 * Parse proxy string into components.
 * Formats: ip:port, ip:port:user:pass, socks5://ip:port, socks5://ip:port:user:pass
 */
export function parseProxy(proxyStr) {
  if (!proxyStr) return null;

  let protocol = 'http';
  let raw = proxyStr.trim();

  if (raw.startsWith('socks5://')) {
    protocol = 'socks5';
    raw = raw.replace('socks5://', '');
  } else if (raw.startsWith('http://')) {
    raw = raw.replace('http://', '');
  }

  const parts = raw.split(':');

  if (parts.length === 2) {
    return { protocol, host: parts[0], port: parts[1], username: null, password: null };
  }
  if (parts.length === 4) {
    return { protocol, host: parts[0], port: parts[1], username: parts[2], password: parts[3] };
  }

  return null;
}

/**
 * Format proxy for GPM API.
 * Returns: ip:port:user:pass or socks5://ip:port:user:pass
 */
export function formatProxyForGpm(proxyStr) {
  const proxy = parseProxy(proxyStr);
  if (!proxy) return '';

  const { protocol, host, port, username, password } = proxy;
  const prefix = protocol === 'socks5' ? 'socks5://' : '';
  const auth = username && password ? `:${username}:${password}` : '';

  return `${prefix}${host}:${port}${auth}`;
}

/**
 * Generate a random integer between min and max (inclusive).
 */
export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
