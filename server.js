import { WebSocketServer }  from 'ws';
import { promises as fs } from 'fs';
import path        from 'path';
import pLimit      from 'p-limit';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const wss     = new WebSocketServer({ port: 8080 });
const limit   = pLimit( 10 );    // at most 10 concurrent fs ops

wss.on('connection', ws => {
  console.log('Client connected');
    ws._cancelled = false;
    ws.on('close', () => {
        ws._cancelled = true;
    });
  ws.on('message', async raw => {
    if (ws._cancelled) return;
    console.log('Received message:', raw);
    const { action, path: dirPath } = JSON.parse(raw);
    if (action === 'getFiles') {
      await sendDirectoryListing(dirPath, ws);
    }
  });
  ws.send(JSON.stringify({ action: 'init', message: 'Connected to server' }));
});

ws.on('error', err => {
  console.error('WebSocket error:', err);
});

//Disconnect when client closes connection
wss.on('close', () => {
    console.log('Client disconnected');
});

async function sendDirectoryListing(dirPath, ws) {
    console.log(`Listing directory: ${dirPath}`);
  let dirents;
  try {
    dirents = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (err) {
    ws.send(JSON.stringify({ action: 'error', message: err.message }));
    return;
  }

  // 1) immediate reply with names + zero sizes for directories
  const listing = await Promise.all(dirents.map(dirent => limit(async () => {
    const fullPath    = path.join(dirPath, dirent.name);
    const isDirectory = dirent.isDirectory();
    let size          = 0;
    if (!isDirectory) {
      try {
        const stat = await fs.stat(fullPath);
        size = stat.size;
      } catch (_) { /* swallow */ }
    }
    return { name: dirent.name, path: fullPath, isDirectory, size };
  })));

  ws.send(JSON.stringify({ action: 'files', data: listing }));

  // 2) for each directory, recurse and stream updates
  for (const entry of listing) {
    if (entry.isDirectory) {
      calculateDirectorySize(entry.path, limit).then(size => {
        ws.send(JSON.stringify({
          action: 'updateSize',
          path:  entry.path,
          size
        }));
      }).catch(() => {});
    }
    if (ws._cancelled || ws.readyState !== WebSocket.OPEN) {
    // client went away — stop doing work
    throw new Error('Aborting because WS closed');
    }
  }
}

async function calculateDirectorySize(dir, limit) {
  let total = 0;
  let dirents;
    if (ws._cancelled || ws.readyState !== WebSocket.OPEN) {
    // client went away — stop doing work
    throw new Error('Aborting because WS closed');
    }
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  // accumulate with concurrency limit
  await Promise.all(dirents.map(dirent => limit(async () => {
    const full = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      total += await calculateDirectorySize(full, limit);
    } else {
      try {
        const stat = await fs.stat(full);
        total += stat.size;
      } catch (_) { /* swallow */ }
    }
  })));
  return total;
}
