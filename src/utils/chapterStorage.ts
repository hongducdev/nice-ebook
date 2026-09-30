/**
 * IndexedDB storage for project chapters and HTML content.
 * Prevents localStorage QuotaExceededError (5MB limit) when working with multi-chapter books.
 */

const DB_NAME = "NiceEbookDB";
const STORE_NAME = "project_chapters";
const COVERS_STORE_NAME = "project_covers";
const DB_VERSION = 2;

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return resolve(null);
    }
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
        if (!db.objectStoreNames.contains(COVERS_STORE_NAME)) {
          db.createObjectStore(COVERS_STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveChaptersToDb(
  projectId: string,
  chapters: Record<string, string>
): Promise<void> {
  try {
    const db = await openDb();
    if (!db) return;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(chapters, projectId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("Could not save chapters to IndexedDB:", err);
  }
}

export async function loadChaptersFromDb(
  projectId: string
): Promise<Record<string, string> | null> {
  try {
    const db = await openDb();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(projectId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn("Could not load chapters from IndexedDB:", err);
    return null;
  }
}

export async function deleteChaptersFromDb(projectId: string): Promise<void> {
  try {
    const db = await openDb();
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(projectId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}
export async function saveCoverToDb(
  projectId: string,
  coverDataUrl: string
): Promise<void> {
  try {
    const db = await openDb();
    if (!db) return;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(COVERS_STORE_NAME, "readwrite");
      const store = tx.objectStore(COVERS_STORE_NAME);
      store.put(coverDataUrl, projectId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("Could not save cover to IndexedDB:", err);
  }
}

export async function loadCoverFromDb(
  projectId: string
): Promise<string | null> {
  try {
    const db = await openDb();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(COVERS_STORE_NAME, "readonly");
      const store = tx.objectStore(COVERS_STORE_NAME);
      const req = store.get(projectId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn("Could not load cover from IndexedDB:", err);
    return null;
  }
}

export async function deleteCoverFromDb(projectId: string): Promise<void> {
  try {
    const db = await openDb();
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction(COVERS_STORE_NAME, "readwrite");
      const store = tx.objectStore(COVERS_STORE_NAME);
      store.delete(projectId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}
