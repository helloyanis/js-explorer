import WebSocket, { WebSocketServer } from 'ws';
import { promises as fs } from 'fs';
import path from 'path';
import pLimit from 'p-limit';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const wss = new WebSocketServer({ port: 8080 });
const limit = pLimit(Infinity); // no concurrency limit for fs ops
const directoryCache = new Map(); // key: directory path, value: array of file/dir info

async function getDirectoryListing(dirPath) {
  if (directoryCache.has(dirPath)) {
    return directoryCache.get(dirPath);
  }

  let dirents;
  try {
    dirents = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (err) {
    console.error(`Error reading directory ${dirPath}:`, err);
    return [];
  }

  const entries = await Promise.all(dirents.map(async dirent => {
    const fullPath = path.join(dirPath, dirent.name);
    const isDirectory = dirent.isDirectory();
    let size = 0;

    if (!isDirectory) {
      try {
        const stat = await fs.stat(fullPath);
        size = stat.size;
      } catch (e) {
        console.error(`Error getting size for ${fullPath}:`, e);
        size = 0;
      }
    }

    return {
      name: dirent.name,
      path: fullPath,
      isDirectory,
      size
    };
  }));

  directoryCache.set(dirPath, entries);
  return entries;
}

async function sendDirectoryListing(dirPath, ws) {
  const listing = await getDirectoryListing(dirPath);
  ws.send(JSON.stringify({
    action: 'files',
    data: {
      path: dirPath,
      files: listing
    }
  }));

  for (const entry of listing) {
    if (entry.isDirectory) {
      try {
        await calculateDirectorySize(entry.path, limit, ws);
      } catch (err) {
        console.error('Error calculating directory size:', err);
      }
    }
  }
}

async function calculateDirectorySize(dir, limit, ws) {
  let total = 0;

  let dirents;
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  console.log(dirents.length, 'entries in directory:', dir);

  await Promise.all(dirents.map(dirent => limit(async () => {
    if (ws._cancelled) return; // Check if WebSocket connection is still active
    const full = path.join(dir, dirent.name);
    console.log(`Calculating size for: ${full} (${dirent.isDirectory() ? 'directory' : 'file'})`);

    if (dirent.isDirectory()) {
      const subdirSize = await calculateDirectorySize(full, limit, ws);
      total += subdirSize;

      // Update the subdirectory's size in its parent's directory listing
      const parentDir = path.dirname(full);
      if (directoryCache.has(parentDir)) {
        const parentListing = directoryCache.get(parentDir);
        const dirIndex = parentListing.findIndex(entry => entry.path === full);
        if (dirIndex >= 0) {
          parentListing[dirIndex].size = subdirSize;
          directoryCache.set(parentDir, parentListing);
        }
      }

      // Notify client about the size update for the subdirectory
      ws.send(JSON.stringify({
        action: 'updateSize',
        path: full,
        size: subdirSize
      }));
    } else {
      try {
        const stat = await fs.stat(full)
        console.log(`File size for ${full}: ${stat.size} bytes`);
        total += stat.size;

        // Update the file's size in its parent's directory listing
        const parentDir = path.dirname(full);
        if (directoryCache.has(parentDir)) {
          const parentListing = directoryCache.get(parentDir);
          const fileIndex = parentListing.findIndex(entry => entry.path === full);
          if (fileIndex >= 0) {
            parentListing[fileIndex].size = stat.size;
            directoryCache.set(parentDir, parentListing);
          }
        }

        // Notify client about the size update
        ws.send(JSON.stringify({
          action: 'updateSize',
          path: full,
          size: stat.size
        }));
      } catch (e) {
        console.error(`Error getting size for ${full}:`, e);
      }
    }
  })));

  ws.send(JSON.stringify({
        action: 'updateDone',
        path: dir,
        size: total
      }));

  return total;
}

async function withTimeout(promise, timeoutMs) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error('Operation timed out'));
    }, timeoutMs);
  });

  return Promise.race([
    promise.finally(() => clearTimeout(timeout)),
    timeoutPromise
  ]);
}

wss.on('connection', ws => {
  console.log('Client connected');
  ws._cancelled = false;

  ws.on('close', () => {
    console.log('Client disconnected');
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

console.log('Server started on port 8080');
