'use strict';
const { validateNative } = require('./read-support.cjs');
const failure = code => Object.assign(new Error(code), { code });
const LIMIT = 2 * 1024 * 1024 + 4096;
// A job owns one serial session in one immutable native root/sandbox. Child
// capacity includes killed-but-unreaped processes. No unconfined fallback.
class ReaderSession {
  constructor(service, ctx, job) {
    this.service = service; this.job = job; this.pending = null; this.buffer = Buffer.alloc(0); this.stopped = null; this.closed = false; this.abandoned = false; this.ending = false;
    const child = service.spawn(service.binary, [], { shell: false, stdio: ['pipe', 'pipe', 'pipe'], env: { DVL_USER_DATA: service.userDataPath } });
    this.child = child; service.children.add(child); job.child = child;
    this.done = new Promise(resolve => { this.resolveDone = resolve; });
    this.abort = () => this.stop(job.reason || 'CANCELLED');
    job.controller.signal.addEventListener('abort', this.abort, { once: true });
    this.timer = setTimeout(() => this.stop('TIMEOUT'), Math.max(1, job.deadline - Date.now()));
    child.stdin.on('error', () => {});
    child.stderr.on('data', () => {});
    child.stdout.on('data', data => this.receive(data));
    child.on('error', () => this.stop('BOUNDARY_UNSUPPORTED'));
    child.on('close', (code, signal) => {
      service.children.delete(child); service.abandoned.delete(child); this.closed = true;
      clearTimeout(this.timer); clearTimeout(this.grace); job.controller.signal.removeEventListener('abort', this.abort); job.child = null;
      if (this.pending) this.reject(this.stopped || 'RUNTIME_FAILED');
      this.resolveDone();
    });
    child.stdin.write(`session\n${Buffer.from(ctx.root).toString('hex')}\n2e\n0 ${ctx.observed.dev} ${ctx.observed.ino}\n`);
    if (job.controller.signal.aborted) this.abort();
  }
  reject(code) { if (this.pending) { const pending = this.pending; this.pending = null; pending.reject(failure(code)); } }
  receive(data) {
    if (this.stopped || this.abandoned) return;
    if (this.buffer.length + data.length > LIMIT) { this.stop('RESPONSE_TOO_LARGE'); return; }
    this.buffer = Buffer.concat([this.buffer, data]);
    const newline = this.buffer.indexOf(10); if (newline < 0) return;
    if (newline !== this.buffer.length - 1 || !this.pending) { this.stop('RUNTIME_FAILED'); return; }
    let out;
    try { out = validateNative(JSON.parse(this.buffer.subarray(0, newline).toString('utf8')), this.pending.op); }
    catch { this.stop('RUNTIME_FAILED'); return; }
    this.buffer = Buffer.alloc(0); const pending = this.pending; this.pending = null;
    if (!out.ok) pending.reject(failure(out.error)); else pending.resolve(out);
  }
  call(op, rel, offset) {
    if (this.stopped || this.closed || this.pending || this.ending) return Promise.reject(failure(this.stopped || 'RUNTIME_FAILED'));
    return new Promise((resolve, reject) => {
      this.pending = { op, resolve, reject };
      this.child.stdin.write(`${op}\n${Buffer.from(rel).toString('hex')}\n${offset}\n`);
    });
  }
  stop(code) {
    if (this.closed || this.abandoned) return;
    this.stopped ||= code;
    try { this.child.kill('SIGKILL'); } catch {}
    if (!this.grace) this.grace = setTimeout(() => {
      if (this.closed) return;
      this.abandoned = true; this.service.abandoned.add(this.child); this.child.unref();
      clearTimeout(this.timer); this.job.controller.signal.removeEventListener('abort', this.abort); this.job.child = null;
      for (const stream of [this.child.stdin, this.child.stdout, this.child.stderr]) stream.destroy();
      this.buffer = Buffer.alloc(0); this.reject(this.stopped); this.resolveDone();
    }, this.service.killGraceMs);
  }
  async finish() {
    if (!this.closed && !this.abandoned) {
      this.ending = true; this.child.stdin.end();
      // EOF is the normal session shutdown. A helper ignoring EOF is killed.
      const timer = setTimeout(() => this.stop('TIMEOUT'), 100);
      await this.done; clearTimeout(timer);
    }
  }
}
module.exports = { ReaderSession };
