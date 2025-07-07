self.onmessage = e => {
  const data = e.data;
    console.log('[worker] got', data.action);
  if (data.action === 'files') {
    // sort + format into lightweight “item descriptors”
    const items = data.data
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(f => ({
        name:        f.name,
        path:        f.path,
        isDirectory: f.isDirectory,
        sizeStr:     formatSize(f.size)
      }));
      console.log('[worker] posting render,', items.length, 'items');
    self.postMessage({ action: 'render', items });

  } else if (data.action === 'updateSize') {
    console.log('[worker] posting updateSize for', data.path);
    self.postMessage({
      action: 'updateSize',
      path:   data.path,
      sizeStr: formatSize(data.size)
    });
  }
};

function formatSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes','KB','MB','GB','TB'];
  const i = Math.floor(Math.log(bytes)/Math.log(k));
  return (bytes / Math.pow(k,i)).toFixed(2) + ' ' + sizes[i];
}
