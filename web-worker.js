// worker.js
let directoryMap = null;
let allFiles = [];
let processingComplete = false;

self.onmessage = async e => {
  if (e.data.action === 'init') {
    directoryMap = buildDirectoryMap([]);
    allFiles = [];
    processingComplete = false;
  } else if (e.data.action === 'addFiles') {
    allFiles = allFiles.concat(e.data.files);
    directoryMap = buildDirectoryMap(allFiles);

    // Send all current directory listings
    for (const [dir, children] of directoryMap) {
      postMessage({ action:'files', path: dir, files: children });
    }

    // Compute sizes only when all files are added
    if (e.data.isLastBatch) {
      processingComplete = true;
      await computeSizes(directoryMap);
      postMessage({ action: 'allDone' });
    }
  }
};

function buildDirectoryMap(entries) {
  const map = new Map();
  if (directoryMap) {
    // Copy existing map
    for (const [dir, children] of directoryMap) {
      map.set(dir, [...children]);
    }
  }

  // Add new entries
  entries.forEach(ent => {
    if (ent.webkitRelativePath) {

   ent.path = ent.webkitRelativePath.replace(/\\/g, '/');

 } else if (!ent.path && ent.name) {

   // fallback for plain File: no directory info, so just use filename

   ent.path = ent.name;

 }

 if (typeof ent.path !== 'string') return;

    const parent = ent.path.includes('/')
      ? ent.path.slice(0, ent.path.lastIndexOf('/'))
      : '';
    if (!map.has(parent)) map.set(parent, []);
    // Check if this entry already exists in the map
    const children = map.get(parent);
    const exists = children.some(c => c.path === ent.path);
    if (!exists) {
      children.push(ent);
    }
  });

  return map;
}

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
    postMessage({ action: 'updateDone', path, size: total });
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

// Function to traverse file tree
function traverseFileTree(entry, callback, onComplete) {
  if (entry.isFile) {
    entry.file((file) => {
      file.webkitRelativePath = entry.fullPath.substring(1); // Remove leading '/'
      callback(file);
      if (onComplete) onComplete();
    }, (error) => {
      console.error("Error reading file:", error);
      if (onComplete) onComplete();
    });
  } else if (entry.isDirectory) {
    const dirReader = entry.createReader();
    dirReader.readEntries((entries) => {
      let processedCount = 0;
      if (entries.length === 0) {
        if (onComplete) onComplete();
        return;
      }
      entries.forEach((subEntry) => {
        traverseFileTree(subEntry, callback, () => {
          processedCount++;
          if (processedCount === entries.length && onComplete) {
            onComplete();
          }
        });
      });
    }, (error) => {
      console.error("Error reading directory:", error);
      if (onComplete) onComplete();
    });
  } else {
    if (onComplete) onComplete();
  }
}