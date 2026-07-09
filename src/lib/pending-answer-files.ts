"use client";

const DB_NAME = "nobit-pending-answer-files";
const DB_VERSION = 1;
const STORE = "pending";

type StoredFile = {
  name: string;
  type: string;
  lastModified: number;
  data: ArrayBuffer;
};

type StoredRecord = {
  id: string;
  files: StoredFile[];
  updatedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("このブラウザでは一時保存を使えません。"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("一時保存を開けませんでした。"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("一時保存に失敗しました。"));
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("一時保存に失敗しました。"));
    };
  });
}

export async function savePendingAnswerFiles(submissionId: string, files: File[]) {
  const stored: StoredRecord = {
    id: submissionId,
    updatedAt: Date.now(),
    files: await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        type: file.type || "application/octet-stream",
        lastModified: file.lastModified || Date.now(),
        data: await file.arrayBuffer(),
      })),
    ),
  };
  await withStore("readwrite", (store) => store.put(stored));
}

export async function loadPendingAnswerFiles(submissionId: string): Promise<File[]> {
  try {
    const record = await withStore<StoredRecord | undefined>("readonly", (store) => store.get(submissionId));
    if (!record?.files?.length) return [];
    return record.files.map(
      (f) => new File([f.data], f.name, { type: f.type, lastModified: f.lastModified }),
    );
  } catch {
    return [];
  }
}

export async function clearPendingAnswerFiles(submissionId: string) {
  try {
    await withStore("readwrite", (store) => store.delete(submissionId));
  } catch {
    /* 一時保存の削除に失敗しても提出自体は止めない。 */
  }
}
