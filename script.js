// script.js
document.addEventListener('DOMContentLoaded', () => {
  let directoryCache = new Map();
  let currentPath = '';
  let initialPath = '';
  let sortMethod = 'name';
  let displayMode = 'tree';
  let fileSizeFilter = 0; // in MB
  let renderTimeout = null;
  let worker = null;
  let startTime = 0;
  let endTime = 0;
  let hasDroppedFiles = false;
  let totalFilesToScan = 0;
  let filesScanned = 0;
  let automaticNavChange = false;

  // UI elements
  const locationSelectEl = document.getElementById('locationSelect');
  const fileListEl       = document.getElementById('fileList');
  const sortControlsEl   = document.getElementById('sortControls');
  const filePicker       = document.getElementById('filePicker');
  const scanButton       = document.getElementById('scanButton');
  const loadingMessage   = document.getElementById('loadingMessage');
  const resetButton      = document.getElementById('resetButton');
  const sizeFilterEl     = document.getElementById('sizeFilter');
  const scanResultsEl    = document.getElementById('scanResults');
  const navigationRail   = document.getElementById('navigationRail');
  const dropArea         = document.getElementById('dropArea');
  const scanProgress     = document.getElementById('scanProgress');
  const filePreview      = document.getElementById('filePreview');
  const filePreviewTitle = document.getElementById('filePreviewTitle');
  const filePreviewClose = document.getElementById('filePreviewClose');
  const filePreviewContent=document.getElementById('filePreviewContent');
  const filePreviewFullscreen=document.getElementById('filePreviewFullscreen');


  filePreviewClose.addEventListener('click', _=> filePreview.open = false)
  filePreviewFullscreen.addEventListener('click', _=>{
    if (filePreview.hasAttribute("fullscreen")){
      filePreview.fullscreen = false
      filePreviewFullscreen.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <path fill="lime" d="M9.7 9.71a1 1 0 0 1-1.41 0L3.5 4.92l-.35.34-1.44 1.45a1 1 0 0 1-1.09.21A.99.99 0 0 1 0 6V1a1 1 0 0 1 1-1h5c.4 0 .77.24.92.62a1 1 0 0 1-.21 1.09L5.26 3.15l-.34.35 4.79 4.79a1 1 0 0 1 0 1.42zm4.6 0a1 1 0 0 0 1.41 0l4.8-4.79.34.34 1.44 1.45a1 1 0 0 0 1.09.21A.99.99 0 0 0 24 6V1a1 1 0 0 0-1-1h-5c-.4 0-.77.24-.92.62a1 1 0 0 0 .21 1.09l1.45 1.44.34.35-4.79 4.79a1 1 0 0 0 0 1.42zm-4.6 4.58A.98.98 0 0 0 9 14c-.26 0-.51.1-.71.29L3.5 19.08l-.35-.34-1.44-1.45a1 1 0 0 0-1.09-.21A.99.99 0 0 0 0 18v5a1 1 0 0 0 1 1h5c.4 0 .77-.24.92-.62a1 1 0 0 0-.21-1.09l-1.45-1.44-.34-.35 4.79-4.79a1 1 0 0 0 0-1.42zm4.6 0a1 1 0 0 1 1.41 0l4.8 4.79.34-.34 1.44-1.45a1 1 0 0 1 1.09-.21c.38.15.62.52.62.92v5a1 1 0 0 1-1 1h-5a.99.99 0 0 1-.92-.62 1 1 0 0 1 .21-1.09l1.45-1.44.34-.35-4.79-4.79a1 1 0 0 1 0-1.42z"/>
        </svg>
      `
    } else {
      filePreview.fullscreen = true
      filePreviewFullscreen.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <path fill="lime" d="M21 15a1 1 0 0 1 .12 2H17v4a1 1 0 0 1-.88 1H16a1 1 0 0 1-1-.88V16a1 1 0 0 1 .88-1H21ZM8 15h.12a1 1 0 0 1 .87.88L9 16v5.12a1 1 0 0 1-.88.87L8 22h-.12a1 1 0 0 1-.87-.88L7 21v-4H2.88a1 1 0 0 1 0-2H8Zm8-13h.12a1 1 0 0 1 .87.88L17 3v4h4.12a1 1 0 0 1 0 2h-5.24a1 1 0 0 1-.87-.88L15 8V2.88a1 1 0 0 1 .88-.87L16 2ZM8 2a1 1 0 0 1 1 .88V8a1 1 0 0 1-.88 1H3a1 1 0 0 1-.12-2H7V3a1 1 0 0 1 .88-1H8Z"/>
        </svg>
      `
    }
  })

  mdui.setColorScheme('#EAC452');

  // Displays an alert if the user is not on Firefox
  if (navigator.userAgent.indexOf('Gecko/') === -1) {
      if (sessionStorage.getItem('browserWarningShown') !== 'true'){ // Don't show again if already shown
      mdui.alert({
        headline: 'Browser Compatibility Warning',
        description: 'This application is optimized for Firefox. Please use Firefox for the best experience.',
      });
      sessionStorage.setItem('browserWarningShown', 'true');
    }
  }

  // Attempt to read the file selector (browser caches it across reloads)
  if (filePicker.files.length > 0) {
    scanButton.disabled = false;
    scanButton.loading = false;
    loadingMessage.classList.add('hidden');
    dropArea.classList.remove('hidden');
    startLocalScan(Array.from(filePicker.files));
  }
  scanButton.addEventListener('click', () => {
    filePicker.click();
  });
  navigationRail.addEventListener('change', (event) => {
    if(navigationRail.disabled && !automaticNavChange) {
      mdui.snackbar({ message: 'Please wait for the scan to finish!' });
      // Revert to previous value
      automaticNavChange = true;
      navigationRail.value=='home' ? scanResultsEl.click() : resetButton.click();
      return;
    }
    
    console.log('Navigation rail changed:', event.target.value);
    if(event.target.value === 'scan') {
      //Check for files to scan from picker or drag and drop
      if (!filePicker.files.length && !hasDroppedFiles && !automaticNavChange) {
        mdui.snackbar({ message: 'Please start a scan first!' });
        resetUI();
        return;
      }
      // Swap UI to show scan results
      locationSelectEl.classList.add('hidden');
      sortControlsEl.classList.remove('hidden');
      fileListEl.classList.remove('hidden');
      if(!directoryCache.size) return
    if (displayMode === 'all') {
      renderAllFiles();
    } else {
      navigationRail.disabled = false
      renderList(directoryCache.get(currentPath) || []);
    }
    } else if (event.target.value === 'home') {
      // Reset UI to initial state
      resetUI();
    }
  });
  filePicker.addEventListener('change', () => {
    scanButton.disabled = false;
    scanButton.loading = false;
    loadingMessage.classList.add('hidden');
    dropArea.classList.remove('hidden');
    if (!filePicker.files.length) {
      mdui.snackbar({ message: 'Please pick at least one file or a directory! (If you selected system files, please retry by drag and dropping them into the window!!)' });
      return;
    }
    hasDroppedFiles = false; // reset drop state
    startLocalScan(Array.from(filePicker.files));
  });
  filePicker.addEventListener("click", (e) => {
    scanButton.disabled = true;
    scanButton.loading = true;
    loadingMessage.classList.remove('hidden');
    dropArea.classList.add('hidden');
    navigationRail.disabled = true;
  });
  filePicker.addEventListener("cancel", (e) => {
    scanButton.disabled = false;
    scanButton.loading = false;
    loadingMessage.classList.add('hidden');
    dropArea.classList.remove('hidden');
    navigationRail.disabled = false;
    mdui.snackbar({ message: 'File selection cancelled.' });
  });

      // Add drag-and-drop event listeners
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Optional: Add visual feedback
    document.body.classList.add('dragover');
  });
  document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Remove visual feedback
    document.body.classList.remove('dragover');
  });
  document.addEventListener('drop', async e => {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.remove('dragover');

    const items = e.dataTransfer.items;
    if (!items || items.length === 0) {
      mdui.snackbar({ message: 'No files or directories dropped.' });
      return resetUI();
    }

    // Show loading UI
    locationSelectEl.classList.add('hidden');
    sortControlsEl.classList.remove('hidden');
    fileListEl.classList.remove('hidden');
    navigationRail.disabled = true;
    fileListEl.innerHTML = '<h3 class="loading-message-2">Collecting all your files, please wait!</h3><mdui-circular-progress indeterminate class="center-screen"></mdui-circular-progress>';
    loadingMessage.classList.remove('hidden');
    scanButton.disabled = true;
    scanButton.loading = true;
    dropArea.classList.add('hidden');
    automaticNavChange = true; // Allow navigation rail change
    navigationRail.value = 'scan';
    hasDroppedFiles = true;


    // 1) Traverse all entries and collect the File objects
    const fileList = [];
    let processed = 0;
    const total = items.length;

    await new Promise(resolve => {
      for (let i = 0; i < total; i++) {
        const entry = items[i].webkitGetAsEntry();
        if (!entry) {
          processed++;
          if (processed === total) resolve();
          continue;
        }
        traverseFileTree(entry,
          file => fileList.push(file),
          () => {
            processed++;
            if (processed === total) {
              resolve();
            }
          }
        );
      }
    });

    if (fileList.length === 0) {
      mdui.snackbar({ message: 'No valid files found in the drop.' });
      return resetUI();
    }
    // 2) Kick off your normal scan logic
    startLocalScan(fileList);
  });


  
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

  function resetUI() {
    // Reset UI to initial state
    locationSelectEl.classList.remove('hidden');
    sortControlsEl.classList.add('hidden');
    fileListEl.classList.add('hidden');
    fileListEl.innerHTML = '';
    loadingMessage.classList.add('hidden');
    dropArea.classList.remove('hidden');
    scanButton.disabled = false;
    scanButton.loading = false;
  }
  sizeFilterEl.addEventListener('input', () => {
    const value = parseFloat(sizeFilterEl.value);
    if (isNaN(value) || value < 0) {
      fileSizeFilter = 0;
    } else {
      fileSizeFilter = value * 1024 * 1024; // convert to bytes
    }
    if (displayMode === 'all') {
      renderAllFiles();
    } else {
      renderList(directoryCache.get(currentPath) || []);
    }
  });
  // Kick things off
  function startLocalScan(fileList) {
    // Reset state
    directoryCache = new Map();
    currentPath = '';
    initialPath = '';
    totalFilesToScan = 0
    filesScanned = 0;
    // Start measuring the scan time
    startTime = performance.now();
    // swap UI
    locationSelectEl.classList.add('hidden');
    sortControlsEl.classList.remove('hidden');
    fileListEl.classList.remove('hidden');
    navigationRail.disabled = true;
    automaticNavChange = true; // Allow navigation rail change
    navigationRail.value = 'scan';
    fileListEl.innerHTML = '<h3 class="loading-message-2">Starting scan, please wait!</h3><mdui-circular-progress indeterminate class="center-screen"></mdui-circular-progress>';
    scanProgress.classList.remove('hidden');
    // launch worker
    if (worker) worker.terminate();
    try{
    worker = new Worker('web-worker.js');
    worker.onmessage = handleWorkerMessage;
    worker.postMessage({ action: 'init', files: fileList });
    // request only top‐level after init
    worker.addEventListener('message', ev => {
      if (ev.data.action === 'ready') {
        currentPath = initialPath = '';
        requestDirectory('');  // send root listing
      }
    });
    } catch (err) {
      mdui.alert({
        headline: 'Failed to start worker',
        description: 'Your browser does not support Web Workers or the worker script could not be loaded. If you are running this locally, please ensure you are using a local server (e.g. Python HTTP server, Node.js, etc.) and not opening the HTML file directly in the browser. The script "STARTPROJECT.bat" can do that for you.',
      });
      console.error('Worker error:', err);
      return;
    }
  }
  function handleWorkerMessage(ev) {
    const msg = ev.data;
    console.log('Worker message:', msg);
    switch (msg.action) {
      case 'totalCount':
        totalFilesToScan = msg.count;
        break;
      case 'files':
        directoryCache.set(msg.path, msg.files);
        if (msg.path === currentPath) {
          renderList(msg.files);
        }
        break;
      case 'updateDone':
        filesScanned++;
        handleSizeUpdate(msg);
        break;
      case 'error':
        mdui.snackbar({ message: msg.message });
        console.error(msg);
        break;
      case 'allDone':
        endTime = performance.now();
        const duration = (endTime - startTime).toFixed(2);
        console.log(`${totalFilesToScan} items (${directoryCache.size} directories) scanned in ${duration/1000} seconds`);
        mdui.snackbar({ message: `${totalFilesToScan} items (${directoryCache.size} directories) scanned in ${duration/1000} seconds` });
        scanProgress.classList.add('hidden');
        scanProgress.removeAttribute('value');
        break;
      default:
        console.warn('Unknown worker message', msg);

    }
  }

  function requestDirectory(path) {
    worker.postMessage({ action: 'getFiles', path });
  }
  function handleSizeUpdate({ path, size, action }) {
  const norm = normalizePath(path);
  const parent = dirname(norm);

  // Update the directory cache with the new size information
  updateDirectoryCacheSize(parent, norm, size, action);

  // Also update the directory's own entry if it exists in the cache
  if (directoryCache.has(norm)) {
    const listing = directoryCache.get(norm);
    const idx = listing.findIndex(x => x.path === norm);
    if (idx >= 0) {
      const it = listing[idx];
      listing[idx] = {
        ...it,
        size,
        sizeStr: formatSize(size),
        updateDone: true
      };
      directoryCache.set(norm, listing);
    }
    // Update progress bar only if totalFilesToScan is set
    if (totalFilesToScan > 0) {
      scanProgress.value = filesScanned / totalFilesToScan;
    }
  }

  // Determine if we need to re-render
  let shouldRender = false;

  // If we're in 'all' mode, always re-render
  if (displayMode === 'all') {
    shouldRender = true;
  }
  // If the updated directory is the current directory, re-render
  else if (currentPath === norm) {
    shouldRender = true;
  }
  // If the parent of the updated directory is the current directory, re-render
  else if (currentPath === parent) {
    shouldRender = true;
  }
  // If the current directory is an ancestor of the updated directory, re-render
  else if (norm.startsWith(currentPath + '/')) {
    shouldRender = true;
  }

  if (shouldRender) {
    if (displayMode === 'all') {
      renderAllFiles();
    } else {
      clearTimeout(renderTimeout);
      renderTimeout = setTimeout(() => {
        renderList(directoryCache.get(currentPath) || []);
      }, 100);
    }
  }
}
  function updateDirectoryCacheSize(parentDir, itemPath, size, action) {
    if (!directoryCache.has(parentDir)) return;
    const listing = directoryCache.get(parentDir);
    const idx = listing.findIndex(x => x.path === itemPath);
    if (idx < 0) return;
    const it = listing[idx];
    listing[idx] = {
      ...it,
      size,
      sizeStr: formatSize(size),
      updateDone: action === 'updateDone' || it.updateDone
    };
    directoryCache.set(parentDir, listing);
  }
  function scheduleRender(dirPath) {
    clearTimeout(renderTimeout);
    renderTimeout = setTimeout(() => {
      renderList(directoryCache.get(dirPath) || []);
    }, 100);
  }
  document.getElementById('sortByName').addEventListener('click', () => {
    sortMethod = 'name';
    if (displayMode === 'all') renderAllFiles();
    else renderList(directoryCache.get(currentPath) || []);
  });
  document.getElementById('sortBySize').addEventListener('click', () => {
    sortMethod = 'size';
    if (displayMode === 'all') renderAllFiles();
    else renderList(directoryCache.get(currentPath) || []);
  });

  document.getElementById('showFileTree').addEventListener('click', () => {
    displayMode = 'tree';
    renderList(directoryCache.get(currentPath) || []);
  });

  document.getElementById('showAllFiles').addEventListener('click', () => {
    displayMode = 'all';
    renderAllFiles();
  });
  /**
   * Normalise un chemin de fichier.
   * @param {string} path
   * @returns {string}
   */
  function normalizePath(path) {
    if (!path) return '';
    return path.replace(/\\/g, '/').replace(/\/$/, '');
  }
  /**
   * Retourne le dossier parent d'un chemin.
   * @param {string} filePath
   * @returns {string}
   */
  function dirname(filePath) {
    const normalized = normalizePath(filePath);
    const parts = normalized.split('/');
    if (parts.length <= 1) return '';
    parts.pop();
    return parts.join('/') || '';
  }
  /**
   * Formate une taille en octets en chaîne lisible.
   * @param {number} bytes
   * @returns {string}
   */
  function formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes','KB','MB','GB','TB'];
    const i = Math.floor(Math.log(bytes)/Math.log(k));
    return (bytes / Math.pow(k,i)).toFixed(2) + ' ' + sizes[i];
  }
  /**
   * Formate un objet fichier/dossier avec taille lisible.
   * @param {object} file
   * @returns {object}
   */
  function formatFileEntry(file) {
    return {
      ...file,
      path: normalizePath(file.path),
      sizeStr: formatSize(file.size)
    };
  }
  /**
   * Rend la liste des fichiers/dossiers.
   * @param {Array} items
   */
  function renderList(items) {
    const ul = document.createElement('mdui-list');
    const parentTotalSize = items.reduce((sum, item) => sum + (item.size || 0), 0);
    ul.appendChild(createUpDirectoryItem());
    sortItems(items, sortMethod).forEach(item =>
      // only show files larger than the filter size
      (fileSizeFilter <= 0 || (item.size || 0) >= fileSizeFilter) &&
      ul.appendChild(createListItem(item, parentTotalSize))
    );
    // preserve scroll
    const scrollPosition = fileListEl.scrollTop;
    fileListEl.innerHTML = '';
    fileListEl.appendChild(ul);
    fileListEl.scrollTop = scrollPosition;
    if(sessionStorage.getItem('navigateTip') === 'true') return;
    mdui.alert({
      headline: 'Start Navigating!',
      description: 'You can now navigate through the directories while their size is being calculated, by clicking on them. Use the "Up one directory" button to go back. The loading bar near the top of the screen shows the total progress of the size calculation.',
  });
    sessionStorage.setItem('navigateTip', 'true');
}

  function renderAllFiles() {
  // 1) collect every file entry
  const allItems = [];
  for (const files of directoryCache.values()) {
    files.forEach(item => {
      if (!item.isDirectory) {
        allItems.push(item);
      }
    });
  }

  // 2) sort them
  const sorted = sortItems(allItems, sortMethod);

  // 3) render exactly like renderList()
  const ul = document.createElement('mdui-list');
  const totalSize = sorted.reduce((sum, f) => sum + (f.size || 0), 0);
  sorted.forEach(item => {
    // only show files larger than the filter size
    if (fileSizeFilter > 0 && (item.size || 0) < fileSizeFilter) {
      return;
    }
    ul.appendChild(createListItem(item, totalSize));
  });

  // 4) swap into the DOM
  const scrollPosition = fileListEl.scrollTop;
  fileListEl.innerHTML = '';
  fileListEl.appendChild(ul);
  fileListEl.scrollTop = scrollPosition;
}

  /**
   * Trie les éléments selon la méthode choisie.
   * @param {Array} items
   * @param {string} method
   * @returns {Array}
   */
  function sortItems(items, method) {
    let sorted = [...items];
    if (method === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      sorted.sort((a, b) => (b.size || 0) - (a.size || 0));
    }
    return sorted;
  }
  /**
   * Crée l'élément "Remonter d'un dossier".
   * @returns {HTMLElement}
   */
  function createUpDirectoryItem() {
    const upItem = document.createElement('mdui-list-item');
    upItem.innerHTML = '🔼 Up one directory';
    upItem.onclick = () => {
      if (currentPath === initialPath) {
        mdui.snackbar({ message: 'You are already at the root directory.' });
        return;
      }
      navigateToDirectory(dirname(currentPath));
    };
    return upItem;
  }
  /**
   * Navigue vers un dossier donné.
   * @param {string} dirPath
   */
  function navigateToDirectory(dirPath) {
    currentPath = normalizePath(dirPath);
    if (!directoryCache.has(currentPath)) {
      // lazy‐load from worker
      requestDirectory(currentPath);
    } else {
      renderList(directoryCache.get(currentPath));
    }
  }
  /**
   * Crée un élément de liste pour un fichier/dossier.
   * @param {object} item
   * @param {number} parentTotalSize
   * @returns {HTMLElement}
   */
  function createListItem(item, parentTotalSize) {
    const normPath = normalizePath(item.path);
    const li = document.createElement('mdui-list-item');
    li.dataset.path = normPath;
    const proportion = calculateProportion(item, parentTotalSize);
    const isIndeterminate = getIndeterminateStatus(item);
    const progressHTML = generateProgressHTML(item, proportion, isIndeterminate);
    if (item.isDirectory) {
      li.innerHTML = `${getFileName(item.name)}<mdui-icon slot="icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Zm0-80h640v-400H447l-80-80H160v480Zm0 0v-480 480Z"/></svg></mdui-icon>${progressHTML}<span slot="description">${isIndeterminate?"Calculating size...":`<b>${formatSize(item.size)}</b>`}</span>`;
    } else {
      li.innerHTML = `${getFileName(item.name)}${getFileIcon(item.name)}${progressHTML}<span slot="description"><b>${formatSize(item.size)}</b></span>`;
    }
    li.onclick = () => {
      if (item.isDirectory) {
        navigateToDirectory(item.path);
      } else {
        const file = getFileFromPath(item.path)
        if (!file){
          return mdui.snackbar({ message: 'Failed to open file. 😔' });
        }
        openFilePreview(file)
      }
    };
    return li;
  }
  /**
   * Calcule la proportion de la taille par rapport au parent.
   * @param {object} item
   * @param {number} parentTotalSize
   * @returns {number}
   */
  function calculateProportion(item, parentTotalSize) {
    if (parentTotalSize > 0 && (item.size || 0) > 0) {
      return (item.size || 0) / parentTotalSize;
    }
    return 0;
  }

  /**
   * Détermine si la barre de progression doit être indéterminée.
   * @param {object} item
   * @returns {boolean}
   */
  function getIndeterminateStatus(item) {
    if (item.isDirectory) {
      return !item.updateDone;
    }
    return false;
  }

  /**
   * Génère le HTML de la barre de progression.
   * @param {object} item
   * @param {number} proportion
   * @param {boolean} isIndeterminate
   * @returns {string}
   */
  function generateProgressHTML(item, proportion, isIndeterminate) {
    if (isIndeterminate) {
      return '<mdui-linear-progress indeterminate></mdui-linear-progress>';
    }
    return `<mdui-linear-progress value="${proportion}"></mdui-linear-progress>`;
  }

    /**
   * Retourne l'icône appropriée pour un fichier.
   * @param {string} fileName
   * @returns {string}
   * */
  function getFileIcon(fileName) {
    switch (fileName.split('.').pop().toLowerCase()) {
      case 'txt':
      case 'md':
      case 'log':
      case 'doc':
      case 'docx':
      case 'odt':
      case 'pdf':
        return '<mdui-icon slot="icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M320-440h320v-80H320v80Zm0 120h320v-80H320v80Zm0 120h200v-80H320v80ZM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Zm280-520v-200H240v640h480v-440H520ZM240-800v200-200 640-640Z"/></svg></mdui-icon>';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'bmp':
      case 'webp':
      case 'svg':
        return '<mdui-icon slot="icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm40-80h480L570-480 450-320l-90-120-120 160Zm-40 80v-560 560Z"/></svg></mdui-icon>';
      case 'mp3':
      case 'wav':
      case 'flac':
      case 'ogg':
        return '<mdui-icon slot="icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M400-120q-66 0-113-47t-47-113q0-66 47-113t113-47q23 0 42.5 5.5T480-418v-422h240v160H560v400q0 66-47 113t-113 47Z"/></svg></mdui-icon>';
      case 'mp4':
      case 'avi':
      case 'mkv':
      case 'mov':
      case 'wmv':
        return '<mdui-icon slot="icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="m160-800 80 160h120l-80-160h80l80 160h120l-80-160h80l80 160h120l-80-160h120q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800Zm0 240v320h640v-320H160Zm0 0v320-320Z"/></svg></mdui-icon>';
      case 'iso':
      case 'dmg':
      case 'vdmk':
        return '<mdui-icon slot="icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h480q33 0 56.5 23.5T800-800v640q0 33-23.5 56.5T720-80H240Zm0-80h480v-640H240v640Zm80-80h320v-80H320v80Zm160-160q66 0 113-47t47-113q0-66-47-113t-113-47q-66 0-113 47t-47 113q0 66 47 113t113 47Zm0-120q-17 0-28.5-11.5T440-560q0-17 11.5-28.5T480-600q17 0 28.5 11.5T520-560q0 17-11.5 28.5T480-520Zm0-40Z"/></svg></mdui-icon>';
      case 'zip':
      case 'rar':
      case 'tar':
      case 'gz':
      case '7z':
        return '<mdui-icon slot="icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M640-480v-80h80v80h-80Zm0 80h-80v-80h80v80Zm0 80v-80h80v80h-80ZM447-640l-80-80H160v480h400v-80h80v80h160v-400H640v80h-80v-80H447ZM160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Zm0-80v-480 480Z"/></svg></mdui-icon>';
      case 'exe':
      case 'bat':
      case 'sh':
      case 'cmd':
        return '<mdui-icon slot="icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-80h640v-400H160v400Zm140-40-56-56 103-104-104-104 57-56 160 160-160 160Zm180 0v-80h240v80H480Z"/></svg></mdui-icon>';
      case 'html':
      case 'htm':
      case 'css':
      case 'js':
      case 'json':
      case 'xml':
      case 'php':
      case 'py':
      case 'java':
      case 'c':
      case 'cpp':
      case 'cs':
      case 'go':
      case 'rb':
      case 'rs':
        return '<mdui-icon slot="icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M320-240 80-480l240-240 57 57-184 184 183 183-56 56Zm320 0-57-57 184-184-183-183 56-56 240 240-240 240Z"/></svg></mdui-icon>';
      default:
        return '<mdui-icon slot="icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Zm280-520v-200H240v640h480v-440H520ZM240-800v200-200 640-640Z"/></svg></mdui-icon>';
    }
  }
   /**
   * Extrait le nom du fichier depuis un chemin.
   * @param {string} name
   * @returns {string}
   */
  function getFileName(name) {
    return name.substring(name.lastIndexOf("\\") + 1);
  }
});


function getFileFromPath(path){
  return Array.from(filePicker.files).find(f => f.webkitRelativePath === path) || null;
}

function openFilePreview(file){
  function prepare(){
    filePreview.open = true
    filePreviewTitle.innerHTML = file.name
    filePreviewContent.innerHTML = ""
    filePreview.fullscreen = false
    filePreviewFullscreen.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <path fill="lime" d="M9.7 9.71a1 1 0 0 1-1.41 0L3.5 4.92l-.35.34-1.44 1.45a1 1 0 0 1-1.09.21A.99.99 0 0 1 0 6V1a1 1 0 0 1 1-1h5c.4 0 .77.24.92.62a1 1 0 0 1-.21 1.09L5.26 3.15l-.34.35 4.79 4.79a1 1 0 0 1 0 1.42zm4.6 0a1 1 0 0 0 1.41 0l4.8-4.79.34.34 1.44 1.45a1 1 0 0 0 1.09.21A.99.99 0 0 0 24 6V1a1 1 0 0 0-1-1h-5c-.4 0-.77.24-.92.62a1 1 0 0 0 .21 1.09l1.45 1.44.34.35-4.79 4.79a1 1 0 0 0 0 1.42zm-4.6 4.58A.98.98 0 0 0 9 14c-.26 0-.51.1-.71.29L3.5 19.08l-.35-.34-1.44-1.45a1 1 0 0 0-1.09-.21A.99.99 0 0 0 0 18v5a1 1 0 0 0 1 1h5c.4 0 .77-.24.92-.62a1 1 0 0 0-.21-1.09l-1.45-1.44-.34-.35 4.79-4.79a1 1 0 0 0 0-1.42zm4.6 0a1 1 0 0 1 1.41 0l4.8 4.79.34-.34 1.44-1.45a1 1 0 0 1 1.09-.21c.38.15.62.52.62.92v5a1 1 0 0 1-1 1h-5a.99.99 0 0 1-.92-.62 1 1 0 0 1 .21-1.09l1.45-1.44.34-.35-4.79-4.79a1 1 0 0 1 0-1.42z"/>
      </svg>
    `
  }

  if (file.type.startsWith("image")){
    prepare()
    const reader = new FileReader();
    reader.onload = () => {
      const img = document.createElement("img")
      img.src = reader.result
      filePreviewContent.appendChild(img)
    }
    reader.readAsDataURL(file);
  }
  else if (file.type.startsWith("text") || file.type === "application/json"){
    prepare()
    file.text().then(text => {
      const pre = document.createElement("pre")
      pre.innerText = text
      filePreviewContent.appendChild(pre)
    });
  }
  else {
    console.log(file)
    console.warn('Failed to open:', file.type)
    mdui.snackbar({ message: 'This file type is not supported yet. 😢' });
  }
}


// Register service worker for offline support
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js")
    .then(registration => {
      console.log("Service Worker registered with scope:", registration.scope);
    })
    .catch(error => {
      console.error("Service Worker registration failed:", error);
    });
}
