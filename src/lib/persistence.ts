/**
 * Persist loaded videos and their state (trim, transform, etc.) in IndexedDB
 * so they survive page refresh. Used for testing and convenience.
 */

import type { VideoTransform, ImageAdjust } from '../hooks/useVideoPlayer';
import type { MarkupSnap } from '../hooks/useMarkup';

const DB_NAME = 'VeloVideoBike';
const STORE = 'videos';
const KEY_VIDEO1 = 'video1';
const KEY_VIDEO2 = 'video2';

export interface PersistedVideo {
  blob: Blob;
  fileName: string;
  trimStart: number;
  trimEnd: number;
  currentTime: number;
  playbackRate: number;
  transform: VideoTransform;
  imageAdjust?: ImageAdjust;
  markup?: MarkupSnap;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
  });
}

function get<T>(key: string): Promise<T | undefined> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, 'readonly');
        const req = t.objectStore(STORE).get(key);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result as T | undefined);
        t.oncomplete = () => db.close();
      })
  );
}

function set(key: string, value: PersistedVideo): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, 'readwrite');
        const req = t.objectStore(STORE).put(value, key);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve();
        t.oncomplete = () => db.close();
      })
  );
}

export function getPersistedVideos(): Promise<{
  video1?: PersistedVideo;
  video2?: PersistedVideo;
}> {
  return Promise.all([get<PersistedVideo>(KEY_VIDEO1), get<PersistedVideo>(KEY_VIDEO2)]).then(
    ([video1, video2]) => ({ video1, video2 })
  );
}

export function setPersistedVideo(
  slot: 'video1' | 'video2',
  data: PersistedVideo
): Promise<void> {
  return set(slot === 'video1' ? KEY_VIDEO1 : KEY_VIDEO2, data);
}

export function removePersistedVideo(slot: 'video1' | 'video2'): Promise<void> {
  const key = slot === 'video1' ? KEY_VIDEO1 : KEY_VIDEO2;
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, 'readwrite');
        t.objectStore(STORE).delete(key);
        t.onerror = () => reject(t.error);
        t.oncomplete = () => { db.close(); resolve(); };
      })
  );
}

export function clearPersistedVideos(): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, 'readwrite');
        const s = t.objectStore(STORE);
        s.delete(KEY_VIDEO1);
        s.delete(KEY_VIDEO2);
        t.onerror = () => reject(t.error);
        t.oncomplete = () => {
          db.close();
          resolve();
        };
      })
  );
}
