/* One observer releases resources owned by controls removed during re-rendering. */
const cleanups = new Map();
let observer;

export function onDisconnect(element, cleanup) {
  cleanups.set(element, cleanup);
  observer ??= new MutationObserver(records => {
    if (!records.some(record => record.removedNodes.length)) return;
    for (const [node, release] of cleanups) {
      if (node.isConnected) continue;
      cleanups.delete(node);
      release();
    }
    if (!cleanups.size) { observer.disconnect(); observer = null; }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

export function within(root, selector) {
  const matches = [...root.querySelectorAll(selector)];
  if (root instanceof Element && root.matches(selector)) matches.unshift(root);
  return matches;
}
