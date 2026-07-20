const { resolveWosSid } = require('./wos-sid');

(function() {
  'use strict';

  /**
   * Copy content to clipboard
   */
  function copyToClipboard(text) {
    return navigator.clipboard.writeText(text)
      .then(() => {
        console.log('[OK] Content copied to clipboard');
        return true;
      })
      .catch(err => {
        console.error('[ERROR] Copy failed:', err);
        return false;
      });
  }

  /**
   * Select local directory and read all files
   */
  window.selectDirectory = async function() {
    try {
      const dirHandle = await window.showDirectoryPicker();
      console.log('[DIR] Selected directory:', dirHandle.name);
      
      const files = await readAllFilesFromDirectory(dirHandle);
      window._selectedFiles = files;
      
      console.log('[OK] Found ' + files.length + ' files:');
      files.forEach((file, index) => {
        console.log('  ' + (index + 1) + '. ' + file.path);
      });
      
      return files;
    } catch (error) {
      console.error('[ERROR] Failed to select directory:', error);
      return null;
    }
  };

  /**
   * Recursively read all files from directory
   */
  async function readAllFilesFromDirectory(dirHandle, basePath = '') {
    const files = [];
    
    for await (const entry of dirHandle.values()) {
      const fullPath = basePath ? basePath + '/' + entry.name : entry.name;
      
      if (entry.kind === 'file') {
        files.push({
          name: entry.name,
          path: fullPath,
          handle: entry
        });
      } else if (entry.kind === 'directory') {
        const subFiles = await readAllFilesFromDirectory(entry, fullPath);
        files.push(...subFiles);
      }
    }
    
    return files;
  }

  /**
   * Read file at path and copy to clipboard
   */
  window.copyFileToClipboard = async function(filePath) {
    if (!window._selectedFiles) {
      console.error('[ERROR] Please call selectDirectory() first');
      return false;
    }
    
    const fileInfo = window._selectedFiles.find(f => f.path === filePath);
    
    if (!fileInfo) {
      console.error('[ERROR] File not found: ' + filePath);
      console.log('Available files:');
      window._selectedFiles.forEach((f, i) => {
        console.log('  ' + (i + 1) + '. ' + f.path);
      });
      return false;
    }
    
    try {
      const file = await fileInfo.handle.getFile();
      const content = await file.text();
      
      await copyToClipboard(content);
      console.log('[OK] File content copied: ' + filePath);
      console.log('[INFO] File size: ' + (content.length / 1024).toFixed(2) + ' KB');
      
      return true;
    } catch (error) {
      console.error('[ERROR] Failed to read file:', error);
      return false;
    }
  };

  /**
   * List all loaded files
   */
  window.listFiles = function() {
    if (!window._selectedFiles) {
      console.error('[ERROR] Please call selectDirectory() first');
      return [];
    }
    
    console.log('[LIST] Total ' + window._selectedFiles.length + ' files:');
    window._selectedFiles.forEach((file, index) => {
      console.log('  ' + (index + 1) + '. ' + file.path);
    });
    
    return window._selectedFiles.map(f => f.path);
  };

  /**
   * Copy file by index number
   */
  window.copyFileByIndex = async function(index) {
    if (!window._selectedFiles) {
      console.error('[ERROR] Please call selectDirectory() first');
      return false;
    }
    
    const fileInfo = window._selectedFiles[index - 1];
    
    if (!fileInfo) {
      console.error('[ERROR] Index ' + index + ' out of range (1-' + window._selectedFiles.length + ')');
      return false;
    }
    
    return await window.copyFileToClipboard(fileInfo.path);
  };

  document.addEventListener('__WOS_AIDE_GET_SID_INFO__', (event) => {
    const requestId = event?.detail?.requestId;
    const sid = resolveWosSid();

    document.dispatchEvent(new CustomEvent('__WOS_AIDE_GET_SID_INFO_RESPONSE__', {
      detail: {
        requestId,
        sid
      }
    }));
  });

  // ========== WOS Aide Project ==========
  document.addEventListener('__GET_WOS_AIDE_PROJECT__', () => {
    try {
      const title = document.querySelector('title')?.textContent?.trim() || '';
      if (title !== 'WOS Aide') {
        document.dispatchEvent(new CustomEvent('__WOS_AIDE_PROJECT_RESPONSE__', {
          detail: { error: 'Not on WOS Aide page', success: false }
        }));
        return;
      }
      const projectName = document.querySelector('#currentProjectName')?.textContent?.trim()
        || window.currentProjectName
        || null;
      document.dispatchEvent(new CustomEvent('__WOS_AIDE_PROJECT_RESPONSE__', {
        detail: { projectName, success: Boolean(projectName) }
      }));
    } catch (error) {
      document.dispatchEvent(new CustomEvent('__WOS_AIDE_PROJECT_RESPONSE__', {
        detail: { error: error.message, success: false }
      }));
    }
  });

  document.addEventListener('__WOS_AIDE_PROJECT_UPDATE__', (event) => {
    const name = event.detail?.projectName || null;
    window.wosAideProjectName = name;
  });

  window.getEnlightenkeyProjectName = function() {
    return window.wosAideProjectName || null;
  };

  async function openProjectHandleStore() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('wosaide-toolkit', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('projectHandles');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function setStoredProjectHandle(handle) {
    if (!handle) return;
    try {
      const db = await openProjectHandleStore();
      await new Promise((resolve) => {
        const tx = db.transaction('projectHandles', 'readwrite');
        const store = tx.objectStore('projectHandles');
        store.put(handle, 'default');
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch (error) {
      console.warn('[WOS Aide] Failed to store project handle:', error);
    }
  }

  async function ensureDirectoryPermission(handle) {
    try {
      const opts = { mode: 'readwrite' };
      if (await handle.queryPermission(opts) === 'granted') return true;
      return (await handle.requestPermission(opts)) === 'granted';
    } catch (error) {
      console.warn('[WOS Aide] Directory permission check failed:', error);
      return false;
    }
  }

  document.addEventListener('__WOS_AIDE_PICK_DIR__', async () => {
    if (!window.showDirectoryPicker) {
      document.dispatchEvent(new CustomEvent('__WOS_AIDE_PICK_DIR_RESPONSE__', {
        detail: { success: false, error: 'Directory picker not supported' }
      }));
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ id: 'wosAide-project', mode: 'readwrite' });
      const granted = await ensureDirectoryPermission(handle);
      if (!granted) {
        document.dispatchEvent(new CustomEvent('__WOS_AIDE_PICK_DIR_RESPONSE__', {
          detail: { success: false, error: 'Permission not granted' }
        }));
        return;
      }
      await setStoredProjectHandle(handle);
      document.dispatchEvent(new CustomEvent('__WOS_AIDE_PICK_DIR_RESPONSE__', {
        detail: { success: true }
      }));
    } catch (error) {
      document.dispatchEvent(new CustomEvent('__WOS_AIDE_PICK_DIR_RESPONSE__', {
        detail: { success: false, error: error.message }
      }));
    }
  });
  
 
})();
