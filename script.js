document.addEventListener('DOMContentLoaded', () => {
  let ws, fileListEl, directoryCache, currentPath, sortMethod, renderTimeout, initialPath;
  function initFileExplorer(path) {
    fileListEl = document.getElementById('fileList');
    fileListEl.classList.remove('hidden');
    document.querySelector('#sortControls').classList.remove('hidden');
    document.querySelector('#locationSelect').classList.add('hidden');
    ws = new WebSocket('ws://localhost:8080');
    directoryCache = new Map();
    currentPath = normalizePath(path);
    initialPath = normalizePath(path);
    sortMethod = 'name';
    renderTimeout = null;
    ws.onopen = () => {
      console.log('Connected to server');
      ws.send(JSON.stringify({ action: 'getFiles', path: path }));
    };
    ws.onmessage = (ev) => {
      const data = JSON.parse(ev.data);
      if (data.action === 'files') {
        handleDirectoryListing(data.data);
      } else if (data.action === 'updateSize' || data.action === 'updateDone') {
        handleSizeUpdate(data);
      }
    };
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      mdui.snackbar({message:'WebSocket connection failed. Please ensure the server is running.'});
      document.getElementById('fileList').innerHTML = '<p>WebSocket connection failed. Please ensure the server is running.</p><mdui-button onclick="location.reload()" class="center-screen">Reload</mdui-button>';
    };
    ws.onclose = () => {
      console.log('Disconnected from server');
    };
  }
    document.querySelector('#analyzeButton').addEventListener('click', () => {
      initFileExplorer(document.querySelector('#locationInput').value);
    });
    document.querySelector('#analyzeDiskButton').addEventListener('click', () => {
      initFileExplorer("/");
    });
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
  function handleDirectoryListing({ path, files }) {
    console.log(`Received ${files.length} files/directories for path: ${path}`);
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
    const { path, size, action } = update;
    const normalizedPath = normalizePath(path);
    const parentDir = dirname(normalizedPath);

    // Update the size of the item in its parent's listing
    if (directoryCache.has(parentDir)) {
      const dirListing = directoryCache.get(parentDir);
      const itemIndex = dirListing.findIndex(item => normalizePath(item.path) === normalizedPath);
      if (itemIndex >= 0) {
        const updatedItem = {
          ...dirListing[itemIndex],
          size,
          sizeStr: formatSize(size),
          updateDone: (action === 'updateDone' || dirListing[itemIndex].updateDone) // Keep updateDone true if it was already set
        };
        dirListing[itemIndex] = updatedItem;
        directoryCache.set(parentDir, dirListing);
      }
    }

    // If the current view is the parent directory, schedule a re-render
    if (normalizePath(currentPath) === parentDir) {
      if (renderTimeout) {
        clearTimeout(renderTimeout);
      }
      renderTimeout = setTimeout(() => {
        if (directoryCache.has(normalizePath(currentPath))) {
          const scrollPosition = fileListEl.scrollTop;
          renderList(directoryCache.get(normalizePath(currentPath)));
          fileListEl.scrollTop = scrollPosition;
        }
      }, 100);
    }
  }
  function renderList(items) {
    console.log(`Rendering ${items.length} items`);
    const ul = document.createElement('mdui-list');

    // Calculate parent's total size
    const parentTotalSize = items.reduce((sum, item) => sum + (item.size || 0), 0);

    // Add "Up one directory" item
    const upItem = document.createElement('mdui-list-item');
    upItem.innerHTML = '🔼 Up one directory';
    upItem.onclick = () => {
      if (currentPath === normalizePath(initialPath)) {
        mdui.snackbar({message: 'You are already at the root directory.'});
        return;
      }
      console.log(currentPath, normalizePath(initialPath));
      navigateToDirectory(dirname(currentPath));
    };
    ul.appendChild(upItem);

    // Sort items based on current sort method
    let sortedItems = [...items];
    if (sortMethod === 'name') {
      sortedItems.sort((a, b) => a.name.localeCompare(b.name));
    } else { // size
      sortedItems.sort((a, b) => (b.size || 0) - (a.size || 0));
    }

    // Create DOM elements for each item
    sortedItems.forEach((item, index) => {
      const normPath = normalizePath(item.path);
      const li = document.createElement('mdui-list-item');
      li.dataset.path = normPath;

      // Calculate proportion
      let proportion = 0;
      if (parentTotalSize > 0 && (item.size || 0) > 0) {
        proportion = (item.size || 0) / parentTotalSize;
      }

      // Determine if progress should be indeterminate
      let isIndeterminate = false;
      if (item.isDirectory) {
        // For directories, progress is indeterminate if size is 0
        if(item.updateDone) {
          isIndeterminate = false; // If updateDone is true, we assume size is known
        }else{
          isIndeterminate = (item.size || 0) <= 0;
        }
      } else {
        // For files, size is usually known immediately, but might be 0 if there was an error
        isIndeterminate = false
      }

      // Generate progress bar HTML
      let progressHTML = '';
      if (isIndeterminate) {
        progressHTML = '<mdui-linear-progress indeterminate></mdui-linear-progress>';
      } else {
        progressHTML = `<mdui-linear-progress value="${proportion}"></mdui-linear-progress>`;
      }

      if (item.isDirectory) {
        li.innerHTML = `${item.name.substring(item.name.lastIndexOf("\\")+1)}<mdui-icon slot="icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Zm0-80h640v-400H447l-80-80H160v480Zm0 0v-480 480Z"/></svg></mdui-icon>${progressHTML}<span slot="description">${formatSize(item.size)}</span>`;
      } else {
        li.innerHTML = `${item.name.substring(item.name.lastIndexOf("\\")+1)}<mdui-icon slot="icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Zm280-520v-200H240v640h480v-440H520ZM240-800v200-200 640-640Z"/></svg></mdui-icon>${progressHTML}<span slot="description">${item.sizeStr || 'Unknown size'}</span>`;
      }

      li.onclick = () => {
        if (item.isDirectory) {
          navigateToDirectory(item.path);
        } else {
          window.open("file:///" + item.path, '_blank');
        }
      };
      ul.appendChild(li);
    });

    // Replace the current list with the new one, preserving scroll position
    const scrollPosition = fileListEl.scrollTop;
    fileListEl.innerHTML = '';
    fileListEl.appendChild(ul);
    fileListEl.scrollTop = scrollPosition;
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

  // Sort buttons event listeners
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
