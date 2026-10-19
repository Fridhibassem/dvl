'use strict';
// Root-bound read service; C1b exposure is mediated by DesktopReader.
// Root comes from a trusted registry resolver, never from request arguments.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { TextDecoder } = require('node:util');
const os = require('node:os');
const { ReaderSession } = require('./reader-session.cjs');
const { policy, rootAllowed, matchText } = require('./read-support.cjs');
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
  // Conservative refusal of the three reviewed filesystem-folding hazards.
  // This is intentionally not a claim of universal Unicode case folding.
  if (/[\u017f\u212a\u00df\u1e9e]/.test(name)) return true;
  const n = name.toLowerCase();
  return policy.deniedNames.includes(n) || policy.deniedPrefixes.some(x => n.startsWith(x)) || policy.deniedExtensions.some(x => n.endsWith(x));
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
    this.killGraceMs = options.killGraceMs || 2000;
    this.verifyBinary = options.verifyBinary || null;
    this.spawn = options.spawn || spawn; // trusted test seam, never a request option
    this.userDataPath = path.resolve(options.userDataPath || path.join(os.homedir(), process.platform === 'darwin' ? 'Library/Application Support/dvl-desktop' : '.config/dvl-desktop'));
    this.children = new Set(); this.abandoned = new Set();
    this.context = null; this.jobs = new Map(); this.cursors = new Map(); this.queue = []; this.active = 0; this.closed = false;
  }
  bind(projectId) {
    if (this.closed || !idValid(projectId)) throw fail('INVALID_REQUEST');
    this.invalidate();
    const project = this.resolveProject(projectId);
    if (!project || !project.available || project.projectId !== projectId) throw fail('PROJECT_UNAVAILABLE');
    let observed;
    try { observed = identity(project.path); if (!rootAllowed(project.path, this.userDataPath)) throw fail('PROJECT_UNAVAILABLE'); } catch { throw fail('PROJECT_UNAVAILABLE'); }
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
      if (operation === 'searchText' && (typeof req.query !== 'string' || req.query.length === 0 || /[\0\n\r]/.test(req.query) || Buffer.byteLength(req.query) > 256 || Buffer.from(req.query).toString() !== req.query)) throw fail('INVALID_REQUEST');
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
      } finally { if (job.session) await job.session.finish(); this.active--; this.drain(); }
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
    if (!job.session) {
      if (this.children.size >= 2) throw fail('BUSY');
      if (this.verifyBinary && !this.verifyBinary()) throw fail('HELPER_INTEGRITY_FAILED');
      job.session = new ReaderSession(this, ctx, job);
    }
    const result = await job.session.call(op, rel, offset);
    this.current(ctx); this.checkJob(job); return result;
  }
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
    return { entries, nextCursor, complete: !out.more && !out.limited && !skipped && !out.skipped, partialReason: out.limited ? 'ENTRY_LIMIT' : out.more ? 'PAGE_LIMIT' : skipped || out.skipped ? 'ENTRIES_SKIPPED' : null, skipped: skipped + out.skipped, nativeSkipped: out.skipped, boundaryMode: out.mode };
  }
  async search(ctx, rel, query, job) {
    const directories = [{ rel, cursor: undefined }], matches = [], skipped = {};
    let files = 0, bytes = 0, directoryPages = 0, partialReason = null, excludedDirectories = 0;
    const skip = code => { skipped[code] = (skipped[code] || 0) + 1; };
    try {
      while (directories.length) {
        this.checkJob(job);
        if (++directoryPages > 256) { partialReason = 'DIRECTORY_LIMIT'; break; }
        const d = directories.shift(); let page;
        try { validPath(d.rel, true); page = await this.list(ctx, d.rel, d.cursor, job, job); } catch (e) {
          if (['PATH_DENIED', 'PERMISSION_DENIED', 'NOT_FOUND', 'FILE_CHANGED', 'DIRECTORY_CHANGED', 'BUSY', 'RUNTIME_FAILED'].includes(e.code)) { skip(e.code); continue; }
          throw e;
        }
        if (page.nativeSkipped) skipped.NATIVE_ENTRIES_SKIPPED = (skipped.NATIVE_ENTRIES_SKIPPED || 0) + page.nativeSkipped;
        if (page.skipped > (page.nativeSkipped || 0)) skipped.INVALID_NAMES = (skipped.INVALID_NAMES || 0) + page.skipped - (page.nativeSkipped || 0);
        if (page.nextCursor) directories.unshift({ rel: d.rel, cursor: page.nextCursor });
        if (page.partialReason === 'ENTRY_LIMIT') partialReason = 'ENTRY_LIMIT';
        for (const entry of page.entries) {
          if (entry.kind === 'directory') {
            if (!policy.searchExclusions.includes(entry.name)) {
              if (directories.length >= 256) { partialReason = 'DIRECTORY_LIMIT'; break; }
              directories.push({ rel: entry.relativePath });
            } else { excludedDirectories++; }
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
          partialReason = await matchText(data.text, query, entry.relativePath, matches, () => this.checkJob(job));
          if (partialReason) break;
        }
        if (partialReason) break;
      }
    } catch (e) { if (e.code === 'TIMEOUT') partialReason = 'TIMEOUT'; else throw e; }
    if (!partialReason && Object.keys(skipped).length) partialReason = 'FILES_SKIPPED';
    if (!partialReason && excludedDirectories) partialReason = 'DIRECTORIES_EXCLUDED';
    // Search-owned cursors never escape the operation. Reclaim remaining pages.
    for (const [key, value] of this.cursors) if (value.searchJob === job) this.cursors.delete(key);
    return { matches, filesScanned: files, bytesScanned: bytes, skipped, excludedDirectories, complete: !partialReason, partialReason, observation: 'best-effort; not a project snapshot' };
  }
  async close() {
    this.closed = true; this.invalidate();
    const deadline = Date.now() + this.killGraceMs + 100;
    while (this.jobs.size && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
    return { pendingRequests: this.jobs.size, abandonedHelpers: this.abandoned.size, liveHelpers: this.children.size };
  }
}
module.exports = { ProjectReadService, validPath, denyName };
