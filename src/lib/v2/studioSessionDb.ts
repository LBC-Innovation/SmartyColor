import { blobToDataUrl, dataUrlToBlob } from "@/lib/photo/dataUrlBlob";
import type { GeneratedSheet } from "@/lib/session/types";
import type { StudioLayoutMode } from "@/components/v2/V2StudioLayoutToggle";
import { defaultStoryFields } from "@/lib/v2/storybookTypes";
import type {
  V2PhotoEntry,
  V2ProjectMeta,
  V2ProjectsMeta,
  V2StudioBootstrap,
  V2StudioSnapshot,
} from "@/lib/v2/studioTypes";
import { emptyV2StudioSnapshot } from "@/lib/v2/studioTypes";

const DB_NAME = "smartycolor-v2-studio";
const DB_VERSION = 2;
const STORE = "session";
const LEGACY_SESSION_KEY = "current";
const META_KEY = "meta";

function projectSessionKey(projectId: string): string {
  return `project:${projectId}`;
}

type StoredSheet = {
  title: string;
  mimeType: string;
  blob: Blob;
};

type StoredPhoto = {
  id: string;
  printPrefs: V2PhotoEntry["printPrefs"];
  photoBlob: Blob;
  sheet: StoredSheet | null;
  sheetRevisions: Array<{ id: string; createdAt: string; sheet: StoredSheet }>;
  activeRevisionId: string | null;
  capturedAt?: string;
  fileName?: string;
  userCaption?: string;
  chatMessages?: V2PhotoEntry["chatMessages"];
  photoSummary?: string | null;
  crop?: V2PhotoEntry["crop"];
};

type StoredSession = {
  selectedId: string | null;
  studioLayout: StudioLayoutMode;
  photos: StoredPhoto[];
  updatedAt: string;
  tripNarrative?: string;
  familyContext?: string;
  generatedStory?: V2StudioSnapshot["generatedStory"];
  printArtMode?: V2StudioSnapshot["printArtMode"];
  storyPhase?: V2StudioSnapshot["storyPhase"];
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB failed"));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  const value = await new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(key);
    request.onerror = () => reject(request.error ?? new Error("read failed"));
    request.onsuccess = () => resolve(request.result as T | undefined);
  });
  db.close();
  return value;
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("write failed"));
    tx.objectStore(STORE).put(value, key);
  });
  db.close();
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("delete failed"));
    tx.objectStore(STORE).delete(key);
  });
  db.close();
}

function sheetFromGenerated(sheet: GeneratedSheet): StoredSheet {
  return {
    title: sheet.title,
    mimeType: sheet.mimeType,
    blob: dataUrlToBlob(sheet.imageDataUrl),
  };
}

async function storedSheetToGenerated(stored: StoredSheet): Promise<GeneratedSheet> {
  const imageDataUrl = await blobToDataUrl(stored.blob);
  return {
    title: stored.title,
    mimeType: stored.mimeType,
    imageDataUrl,
  };
}

async function photoToStored(photo: V2PhotoEntry): Promise<StoredPhoto> {
  const revisions = (photo.sheetRevisions ?? []).map((revision) => ({
    id: revision.id,
    createdAt: revision.createdAt,
    sheet: sheetFromGenerated(revision.sheet),
  }));

  return {
    id: photo.id,
    printPrefs: photo.printPrefs,
    photoBlob: dataUrlToBlob(photo.photoDataUrl),
    sheet: photo.sheet ? sheetFromGenerated(photo.sheet) : null,
    sheetRevisions: revisions,
    activeRevisionId: photo.activeRevisionId ?? null,
    capturedAt: photo.capturedAt,
    fileName: photo.fileName,
    userCaption: photo.userCaption,
    chatMessages: photo.chatMessages,
    photoSummary: photo.photoSummary,
    crop: photo.crop,
  };
}

async function storedToPhoto(stored: StoredPhoto): Promise<V2PhotoEntry> {
  const photoDataUrl = await blobToDataUrl(stored.photoBlob);
  const previewUrl = URL.createObjectURL(stored.photoBlob);

  let sheet: GeneratedSheet | null = null;
  if (stored.sheet) {
    sheet = await storedSheetToGenerated(stored.sheet);
  }

  const sheetRevisions = await Promise.all(
    stored.sheetRevisions.map(async (revision) => ({
      id: revision.id,
      createdAt: revision.createdAt,
      sheet: await storedSheetToGenerated(revision.sheet),
    })),
  );

  return {
    id: stored.id,
    previewUrl,
    photoDataUrl,
    printPrefs: stored.printPrefs,
    sheet,
    sheetRevisions,
    activeRevisionId: stored.activeRevisionId,
    generating: false,
    correcting: false,
    capturedAt: stored.capturedAt,
    fileName: stored.fileName,
    userCaption: stored.userCaption,
    chatMessages: stored.chatMessages,
    photoSummary: stored.photoSummary,
    crop: stored.crop,
  };
}

function storyFieldsFromStored(stored: StoredSession | undefined) {
  const defaults = defaultStoryFields();
  if (!stored) return defaults;
  return {
    tripNarrative: stored.tripNarrative ?? defaults.tripNarrative,
    familyContext: stored.familyContext ?? defaults.familyContext,
    generatedStory: stored.generatedStory ?? defaults.generatedStory,
    printArtMode: stored.printArtMode ?? defaults.printArtMode,
    storyPhase: stored.storyPhase ?? defaults.storyPhase,
  };
}

async function storedSessionToSnapshot(
  stored: StoredSession | undefined,
): Promise<V2StudioSnapshot> {
  if (!stored) return emptyV2StudioSnapshot();

  const story = storyFieldsFromStored(stored);

  if (!stored.photos?.length) {
    return {
      photos: [],
      selectedId: stored.selectedId,
      studioLayout: stored.studioLayout ?? "both",
      ...story,
    };
  }

  const photos = await Promise.all(stored.photos.map(storedToPhoto));
  return {
    photos,
    selectedId: stored.selectedId,
    studioLayout: stored.studioLayout ?? "both",
    ...story,
  };
}

function snapshotToStored(snapshot: V2StudioSnapshot): StoredSession {
  return {
    selectedId: snapshot.selectedId,
    studioLayout: snapshot.studioLayout,
    photos: [],
    updatedAt: new Date().toISOString(),
    tripNarrative: snapshot.tripNarrative,
    familyContext: snapshot.familyContext,
    generatedStory: snapshot.generatedStory,
    printArtMode: snapshot.printArtMode,
    storyPhase: snapshot.storyPhase,
  };
}

async function snapshotToStoredAsync(
  snapshot: V2StudioSnapshot,
): Promise<StoredSession> {
  const photos = await Promise.all(snapshot.photos.map(photoToStored));
  return {
    selectedId: snapshot.selectedId,
    studioLayout: snapshot.studioLayout,
    photos,
    updatedAt: new Date().toISOString(),
    tripNarrative: snapshot.tripNarrative,
    familyContext: snapshot.familyContext,
    generatedStory: snapshot.generatedStory,
    printArtMode: snapshot.printArtMode,
    storyPhase: snapshot.storyPhase,
  };
}

function newProjectMeta(name: string, photoCount = 0): V2ProjectMeta {
  return {
    id: crypto.randomUUID(),
    name,
    updatedAt: new Date().toISOString(),
    photoCount,
  };
}

async function migrateLegacySessionIfNeeded(): Promise<V2ProjectsMeta | null> {
  const legacy = await idbGet<StoredSession>(LEGACY_SESSION_KEY);
  if (!legacy) return null;

  const project = newProjectMeta("My first project", legacy.photos?.length ?? 0);
  await idbPut(projectSessionKey(project.id), legacy);
  const meta: V2ProjectsMeta = {
    activeProjectId: project.id,
    projects: [project],
  };
  await idbPut(META_KEY, meta);
  await idbDelete(LEGACY_SESSION_KEY);
  return meta;
}

async function ensureProjectsMeta(): Promise<V2ProjectsMeta> {
  let meta = await idbGet<V2ProjectsMeta>(META_KEY);
  if (!meta) {
    const migrated = await migrateLegacySessionIfNeeded();
    if (migrated) return migrated;
  }

  if (meta?.activeProjectId && meta.projects?.length) {
    return meta;
  }

  const project = newProjectMeta("Untitled project");
  meta = {
    activeProjectId: project.id,
    projects: [project],
  };
  await idbPut(META_KEY, meta);
  await idbPut(
    projectSessionKey(project.id),
    snapshotToStored(emptyV2StudioSnapshot()),
  );
  return meta;
}

export async function loadV2StudioBootstrap(): Promise<V2StudioBootstrap | null> {
  if (typeof indexedDB === "undefined") return null;

  try {
    const meta = await ensureProjectsMeta();
    const stored = await idbGet<StoredSession>(
      projectSessionKey(meta.activeProjectId),
    );
    const session = await storedSessionToSnapshot(stored);
    return { meta, session };
  } catch {
    return null;
  }
}

export async function saveV2ProjectSession(
  projectId: string,
  snapshot: V2StudioSnapshot,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;

  try {
    const record = await snapshotToStoredAsync(snapshot);
    await idbPut(projectSessionKey(projectId), record);

    const meta = await idbGet<V2ProjectsMeta>(META_KEY);
    if (!meta) return;

    const updatedAt = record.updatedAt;
    const photoCount = snapshot.photos.length;
    const nextProjects = meta.projects.map((project) =>
      project.id === projectId
        ? { ...project, updatedAt, photoCount }
        : project,
    );
    await idbPut(META_KEY, { ...meta, projects: nextProjects });
  } catch {
    /* best-effort persistence */
  }
}

export async function saveV2ProjectsMeta(meta: V2ProjectsMeta): Promise<void> {
  if (typeof indexedDB === "undefined") return;

  try {
    await idbPut(META_KEY, meta);
  } catch {
    /* best-effort */
  }
}

export async function loadV2ProjectSession(
  projectId: string,
): Promise<V2StudioSnapshot> {
  if (typeof indexedDB === "undefined") return emptyV2StudioSnapshot();

  try {
    const stored = await idbGet<StoredSession>(projectSessionKey(projectId));
    return await storedSessionToSnapshot(stored);
  } catch {
    return emptyV2StudioSnapshot();
  }
}

/** @deprecated Use loadV2StudioBootstrap */
export async function loadV2StudioSession(): Promise<V2StudioSnapshot | null> {
  const bootstrap = await loadV2StudioBootstrap();
  return bootstrap?.session ?? null;
}

/** @deprecated Use saveV2ProjectSession */
export async function saveV2StudioSession(snapshot: V2StudioSnapshot): Promise<void> {
  const meta = await ensureProjectsMeta();
  await saveV2ProjectSession(meta.activeProjectId, snapshot);
}

export async function clearV2ProjectSession(projectId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;

  try {
    await idbPut(projectSessionKey(projectId), snapshotToStored(emptyV2StudioSnapshot()));
  } catch {
    /* ignore */
  }
}

export async function clearV2StudioSession(): Promise<void> {
  if (typeof indexedDB === "undefined") return;

  try {
    const meta = await ensureProjectsMeta();
    await clearV2ProjectSession(meta.activeProjectId);
  } catch {
    /* ignore */
  }
}

export function defaultNewProjectName(projectCount: number): string {
  return `Project ${projectCount + 1}`;
}
