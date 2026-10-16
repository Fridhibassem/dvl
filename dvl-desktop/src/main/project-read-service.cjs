'use strict';
// Host-internal boundary prototype. NOT exposed to Electron/IPC in C1a.
// Root comes from a trusted registry resolver, never from request arguments.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { TextDecoder } = require('node:util');
const decoder = new TextDecoder('utf-8', { fatal: true });
const MAX_RESPONSE = 2 * 1024 * 1024;
const fail = code => Object.assign(new Error(code), { code });
const token = () => crypto.randomUUID();
const idValid = s => typeof s === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(s);
function identity(root) {
  const st = fs.lstatSync(root, { bigint: true });
  if (!st.isDirectory() || fs.realpathSync(root) !== root) throw fail('PROJECT_UNAVAILABLE');
  return { dev: String(st.dev), ino: String(st.ino) };
}
function denyName(name) {
  const n = name.toLowerCase();
  return ['.git', '.dvl', '.ssh', '.gnupg', '.aws', '.azure', '.kube', '.env', '.npmrc', '.pypirc', '.netrc', 'credentials', 'credentials.json'].includes(n) || /^(\.env\.|id_rsa|id_ed25519)/.test(n) || /\.(pem|key|p12|pfx)$/.test(n);
}
function validPath(s, allowRoot) {
  if (typeof s !== 'string' || Buffer.byteLength(s) > 4096 || !Buffer.from(s).equals(Buffer.from(decoder.decode(Buffer.from(s))))) throw fail('INVALID_REQUEST');
  // Reject unpaired surrogates rather than normalizing the requested filename.
  if (Buffer.from(s).toString('utf8') !== s) throw fail('INVALID_REQUEST');
  if (s === '.' && allowRoot) return;
  const components = s.split('/');
  if (!s || /[\\:\0]/.test(s) || components.length > 64 || components.some(p => !p || p === '.' || p === '..')) throw fail('PATH_DENIED');
  if (components.some(denyName)) throw fail('POLICY_DENIED');
}
function textBytes(hex) {
  if (typeof hex !== 'string' || hex.length % 2 || /[^0-9a-f]/.test(hex)) throw fail('RUNTIME_FAILED');
  const bytes = Buffer.from(hex, 'hex');
  if (bytes.includes(0)) throw fail('UNSUPPORTED_ENCODING');
  try { return { bytes, text: decoder.decode(bytes) }; } catch { throw fail('UNSUPPORTED_ENCODING'); }
}
class ProjectReadService {
  constructor(resolveProject, options = {}) {
    this.resolveProject = resolveProject;
    this.binary = options.binary || path.join(__dirname, '../../bin/project-reader');
    this.timeoutMs = options.timeoutMs || 5000;
    this.context = null; this.jobs = new Map(); this.cursors = new Map(); this.queue = []; this.active = 0; this.closed = false;
  }
  bind(projectId) {
    if (this.closed || !idValid(projectId)) throw fail('INVALID_REQUEST');
    this.invalidate();
    const project = this.resolveProject(projectId);
    if (!project || !project.available || project.projectId !== projectId) throw fail('PROJECT_UNAVAILABLE');
    let observed;
    try { observed = identity(project.path); } catch { throw fail('PROJECT_UNAVAILABLE'); }
    this.context = { projectId, contextGeneration: token(), root: project.path, observed, seen: new Set() };
    return { projectId, contextGeneration: this.context.contextGeneration };
  }
  invalidate() {
    this.context = null; this.cursors.clear();
    for (const j of this.jobs.values()) { j.reason = 'STALE_CONTEXT'; j.controller.abort(); }
  }
  current(ctx) {
    if (this.closed || this.context !== ctx) throw fail('STALE_CONTEXT');
    const p = this.resolveProject(ctx.projectId);
    if (!p || !p.available || p.path !== ctx.root) throw fail('PROJECT_UNAVAILABLE');
    let now; try { now = identity(ctx.root); } catch { throw fail('PROJECT_UNAVAILABLE'); }
    if (now.dev !== ctx.observed.dev || now.ino !== ctx.observed.ino) { this.invalidate(); throw fail('PROJECT_UNAVAILABLE'); }
  }
  async request(operation, req) {
    let job, ctx;
    const response = { requestId: req && idValid(req.requestId) ? req.requestId : null, projectId: req && idValid(req.projectId) ? req.projectId : null, contextGeneration: req && idValid(req.contextGeneration) ? req.contextGeneration : null };
    try {
      if (!req || typeof req !== 'object' || Array.isArray(req) || !['listDirectory', 'readTextFile', 'searchText'].includes(operation)) throw fail('INVALID_REQUEST');
      const keys = ['requestId', 'projectId', 'contextGeneration', 'relativePath', ...(operation === 'listDirectory' ? ['cursor'] : operation === 'searchText' ? ['query'] : [])];
      if (Object.keys(req).some(k => !keys.includes(k)) || !idValid(req.requestId) || !idValid(req.projectId) || !idValid(req.contextGeneration)) throw fail('INVALID_REQUEST');
      ctx = this.context;
      if (!ctx || req.projectId !== ctx.projectId || req.contextGeneration !== ctx.contextGeneration) throw fail('STALE_CONTEXT');
      this.current(ctx); validPath(req.relativePath, operation !== 'readTextFile');
      if (operation === 'searchText' && (typeof req.query !== 'string' || req.query.length === 0 || req.query.includes('\0') || Buffer.byteLength(req.query) > 256 || Buffer.from(req.query).toString() !== req.query)) throw fail('INVALID_REQUEST');
      if (req.cursor !== undefined && !idValid(req.cursor)) throw fail('INVALID_REQUEST');
      if (ctx.seen.has(req.requestId)) throw fail('INVALID_REQUEST');
      // Bound request-id memory; rebind is explicit when a context is exhausted.
      if (ctx.seen.size >= 10000) throw fail('BUSY');
      if (this.active >= 2 && this.queue.length >= 8) throw fail('BUSY');
      ctx.seen.add(req.requestId);
      job = { controller: new AbortController(), reason: null, child: null, ctx };
      this.jobs.set(req.requestId, job);
      await this.slot(job);
      try {
        this.current(ctx); this.checkJob(job);
        job.deadline = Date.now() + this.timeoutMs;
        const data = operation === 'readTextFile' ? await this.read(ctx, req.relativePath, job) : operation === 'listDirectory' ? await this.list(ctx, req.relativePath, req.cursor, job) : await this.search(ctx, req.relativePath, req.query, job);
        this.current(ctx); if (job.controller.signal.aborted) throw fail(job.reason || 'CANCELLED');
        const result = { ...response, ok: true, data };
        if (Buffer.byteLength(JSON.stringify(result)) > MAX_RESPONSE) throw fail('RESPONSE_TOO_LARGE');
        return result;
      } finally { this.active--; this.drain(); }
    } catch (e) {
      return { ...response, ok: false, error: { code: job?.reason || e.code || 'RUNTIME_FAILED' } };
    } finally {
      if (job) {
        this.jobs.delete(req.requestId);
        if (operation === 'searchText') for (const [key, value] of this.cursors) if (value.searchJob === job) this.cursors.delete(key);
      }
    }
  }
  slot(job) {
    if (this.active < 2) { this.active++; return Promise.resolve(); }
    return new Promise((resolve, reject) => {
      const item = { job, resolve, reject };
      this.queue.push(item);
      const abort = () => { const index = this.queue.indexOf(item); if (index >= 0) { this.queue.splice(index, 1); reject(fail(job.reason || 'CANCELLED')); } };
      item.abort = abort; job.controller.signal.addEventListener('abort', abort, { once: true });
    });
  }
  drain() {
    while (this.active < 2 && this.queue.length) {
      const item = this.queue.shift(); item.job.controller.signal.removeEventListener('abort', item.abort); this.active++; item.resolve();
    }
  }
  checkJob(job) { if (job.controller.signal.aborted) throw fail(job.reason || 'CANCELLED'); if (job.deadline && Date.now() >= job.deadline) throw fail('TIMEOUT'); }
  cancel(context, requestId) {
    if (!context || !this.context || context.projectId !== this.context.projectId || context.contextGeneration !== this.context.contextGeneration) throw fail('STALE_CONTEXT');
    const j = this.jobs.get(requestId);
    if (j && j.ctx === this.context) { j.reason = 'CANCELLED'; j.controller.abort(); return { acknowledged: true }; }
    return { acknowledged: false };
  }
  async native(ctx, op, rel, offset, job) {
    this.current(ctx); this.checkJob(job);
    if (!fs.existsSync(this.binary)) throw fail('BOUNDARY_UNSUPPORTED');
    return new Promise((resolve, reject) => {
      const child = spawn(this.binary, [], { shell: false, stdio: ['pipe', 'pipe', 'pipe'], env: {} });
      job.child = child; let chunks = [], size = 0, problem;
      const stop = code => { problem ||= code; child.kill('SIGKILL'); };
      const abort = () => stop(job.reason || 'CANCELLED');
      job.controller.signal.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(() => stop('TIMEOUT'), Math.max(1, job.deadline - Date.now()));
      child.stdout.on('data', b => { size += b.length; if (size > MAX_RESPONSE + 4096) stop('RESPONSE_TOO_LARGE'); else chunks.push(b); });
      child.stderr.on('data', () => { /* Drain, never retain potentially sensitive diagnostics. */ });
      child.stdin.on('error', () => {});
      child.on('error', () => { problem = 'BOUNDARY_UNSUPPORTED'; });
      child.on('close', (code, signal) => {
        clearTimeout(timer); job.child = null; job.controller.signal.removeEventListener('abort', abort);
        if (problem) return reject(fail(problem));
        let out; try { out = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return reject(fail('RUNTIME_FAILED')); }
        if (signal || (code !== 0 && out.ok !== false)) return reject(fail('RUNTIME_FAILED'));
        if (!out.ok) return reject(fail(out.error || 'RUNTIME_FAILED'));
        this.checkJobSafe(job, reject, () => resolve(out));
      });
      child.stdin.end(`${op}\n${Buffer.from(ctx.root).toString('hex')}\n${Buffer.from(rel).toString('hex')}\n${offset} ${ctx.observed.dev} ${ctx.observed.ino}\n`);
      if (job.controller.signal.aborted) abort();
    });
  }
  checkJobSafe(job, reject, next) { try { this.checkJob(job); next(); } catch (e) { reject(e); } }
  async read(ctx, rel, job) {
    const out = await this.native(ctx, 'read', rel, 0, job);
    const { bytes, text } = textBytes(out.hex);
    return { text, byteLength: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), observedIdentity: `${out.dev}:${out.ino}`, boundaryMode: out.mode, complete: true };
  }
  async list(ctx, rel, cursor, job, searchJob) {
    let prior;
    if (cursor) {
      prior = this.cursors.get(cursor); this.cursors.delete(cursor);
      if (!prior || prior.ctx !== ctx || prior.rel !== rel || prior.expires < Date.now()) throw fail('INVALID_CURSOR');
    }
    const out = await this.native(ctx, 'list', rel, prior?.offset || 0, job);
    const stamp = `${out.dev}:${out.ino}:${out.stamp}`;
    if (prior && stamp !== prior.stamp) throw fail('DIRECTORY_CHANGED');
    let skipped = 0;
    const entries = [];
    for (const item of out.entries) {
      let name; try { name = textBytes(item.nameHex).text; validPath(name, false); } catch { skipped++; continue; }
      entries.push({ name, relativePath: rel === '.' ? name : `${rel}/${name}`, kind: item.kind, size: item.size });
    }
    let nextCursor = null;
    if (out.more) {
      for (const [key, value] of this.cursors) if (value.expires < Date.now()) this.cursors.delete(key);
      if (this.cursors.size >= 64) throw fail('BUSY');
      nextCursor = token(); this.cursors.set(nextCursor, { ctx, rel, offset: out.offset, stamp, expires: Date.now() + 60000, searchJob });
    }
    return { entries, nextCursor, complete: !out.more && !out.limited, partialReason: out.limited ? 'ENTRY_LIMIT' : out.more ? 'PAGE_LIMIT' : null, skipped, boundaryMode: out.mode };
  }
  async search(ctx, rel, query, job) {
    const directories = [{ rel, cursor: undefined }], matches = [], skipped = {};
    let files = 0, bytes = 0, directoryPages = 0, partialReason = null;
    const skip = code => { skipped[code] = (skipped[code] || 0) + 1; };
    try {
      while (directories.length) {
        this.checkJob(job);
        if (++directoryPages > 256) { partialReason = 'DIRECTORY_LIMIT'; break; }
        const d = directories.shift(); const page = await this.list(ctx, d.rel, d.cursor, job, job);
        if (page.nextCursor) directories.unshift({ rel: d.rel, cursor: page.nextCursor });
        if (page.partialReason === 'ENTRY_LIMIT') partialReason = 'ENTRY_LIMIT';
        for (const entry of page.entries) {
          if (entry.kind === 'directory') {
            if (!['node_modules', 'vendor', 'dist', 'build', 'coverage'].includes(entry.name)) {
              if (directories.length >= 256) { partialReason = 'DIRECTORY_LIMIT'; break; }
              directories.push({ rel: entry.relativePath });
            }
            continue;
          }
          if (files >= 2000 || bytes + Math.min(entry.size, 1048577) > 20 * 1024 * 1024) { partialReason = 'SCAN_LIMIT'; break; }
          files++; let data;
          try { data = await this.read(ctx, entry.relativePath, job); } catch (e) {
            if (['FILE_TOO_LARGE', 'UNSUPPORTED_ENCODING', 'PERMISSION_DENIED', 'NOT_FOUND', 'FILE_CHANGED', 'HARDLINK_DENIED', 'SYMLINK_DENIED', 'NOT_REGULAR_FILE', 'PATH_DENIED'].includes(e.code)) { skip(e.code); continue; }
            throw e;
          }
          bytes += data.byteLength;
          if (bytes > 20 * 1024 * 1024) { partialReason = 'SCAN_LIMIT'; break; }
          const lines = data.text.split('\n');
          for (let i = 0; i < lines.length; i++) {
            let start = 0, at;
            while ((at = lines[i].indexOf(query, start)) >= 0) {
              const column = Array.from(lines[i].slice(0, at)).length + 1;
              const snippet = Array.from(lines[i].slice(Math.max(0, at - 40))).slice(0, 240).join('');
              matches.push({ relativePath: entry.relativePath, line: i + 1, column, snippet });
              start = at + query.length;
              if (matches.length >= 200) { partialReason = 'MATCH_LIMIT'; break; }
            }
            if (partialReason === 'MATCH_LIMIT') break;
          }
          if (partialReason) break;
        }
        if (partialReason) break;
      }
    } catch (e) { if (e.code === 'TIMEOUT') partialReason = 'TIMEOUT'; else throw e; }
    if (!partialReason && Object.keys(skipped).length) partialReason = 'FILES_SKIPPED';
    // Search-owned cursors never escape the operation. Reclaim remaining pages.
    for (const [key, value] of this.cursors) if (value.searchJob === job) this.cursors.delete(key);
    return { matches, filesScanned: files, bytesScanned: bytes, skipped, complete: !partialReason, partialReason, observation: 'best-effort; not a project snapshot' };
  }
  async close() {
    this.closed = true; this.invalidate();
    // Requests settle only after each helper emits close (including SIGKILL).
    while (this.jobs.size) await new Promise(resolve => setTimeout(resolve, 5));
  }
}
module.exports = { ProjectReadService, validPath, denyName };
