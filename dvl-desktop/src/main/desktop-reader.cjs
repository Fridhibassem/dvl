'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { ProjectReadService, validPath } = require('./project-read-service.cjs');
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const error = code => ({ ok: false, error: { code } });
const knownErrors = new Set(['INVALID_REQUEST', 'PATH_DENIED', 'POLICY_DENIED', 'PROJECT_UNAVAILABLE', 'STALE_CONTEXT', 'BOUNDARY_UNSUPPORTED', 'HELPER_INTEGRITY_FAILED', 'BUSY', 'CANCELLED', 'TIMEOUT', 'NOT_FOUND', 'PERMISSION_DENIED', 'SYMLINK_DENIED', 'HARDLINK_DENIED', 'NOT_REGULAR_FILE', 'FILE_TOO_LARGE', 'FILE_CHANGED', 'DIRECTORY_CHANGED', 'INVALID_CURSOR', 'RESPONSE_TOO_LARGE', 'UNSUPPORTED_ENCODING', 'RUNTIME_FAILED']);
const safeCode = e => knownErrors.has(e?.code) ? e.code : 'RUNTIME_FAILED';
function exact(value, required, optional = []) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    required.every(k => Object.hasOwn(value, k)) &&
    Object.keys(value).every(k => required.includes(k) || optional.includes(k));
}
function verifyHelper(binary, manifestPath) {
  try {
    if (binary.split(path.sep).some(p => p.endsWith('.asar'))) return false;
    const st = fs.lstatSync(binary);
    if (!st.isFile() || st.isSymbolicLink() || st.size > 20 * 1024 * 1024 || st.size === 0 || !(st.mode & 0o111)) return false;
    if (fs.statSync(manifestPath).size > 1024) return false;
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return exact(m, ['platform', 'arch', 'sha256']) && m.platform === process.platform && m.arch === process.arch &&
      typeof m.sha256 === 'string' && /^[a-f0-9]{64}$/.test(m.sha256) &&
      crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex') === m.sha256;
  } catch { return false; }
}
// One controller, one service for the app lifetime. No renderer-chosen binding.
class DesktopReader {
  constructor({ app, ipcMain, resolveProject, getWindow, logEvent }) {
    this.getWindow = getWindow; this.logEvent = logEvent;
    this.url = pathToFileURL(path.join(__dirname, '../renderer/index.html')).href;
    this.binary = app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked/bin/project-reader') : path.join(__dirname, '../../bin/project-reader');
    this.manifest = path.join(__dirname, '../../bin/reader-integrity.json');
    this.integrityError = verifyHelper(this.binary, this.manifest) ? null : 'HELPER_INTEGRITY_FAILED';
    this.service = new ProjectReadService(resolveProject, {
      userDataPath: app.getPath('userData'), binary: this.binary,
      verifyBinary: () => verifyHelper(this.binary, this.manifest)
    });
    this.project = null; this.binding = null; this.bindingError = null;
    this.epoch = 0; this.documentEpoch = 0; this.owners = new Map(); this.rates = new Map(); this.closing = false; this.closeResult = null;
    for (const op of ['listDirectory', 'readTextFile', 'searchText']) {
      ipcMain.handle('dvl:reader:' + op, (event, ...args) => this.request(event, op, args));
    }
    ipcMain.handle('dvl:reader:context', (event, ...args) => {
      if (!this.isTrusted(event)) return error('SENDER_DENIED');
      if (args.length) return error('INVALID_REQUEST');
      if (!this.rate(event.sender, 'context')) return error('BUSY');
      return this.status();
    });
    ipcMain.handle('dvl:reader:cancel', (event, ...args) => this.cancel(event, args));
  }
  isTrusted(event) {
    try {
      const win = this.getWindow(), sender = event?.sender, frame = event?.senderFrame;
      return !!win && !!sender && !sender.isDestroyed() && sender === win.webContents &&
        !!frame && frame === sender.mainFrame && frame.url === this.url && sender.getURL() === this.url;
    } catch { return false; }
  }
  rate(sender, kind) {
    const now = performance.now();
    let state = this.rates.get(sender);
    if (!state) { state = {}; this.rates.set(sender, state); }
    const limit = kind === 'request' ? 30 : 20;
    let bucket = state[kind];
    if (!bucket || now - bucket.start >= 1000) bucket = state[kind] = { start: now, count: 0 };
    return ++bucket.count <= limit;
  }
  resetDocument(sender) {
    this.epoch++; this.documentEpoch++; this.binding = null; this.service.invalidate();
    for (const owner of this.owners.values()) if (owner.sender === sender) owner.revoked = true;
    // Do not reset rate buckets on reload: reload cannot replenish capacity.
  }
  attach(win) {
    const sender = win.webContents;
    sender.setWindowOpenHandler(() => ({ action: 'deny' }));
    sender.on('will-navigate', event => event.preventDefault());
    sender.on('will-attach-webview', event => event.preventDefault());
    sender.on('did-start-navigation', (_event, _url, _inPlace, isMainFrame) => {
      if (isMainFrame) this.resetDocument(sender);
    });
    sender.on('did-finish-load', () => {
      if (sender === this.getWindow()?.webContents && sender.getURL() === this.url && !this.closing) this.select(this.project);
    });
    sender.on('render-process-gone', () => this.resetDocument(sender));
    sender.on('destroyed', () => { this.resetDocument(sender); this.rates.delete(sender); });
  }
  select(project) {
    this.epoch++; this.service.invalidate(); this.binding = null; this.project = project;
    this.bindingError = this.integrityError;
    if (this.closing) return;
    if (!this.bindingError && project) {
      try { this.binding = this.service.bind(project.projectId); }
      catch (e) { this.bindingError = safeCode(e); }
    }
    this.publish();
  }
  status() {
    return { ok: true, context: this.binding, error: this.bindingError ? { code: this.bindingError } : null,
      closing: this.closing, shutdown: this.closeResult,
      completeness: 'over permitted files only; best-effort observation, not a project snapshot' };
  }
  publish() {
    try {
      const sender = this.getWindow()?.webContents;
      if (sender && !sender.isDestroyed() && sender.getURL() === this.url) sender.send('dvl:reader:state', this.status());
    } catch { /* No payload, path, query or content is logged. */ }
  }
  validRequest(op, req) {
    const extra = op === 'searchText' ? ['query'] : [];
    if (!exact(req, ['requestId', 'projectId', 'contextGeneration', 'relativePath', ...extra], op === 'listDirectory' ? ['cursor'] : [])) return false;
    if (![req.requestId, req.projectId, req.contextGeneration].every(id)) return false;
    if (req.cursor !== undefined && !id(req.cursor)) return false;
    if (op === 'searchText' && (typeof req.query !== 'string' || !req.query || /[\0\r\n]/.test(req.query) || Buffer.byteLength(req.query) > 256 || Buffer.from(req.query).toString() !== req.query)) return false;
    validPath(req.relativePath, op !== 'readTextFile');
    return true;
  }
  async request(event, op, args) {
    if (!this.isTrusted(event)) return error('SENDER_DENIED');
    let req, owner;
    try {
      if (args.length !== 1 || !this.validRequest(op, args[0])) return error('INVALID_REQUEST');
      req = args[0];
      if (this.closing) return error('STALE_CONTEXT');
      if (this.integrityError) return error(this.integrityError);
      if (!this.binding || req.projectId !== this.binding.projectId || req.contextGeneration !== this.binding.contextGeneration) return error('STALE_CONTEXT');
      if (!this.rate(event.sender, 'request') || this.owners.size >= 4) return error('BUSY');
      if (this.owners.has(req.requestId)) return error('INVALID_REQUEST');
      owner = { sender: event.sender, frame: event.senderFrame, epoch: this.epoch, context: this.binding, revoked: false };
      this.owners.set(req.requestId, owner);
      const result = await this.service.request(op, req);
      if (owner.revoked || this.closing || owner.epoch !== this.epoch || owner.context !== this.binding || !this.isTrusted(event) || event.senderFrame !== owner.frame) return error('STALE_CONTEXT');
      if (!result.ok) return { ...result, error: { code: safeCode(result.error) } };
      return result;
    } catch (e) { return error(safeCode(e)); }
    finally { if (owner && this.owners.get(req.requestId) === owner) this.owners.delete(req.requestId); }
  }
  cancel(event, args) {
    if (!this.isTrusted(event)) return error('SENDER_DENIED');
    const req = args[0];
    if (args.length !== 1 || !exact(req, ['projectId', 'contextGeneration', 'requestId']) || ![req.projectId, req.contextGeneration, req.requestId].every(id)) return error('INVALID_REQUEST');
    if (!this.rate(event.sender, 'cancel')) return error('BUSY');
    const owner = this.owners.get(req.requestId);
    if (!owner || owner.revoked || owner.sender !== event.sender || owner.frame !== event.senderFrame || owner.epoch !== this.epoch || owner.context.projectId !== req.projectId || owner.context.contextGeneration !== req.contextGeneration) return { ok: true, acknowledged: false };
    try { return { ok: true, ...this.service.cancel(req, req.requestId) }; }
    catch (e) { return error(safeCode(e)); }
  }
  async close() {
    if (this.closePromise) return this.closePromise;
    this.closing = true; this.binding = null; this.epoch++;
    this.closePromise = this.service.close().then(counts => {
      this.closeResult = counts;
      this.logEvent('info', 'reader.shutdown', counts); this.publish();
      return counts;
    });
    return this.closePromise;
  }
}
module.exports = { DesktopReader, verifyHelper };
