import { rename, rm, writeFile } from 'node:fs/promises';

export function createLiveProgressWriter(file, context, { intervalMs = 100 } = {}) {
  let latest = null;
  let timer = null;
  let pending = Promise.resolve();
  let visiblePreview = '';
  let reasoningPreview = '';
  const persist = () => {
    timer = null;
    if (!latest) return;
    const snapshot = latest;
    pending = pending.then(async () => { const temporary=`${file}.tmp`; await writeFile(temporary, JSON.stringify(snapshot, null, 2)); await rename(temporary, file); }).catch(() => {});
  };
  return {
    update(event = {}) {
      if (event.visibleDelta) visiblePreview = `${visiblePreview}${event.visibleDelta}`.slice(-1000);
      if (event.reasoningDelta) reasoningPreview = `${reasoningPreview}${event.reasoningDelta}`.slice(-500);
      latest = { ...context, ...event, visiblePreview, reasoningPreview, updatedAt:new Date().toISOString() };
      if (!timer) timer = setTimeout(persist, intervalMs);
    },
    async flush(event = null) {
      if (event) this.update(event);
      if (timer) { clearTimeout(timer); timer = null; }
      persist();
      await pending;
    },
    async clear() {
      if (timer) clearTimeout(timer);
      timer = null;
      await pending;
      await rm(file, { force:true });
    }
  };
}
