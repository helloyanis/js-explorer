let fileList = [];

self.onmessage = async e => {
  if (e.data.action === 'init') {
    try {
      fileList = e.data.files;
      const entries = buildEntries(e.data.files);
      const tree = buildDirectoryMap(entries);
      // Send total count of entries (files + directories)
      postMessage({ action: 'totalCount', count: entries.length });
      // Send initial listings
      for (const [dir, children] of tree) {
        postMessage({ action:'files', path: dir, files: children });
      }
      // Send updateDone messages for each file
      entries.filter(ent => !ent.isDirectory).forEach(ent => {
        postMessage({ action: 'updateDone', path: ent.path, size: ent.size });
      });
      // Compute sizes for directories
      await computeSizes(tree);
      postMessage({ action: 'allDone' });
    } catch (err) {
      postMessage({ action:'error', message: err.message });
    }
  }
  if (e.data.action === 'getFileByPath') {
    const file = Array.from(fileList).find(f => f.webkitRelativePath === e.data.path) || null;
    postMessage({ action: 'fileResult', path: e.data.path, file });
  }
};
// turn File objects into { path, name, isDirectory, size }
function buildEntries(fileObjs) {
  const files = fileObjs.map(f => ({
    path:       f.webkitRelativePath.replace(/\\/g,'/'),
    name:       f.name,
    isDirectory:false,
    size:       f.size
  }));
  const dirs = new Set();
  files.forEach(f => {
    const parts = f.path.split('/');
    parts.pop(); // remove file
    let acc = '';
    parts.forEach(p => {
      acc = acc ? `${acc}/${p}` : p;
      dirs.add(acc);
    });
  });
  const dirEntries = Array.from(dirs).map(d => ({
    path:        d,
    name:        d.split('/').pop(),
    isDirectory: true,
    size:        0
  }));
  return [...files, ...dirEntries];
}
// build a Map< directoryPath, Array<entry> >
function buildDirectoryMap(entries) {
  const map = new Map();
  entries.forEach(ent => {
    const parent = ent.path.includes('/')
      ? ent.path.slice(0, ent.path.lastIndexOf('/'))
      : '';
    if (!map.has(parent)) map.set(parent, []);
    map.get(parent).push(ent);
  });
  return map;
}
// topological (Kahn) directory size calculation, so each dir
// is reported as soon as its own children are ready
async function computeSizes(tree) {
  // 1) Count direct-subdirectory children for each directory
  const pending = new Map();
  for (const [dir, children] of tree) {
    // how many of its children are directories?
    const subdirs = children.filter(ch => ch.isDirectory).length;
    pending.set(dir, subdirs);
  }

  // 2) Seed queue with all “leaf” directories (no subdirs)
  const queue = [];
  for (const [dir, count] of pending) {
    if (count === 0) queue.push(dir);
  }

  // 3) Process until every directory has been sized
  while (queue.length) {
    const path = queue.shift();
    const children = tree.get(path) || [];
    // sum up sizes (files already have size; subdirs have been filled in when they themselves
    // were processed earlier)
    const total = children.reduce((sum, ch) => sum + (ch.size || 0), 0);

    // notify the main thread right away
    postMessage({ action: 'updateDone', path, size: total });

    // update the tree so that its parent sees this new size
    const parent = path.includes('/')
      ? path.slice(0, path.lastIndexOf('/'))
      : '';
    if (tree.has(parent)) {
      const siblings = tree.get(parent);
      const idx = siblings.findIndex(x => x.path === path);
      if (idx >= 0) siblings[idx].size = total;
    }

    // decrement the “waiting” count on its parent; if that hits zero, enqueue
    if (pending.has(parent)) {
      const left = pending.get(parent) - 1;
      pending.set(parent, left);
      if (left === 0) queue.push(parent);
    }

    // let the browser breathe on large trees
    await new Promise(r => setTimeout(r, 0));
  }
}