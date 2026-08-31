import { rm } from 'node:fs/promises';
import { writeJsonAtomically } from './atomic-write.mjs';

export function createLiveProgressWriter(file, context, { intervalMs = 100 } = {}) {
  let latest = null;
  let timer = null;
  let pending = Promise.resolve();
  let visiblePreview = '';
  let reasoningPreview = '';
  let visibleOutput = '';
  let reasoningOutput = '';
  const persist = () => {
    timer = null;
    if (!latest) return;
    const snapshot = latest;
    pending = pending.then(async () => { await writeJsonAtomically(file, snapshot); }).catch(() => {});
  };
  return {
    update(event = {}) {
      if (event.visibleDelta) {
        visibleOutput += event.visibleDelta;
        visiblePreview = `${visiblePreview}${event.visibleDelta}`.slice(-1000);
      }
      if (event.reasoningDelta) {
        reasoningOutput += event.reasoningDelta;
        reasoningPreview = `${reasoningPreview}${event.reasoningDelta}`.slice(-500);
      }
      latest = { ...context, ...event, visibleOutput, reasoningOutput, visiblePreview, reasoningPreview, updatedAt:new Date().toISOString() };
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
