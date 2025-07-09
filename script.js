document.addEventListener('DOMContentLoaded', () => {
  let ws, fileListEl, directoryCache, currentPath, sortMethod, renderTimeout, initialPath;

  /**
   * Initialise l'explorateur de fichiers et la connexion WebSocket.
   * @param {string} path - Le chemin initial à explorer.
   */
  function initFileExplorer(path) {
    setupUI();
    ws = createWebSocket(path);
    directoryCache = new Map();
    currentPath = normalizePath(path);
    initialPath = normalizePath(path);
    sortMethod = 'name';
    renderTimeout = null;
  }

  /**
   * Configure l'interface utilisateur initiale.
   */
  function setupUI() {
    fileListEl = document.getElementById('fileList');
    fileListEl.classList.remove('hidden');
    document.querySelector('#sortControls').classList.remove('hidden');
    document.querySelector('#locationSelect').classList.add('hidden');
  }

  /**
   * Crée et configure la connexion WebSocket.
   * @param {string} path - Le chemin à envoyer lors de la connexion.
   * @returns {WebSocket}
   */
  function createWebSocket(path) {
    const socket = new WebSocket('ws://localhost:8080');
    socket.onopen = () => handleWSOpen(socket, path);
    socket.onmessage = handleWSMessage;
    socket.onerror = handleWSError;
    socket.onclose = () => console.log('Disconnected from server');
    return socket;
  }

  /**
   * Gère l'ouverture de la connexion WebSocket.
   * @param {WebSocket} socket
   * @param {string} path
   */
  function handleWSOpen(socket, path) {
    console.log('Connected to server');
    socket.send(JSON.stringify({ action: 'getFiles', path: path }));
  }

  /**
   * Gère les messages reçus via WebSocket.
   * @param {MessageEvent} ev
   */
  function handleWSMessage(ev) {
    const data = JSON.parse(ev.data);
    if (data.action === 'files') {
      handleDirectoryListing(data.data);
    } else if (data.action === 'updateSize' || data.action === 'updateDone') {
      handleSizeUpdate(data);
    }
  }

  /**
   * Gère les erreurs de la connexion WebSocket.
   * @param {Event} error
   */
  function handleWSError(error) {
    console.error('WebSocket error:', error);
    mdui.snackbar({message:'WebSocket connection failed. Please ensure the server is running.'});
    document.getElementById('fileList').innerHTML = '<p>WebSocket connection failed. Please ensure the server is running.</p><mdui-button onclick="location.reload()" class="center-screen">Reload</mdui-button>';
  }

  // Boutons d'analyse
  document.querySelector('#analyzeButton').addEventListener('click', () => {
    initFileExplorer(document.querySelector('#locationInput').value);
  });
  document.querySelector('#analyzeDiskButton').addEventListener('click', () => {
    initFileExplorer("/");
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
    if (parts.length <= 1) return '/';
    parts.pop();
    return parts.join('/') || '/';
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
   * Gère la réception d'une liste de fichiers/dossiers.
   * @param {{ path: string, files: Array }} param0
   */
  function handleDirectoryListing({ path, files }) {
    console.log(`Received ${files.length} files/directories for path: ${path}`);
    const normalizedPath = normalizePath(path);
    const filesWithFormattedSizes = files.map(formatFileEntry);
    directoryCache.set(normalizedPath, filesWithFormattedSizes);
    if (normalizePath(currentPath) === normalizedPath) {
      renderList(filesWithFormattedSizes);
    }
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
   * Gère la mise à jour de la taille d'un fichier/dossier.
   * @param {object} update
   */
  function handleSizeUpdate(update) {
    const { path, size, action } = update;
    const normalizedPath = normalizePath(path);
    const parentDir = dirname(normalizedPath);

    updateDirectoryCacheSize(parentDir, normalizedPath, size, action);

    // Si la vue actuelle est le dossier parent, re-render
    if (normalizePath(currentPath) === parentDir) {
      scheduleRender(parentDir);
    }
  }

  /**
   * Met à jour la taille d'un élément dans le cache du dossier parent.
   * @param {string} parentDir
   * @param {string} normalizedPath
   * @param {number} size
   * @param {string} action
   */
  function updateDirectoryCacheSize(parentDir, normalizedPath, size, action) {
    if (directoryCache.has(parentDir)) {
      const dirListing = directoryCache.get(parentDir);
      const itemIndex = dirListing.findIndex(item => normalizePath(item.path) === normalizedPath);
      if (itemIndex >= 0) {
        const updatedItem = {
          ...dirListing[itemIndex],
          size,
          sizeStr: formatSize(size),
          updateDone: (action === 'updateDone' || dirListing[itemIndex].updateDone)
        };
        dirListing[itemIndex] = updatedItem;
        directoryCache.set(parentDir, dirListing);
      }
    }
  }

  /**
   * Programme un rendu différé de la liste.
   * @param {string} dirPath
   */
  function scheduleRender(dirPath) {
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

  /**
   * Rend la liste des fichiers/dossiers.
   * @param {Array} items
   */
  function renderList(items) {
    console.log(`Rendering ${items.length} items`);
    const ul = document.createElement('mdui-list');
    const parentTotalSize = items.reduce((sum, item) => sum + (item.size || 0), 0);

    ul.appendChild(createUpDirectoryItem());

    let sortedItems = sortItems(items, sortMethod);

    sortedItems.forEach(item => {
      ul.appendChild(createListItem(item, parentTotalSize));
    });

    // Remplace la liste actuelle en préservant la position de scroll
    const scrollPosition = fileListEl.scrollTop;
    fileListEl.innerHTML = '';
    fileListEl.appendChild(ul);
    fileListEl.scrollTop = scrollPosition;
  }

  /**
   * Crée l'élément "Remonter d'un dossier".
   * @returns {HTMLElement}
   */
  function createUpDirectoryItem() {
    const upItem = document.createElement('mdui-list-item');
    upItem.innerHTML = '🔼 Up one directory';
    upItem.onclick = () => {
      if (currentPath === normalizePath(initialPath)) {
        mdui.snackbar({message: 'You are already at the root directory.'});
        return;
      }
      navigateToDirectory(dirname(currentPath));
    };
    return upItem;
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
      li.innerHTML = `${getFileName(item.name)}<mdui-icon slot="icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Zm0-80h640v-400H447l-80-80H160v480Zm0 0v-480 480Z"/></svg></mdui-icon>${progressHTML}<span slot="description">${formatSize(item.size)}</span>`;
    } else {
      li.innerHTML = `${getFileName(item.name)}${getFileIcon(item.name)}${progressHTML}<span slot="description">${item.sizeStr || 'Unknown size'}</span>`;
    }

    li.onclick = () => {
      if (item.isDirectory) {
        navigateToDirectory(item.path);
      } else {
        window.open("file:///" + item.path, '_blank');
      }
    };
    return li;
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
   * Navigue vers un dossier donné.
   * @param {string} dirPath
   */
  function navigateToDirectory(dirPath) {
    const normalizedDirPath = normalizePath(dirPath);
    currentPath = normalizedDirPath;
    if (directoryCache.has(normalizedDirPath)) {
      renderList(directoryCache.get(normalizedDirPath));
    } else {
      ws.send(JSON.stringify({ action: 'getFiles', path: dirPath }));
    }
  }

  // Gestion des boutons de tri
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