'use strict';
(() => {
  const el = name => document.getElementById(name);
  let selected = null, context = null, directory = '.', cursor = null;
  let revision = 0, action = 0, contextFetch = 0;
  const pending = new Map();
  const status = text => { el('filesStatus').textContent = text; };
  function clear() {
    el('fileEntries').textContent = ''; el('fileText').textContent = '';
    el('fileTitle').textContent = ''; el('searchResults').textContent = '';
    el('directoryName').textContent = '.'; cursor = null;
    el('filesMore').hidden = true;
  }
  function controls() {
    const disabled = !context;
    for (const name of ['filesRefresh', 'filesUp', 'filesSearch', 'filesQuery', 'filesMore']) el(name).disabled = disabled;
    el('filesUp').disabled = disabled || directory === '.';
    el('filesStop').disabled = pending.size === 0;
  }
  function cancelPending() {
    for (const req of pending.values()) {
      window.dvl.cancelRead({ projectId: req.projectId, contextGeneration: req.contextGeneration, requestId: req.requestId }).catch(() => {});
    }
  }
  function stop() { action++; cancelPending(); controls(); status('Stopped.'); }
  async function request(op, values, ticket) {
    const bound = context, generation = revision;
    if (!bound) return null;
    const req = { ...bound, ...values, requestId: crypto.randomUUID() };
    pending.set(req.requestId, req); controls();
    try {
      const result = await window.dvl[op](req);
      if (generation !== revision || context !== bound || ticket !== action) return null;
      if (!result?.ok) { status('Reader: ' + (result?.error?.code || 'RUNTIME_FAILED')); return null; }
      if (result.requestId !== req.requestId || result.projectId !== bound.projectId || result.contextGeneration !== bound.contextGeneration) { status('Reader: STALE_CONTEXT'); return null; }
      return result.data;
    } catch { if (generation === revision && ticket === action) status('Reader request failed.'); return null; }
    finally { pending.delete(req.requestId); controls(); }
  }
  function button(text, run) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
    b.addEventListener('click', run); return b;
  }
  async function list(rel, next) {
    cancelPending(); const ticket = ++action;
    el('searchResults').textContent = ''; el('fileText').textContent = ''; el('fileTitle').textContent = '';
    if (!next) { el('fileEntries').textContent = ''; cursor = null; el('filesMore').hidden = true; }
    status('Loading permitted entries…');
    const data = await request('listDirectory', { relativePath: rel, ...(next ? { cursor: next } : {}) }, ticket);
    if (!data) return;
    directory = rel; cursor = data.nextCursor;
    el('directoryName').textContent = rel;
    for (const entry of data.entries) {
      const b = button((entry.kind === 'directory' ? '▸ ' : '') + entry.name,
        () => entry.kind === 'directory' ? list(entry.relativePath) : read(entry.relativePath));
      b.className = 'file-entry'; el('fileEntries').appendChild(b);
    }
    el('filesMore').hidden = !cursor; controls();
    status(data.complete ? 'Complete over permitted entries on this page.' :
      `Partial: ${data.partialReason}; skipped: ${data.skipped}.`);
  }
  async function read(rel) {
    cancelPending(); const ticket = ++action;
    el('fileText').textContent = ''; el('fileTitle').textContent = rel; status('Reading…');
    const data = await request('readTextFile', { relativePath: rel }, ticket);
    if (!data) return;
    el('fileText').textContent = data.text;
    el('fileTitle').scrollIntoView?.({ block: 'start' });
    status(`Read ${data.byteLength} bytes. Observation only; not a project snapshot.`);
  }
  async function search() {
    cancelPending(); const ticket = ++action;
    el('searchResults').textContent = ''; el('fileText').textContent = ''; el('fileTitle').textContent = '';
    status('Searching permitted files…');
    const data = await request('searchText', { relativePath: directory, query: el('filesQuery').value }, ticket);
    if (!data) return;
    for (const match of data.matches) {
      const b = button(`${match.relativePath}:${match.line}:${match.column} — ${match.snippet}`, () => read(match.relativePath));
      b.className = 'search-match'; el('searchResults').appendChild(b);
    }
    const skips = Object.values(data.skipped).reduce((a, b) => a + b, 0);
    status(`${data.matches.length} matches; ${data.filesScanned} files scanned; ${data.bytesScanned} text bytes; ${data.bytesRead} read-budget bytes (estimate); ${data.elapsedMs} ms. ` +
      (data.complete ? 'Complete over permitted files.' : `Partial: ${data.partialReason}; excluded directories: ${data.excludedDirectories}; skipped: ${skips}.`));
  }
  function applyState(state) {
    revision++; action++; cancelPending(); context = null; clear();
    if (state?.shutdown) {
      const c = state.shutdown;
      status(`Shutdown: pending ${c.pendingRequests}; live ${c.liveHelpers}; abandoned ${c.abandonedHelpers}.`);
    } else if (state?.error) status('Reader: ' + state.error.code);
    else if (state?.context?.projectId === selected && !state.closing) {
      context = state.context; directory = '.'; status('Ready.');
    } else status(selected ? 'Reader unavailable for this project.' : 'Open a project to inspect permitted files.');
    controls(); if (context) list('.');
  }
  window.dvl.onReaderState(state => {
    contextFetch++; applyState(state);
  });
  window.dvlFiles = {
    async showProject(projectId) {
      selected = projectId; revision++; action++; cancelPending(); context = null; clear(); controls();
      const fetch = ++contextFetch;
      if (!selected) { status('Open a project to inspect permitted files.'); return; }
      status('Checking reader…');
      try {
        const state = await window.dvl.getReadContext();
        if (fetch === contextFetch) applyState(state);
      } catch { if (fetch === contextFetch) status('Reader unavailable.'); }
    }
  };
  el('filesRefresh').addEventListener('click', () => list(directory));
  el('filesUp').addEventListener('click', () => list(directory.includes('/') ? directory.slice(0, directory.lastIndexOf('/')) : '.'));
  el('filesMore').addEventListener('click', () => { if (cursor) list(directory, cursor); });
  el('filesStop').addEventListener('click', stop);
  el('filesSearchForm').addEventListener('submit', event => { event.preventDefault(); search(); });
  controls();
})();
