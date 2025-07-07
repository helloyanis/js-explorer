document.addEventListener('DOMContentLoaded', () => {
  const ws = new WebSocket('ws://localhost:8080');
  const fileListEl = document.getElementById('fileList');
  const directoryCache = new Map();
  let currentPath = '/';
  let sortMethod = 'name';
  let renderTimeout = null;

  // Add sort controls
  const sortControls = document.createElement('div');
  sortControls.id = 'sortControls';
  sortControls.innerHTML = `
    <button id="sortByName">Sort by Name</button>
    <button id="sortBySize">Sort by Size</button>
  `;
  document.body.insertBefore(sortControls, fileListEl);

  // Helper functions
  function normalizePath(path) {
    if (!path) return '';
    return path.replace(/\\/g, '/').replace(/\/$/, '');
  }

  function dirname(filePath) {
    const normalized = normalizePath(filePath);
    const parts = normalized.split('/');
    if (parts.length <= 1) return '/'; // root directory
    parts.pop();
    return parts.join('/') || '/';
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes','KB','MB','GB','TB'];
    const i = Math.floor(Math.log(bytes)/Math.log(k));
    return (bytes / Math.pow(k,i)).toFixed(2) + ' ' + sizes[i];
  }

  ws.onopen = () => {
    console.log('Connected to server');
    ws.send(JSON.stringify({ action: 'getFiles', path: '/' }));
  };

  ws.onmessage = (ev) => {
    const data = JSON.parse(ev.data);
    if (data.action === 'files') {
      handleDirectoryListing(data.data);
    } else if (data.action === 'updateSize') {
      handleSizeUpdate(data);
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  ws.onclose = () => {
    console.log('Disconnected from server');
  };

  function handleDirectoryListing({ path, files }) {
    const normalizedPath = normalizePath(path);
    const filesWithFormattedSizes = files.map(file => ({
      ...file,
      path: normalizePath(file.path),
      sizeStr: formatSize(file.size)
    }));
    directoryCache.set(normalizedPath, filesWithFormattedSizes);
    if (normalizePath(currentPath) === normalizedPath) {
      renderList(filesWithFormattedSizes);
    }
  }

  function handleSizeUpdate(update) {
    const { path, size } = update;
    const normalizedPath = normalizePath(path);
    const parentDir = dirname(normalizedPath);

    if (directoryCache.has(parentDir)) {
      const dirListing = directoryCache.get(parentDir);
      const itemIndex = dirListing.findIndex(item => normalizePath(item.path) === normalizedPath);
      if (itemIndex >= 0) {
        const updatedItem = { ...dirListing[itemIndex], size, sizeStr: formatSize(size) };
        dirListing[itemIndex] = updatedItem;
        directoryCache.set(parentDir, dirListing);
      }
    } else {
      const newItem = {
        name: path.split('/').pop(),
        path: normalizedPath,
        isDirectory: false,
        size,
        sizeStr: formatSize(size)
      };
      directoryCache.set(parentDir, [...(directoryCache.get(parentDir) || []), newItem]);
    }

    if (renderTimeout) {
      clearTimeout(renderTimeout);
    }
    renderTimeout = setTimeout(() => {
      if (directoryCache.has(normalizePath(currentPath))) {
        renderList(directoryCache.get(normalizePath(currentPath)));
      }
    }, 100);
  }

  function renderList(items) {
    fileListEl.innerHTML = '';
    const ul = document.createElement('mdui-list');
    let sortedItems = [...items];
    if (sortMethod === 'name') {
      sortedItems.sort((a, b) => a.name.localeCompare(b.name));
    } else { // size
      sortedItems.sort((a, b) => b.size - a.size);
    }
    // Add list elemeent to go up one directory
      const upItem = document.createElement('mdui-list-item');
      upItem.innerHTML = '🔼 Up one directory';
      upItem.onclick = () => {
        navigateToDirectory(dirname(currentPath));
      };
      ul.appendChild(upItem);
    sortedItems.forEach(item => {
      const normPath = normalizePath(item.path);
      const li = document.createElement('mdui-list-item');
      li.dataset.path = normPath;
      if (item.isDirectory) {
        const dirSize = getDirectorySize(item.path);
        li.innerHTML = `${item.name}<mdui-icon slot="icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Zm0-80h640v-400H447l-80-80H160v480Zm0 0v-480 480Z"/></svg></mdui-icon>`;
        li.description=formatSize(dirSize)
        li.size=dirSize;
      } else {
        li.innerHTML = `${item.name} (${item.sizeStr})<mdui-icon slot="icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Zm280-520v-200H240v640h480v-440H520ZM240-800v200-200 640-640Z"/></svg></mdui-icon>`;
      }
      li.onclick = () => {
        if (item.isDirectory) {
          navigateToDirectory(item.path);
        }else {
          window.open("file:///" + item.path, '_blank');
        }
      };
      ul.appendChild(li);
    });
    fileListEl.appendChild(ul);
  }

  function navigateToDirectory(dirPath) {
    const normalizedDirPath = normalizePath(dirPath);
    currentPath = normalizedDirPath;
    if (directoryCache.has(normalizedDirPath)) {
      renderList(directoryCache.get(normalizedDirPath));
    } else {
      ws.send(JSON.stringify({ action: 'getFiles', path: dirPath }));
    }
  }

function getDirectorySize(dirPath) {
  const normalizedDirPath = normalizePath(dirPath);
  let totalSize = 0;

  // Parcourt tous les dossiers dans le cache
  for (const [cachedPath, items] of directoryCache.entries()) {
    // Vérifie si le chemin du cache commence par le chemin du dossier demandé
    if (
      cachedPath === normalizedDirPath ||
      cachedPath.startsWith(normalizedDirPath + '/')
    ) {
      for (const item of items) {
        // Ajoute la taille uniquement des fichiers (pas des dossiers)
        if (!item.isDirectory) {
          totalSize += item.size || 0;
        }
      }
    }
  }
  return totalSize;
}

  document.getElementById('sortByName').addEventListener('click', () => {
    sortMethod = 'name';
    if (directoryCache.has(normalizePath(currentPath))) {
      renderList(directoryCache.get(normalizePath(currentPath)));
    }
  });

  document.getElementById('sortBySize').addEventListener('click', () => {
    sortMethod = 'size';
    if (directoryCache.has(normalizePath(currentPath))) {
      renderList(directoryCache.get(normalizePath(currentPath)));
    }
  });
});
