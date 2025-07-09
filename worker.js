// worker.js
self.onmessage = async e => {
  if (e.data.action === 'init') {
    try {
      const entries = buildEntries(e.data.files);
      const tree   = buildDirectoryMap(entries);
      // send initial listings
      for (const [dir, children] of tree) {
        postMessage({ action:'files', path: dir, files: children });
      }
      // compute sizes bottom-up
      await computeSizes(tree);
    } catch (err) {
      postMessage({ action:'error', message: err.message });
    }
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

// bottom-up directory size calculation
async function computeSizes(tree) {
  // get all directories sorted by descending depth
  const dirs = [];
  for (const [dir, children] of tree) {
    if (dir === '') continue; // skip "root-listing" here
    dirs.push({ path: dir, depth: dir.split('/').length });
  }
  dirs.sort((a, b) => b.depth - a.depth);

  for (const { path } of dirs) {
    const children = tree.get(path) || [];
    let total = 0;
    for (const ch of children) {
      // files carry correct size;
      // directories have been updated in previous iterations
      total += ch.size || 0;
    }
    // update in both our tree and notify main thread
    children.forEach(ch => {
      if (ch.path === path) ch.size = total;
    });
    postMessage({ action:'updateSize', path, size: total });
    postMessage({ action:'updateDone', path, size: total });
    // also update parent‐directory entry
    const parent = path.includes('/')
      ? path.slice(0, path.lastIndexOf('/'))
      : '';
    if (tree.has(parent)) {
      const arr = tree.get(parent);
      const idx = arr.findIndex(x => x.path === path);
      if (idx >= 0) arr[idx].size = total;
    }
    // give the browser a breather on huge trees
    await new Promise(r => setTimeout(r, 0));
  }
}
