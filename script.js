document.addEventListener('DOMContentLoaded', () => {
const ws     = new WebSocket('ws://localhost:8080');
const worker = new Worker('worker.js');
const fileListEl = document.getElementById('fileList');

// Forward everything from WS into the worker
ws.onopen = () => {
  console.log('Connected to server');
  ws.send(JSON.stringify({ action: 'getFiles', path: '/' }));
};
ws.onmessage = ev => {
  worker.postMessage(JSON.parse(ev.data));
};

// Handle messages from worker
worker.onmessage = ({ data }) => {
  if (data.action === 'render') {
    renderList(data.items);
  }
  else if (data.action === 'updateSize') {
    updateSizeInDOM(data.path, data.sizeStr);
  }
};

function renderList(items) {
  fileListEl.innerHTML = '';  
  const ul = document.createElement('ul');
  items.forEach(item => {
    const li = document.createElement('li');
    li.dataset.path = item.path;
    li.textContent  = `${item.isDirectory ? '📂' : '📄'} ${item.name} — ${item.sizeStr}`;
    li.onclick = () => {
      if (item.isDirectory) {
        ws.send(JSON.stringify({ action: 'getFiles', path: item.path }));
      }
    };
    ul.appendChild(li);
  });
  fileListEl.appendChild(ul);
}

function updateSizeInDOM(path, sizeStr) {
  // find the <li> by matching its data-path
  const li = document.querySelector(`li[data-path="${path}"]`);
  if (li) {
    // replace just the trailing size
    li.textContent = li.textContent.replace(/—\s.*$/, `— ${sizeStr}`);
  }
}
});