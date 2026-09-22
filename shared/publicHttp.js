const dns = require('node:dns').promises;
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');

const privateNetworks = new net.BlockList();
for (const [ip, mask] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3],
]) privateNetworks.addSubnet(ip, mask, 'ipv4');
privateNetworks.addSubnet('2001:db8::', 32, 'ipv6');
privateNetworks.addSubnet('2002::', 16, 'ipv6');
privateNetworks.addSubnet('2001::', 32, 'ipv6');
const globalIpv6 = new net.BlockList();
globalIpv6.addSubnet('2000::', 3, 'ipv6');

class PublicHttpError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    Object.assign(this, details);
  }
}

function allowLocalCrawlTargets() {
  return process.env.ALLOW_LOCAL_CRAWL_TARGETS === 'true';
}

function isBlockedHostname(host) {
  const hostname = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') || hostname.endsWith('.internal')) return true;
  const family = net.isIP(hostname);
  if (family === 4) return privateNetworks.check(hostname, 'ipv4');
  if (family === 6) {
    // IPv4-mapped, link-local and transition addresses are not global IPv6.
    return !globalIpv6.check(hostname, 'ipv6') || privateNetworks.check(hostname, 'ipv6');
  }
  return false;
}

function normalizePublicHttpUrl(value, label = 'url') {
  let url;
  try {
    if (typeof value !== 'string' || !value.trim()) throw new Error();
    url = new URL(value);
  } catch {
    throw new PublicHttpError('INVALID_URL', `${label} must be a valid public http(s) URL`);
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new PublicHttpError('POLICY_DENIED', `${label} must be a public http(s) URL without credentials`);
  }
  if (!allowLocalCrawlTargets() && isBlockedHostname(url.hostname)) {
    throw new PublicHttpError('POLICY_DENIED', `${label} points to a local or private network address`);
  }
  url.hash = '';
  return url.toString();
}

async function resolvePublicUrl(value, { lookup = dns.lookup } = {}) {
  const url = new URL(normalizePublicHttpUrl(value));
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const family = net.isIP(hostname);
  const addresses = family ? [{ address: hostname, family }] : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !net.isIP(address) ||
      (!allowLocalCrawlTargets() && isBlockedHostname(address)))) {
    throw new PublicHttpError('POLICY_DENIED', 'DNS target is a local or private network address');
  }
  return { url, addresses };
}

async function assertPublicHttpUrl(value, label = 'url') {
  const { url } = await resolvePublicUrl(normalizePublicHttpUrl(value, label));
  return url.toString();
}

async function fetchPublic(rawUrl, {
  timeoutMs = 15000, maxBytes = 2 * 1024 * 1024, maxRedirects = 3,
  userAgent = 'image-crawler-system/1.0', beforeRequest, lookup,
} = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  const onAbort = () => new PublicHttpError('TIMEOUT', 'Public HTTP request exceeded its time limit');
  const bounded = async (operation) => {
    signal.throwIfAborted();
    let listener;
    try {
      return await Promise.race([operation, new Promise((_, reject) => {
        listener = () => reject(onAbort());
        signal.addEventListener('abort', listener, { once: true });
      })]);
    } finally {
      signal.removeEventListener('abort', listener);
    }
  };
  let current = normalizePublicHttpUrl(rawUrl);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (beforeRequest) await bounded(beforeRequest(current));
    const { url, addresses } = await bounded(resolvePublicUrl(current, { lookup }));
    const result = await new Promise((resolve, reject) => {
      // Connect only to the addresses checked above, not a second DNS lookup.
      const pinnedLookup = (_host, options, callback) => {
        if (options?.all) callback(null, addresses);
        else callback(null, addresses[0].address, addresses[0].family);
      };
      const request = (url.protocol === 'https:' ? https : http).get(url, {
        lookup: pinnedLookup, signal, agent: false,
        headers: { 'User-Agent': userAgent, Accept: '*/*', 'Accept-Encoding': 'identity' },
      }, (response) => {
        const status = response.statusCode;
        const headers = response.headers;
        if (status >= 300 && status < 400 && status !== 304) {
          response.destroy();
          resolve({ status, headers, body: Buffer.alloc(0) });
          return;
        }
        const chunks = [];
        let bytes = 0;
        response.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > maxBytes) {
            response.destroy(new PublicHttpError('BODY_TOO_LARGE', 'Public HTTP response exceeds byte limit'));
          } else chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () => resolve({ status, headers, body: Buffer.concat(chunks) }));
      });
      request.on('error', (error) => reject(signal.aborted ? onAbort() : error));
    });
    if (result.status >= 300 && result.status < 400 && result.status !== 304) {
      if (!result.headers.location || hop === maxRedirects) {
        throw new PublicHttpError('REDIRECT_LIMIT', 'Missing redirect location or redirect limit exceeded');
      }
      current = normalizePublicHttpUrl(new URL(result.headers.location, current).toString());
      continue;
    }
    return { ...result, url: current };
  }
}

module.exports = { PublicHttpError, fetchPublic, assertPublicHttpUrl, normalizePublicHttpUrl, resolvePublicUrl, isBlockedHostname, allowLocalCrawlTargets };
