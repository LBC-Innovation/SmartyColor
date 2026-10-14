"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import type { StudioLayoutMode } from "@/components/v2/V2StudioLayoutToggle";
import { useV2Toast } from "@/components/v2/V2Toast";
import { useAuth } from "@/context/AuthContext";
import { hasSessionToken, readSessionHint } from "@/lib/api/client";
import { STUDIO_PATH } from "@/lib/v2/guestSession";
import * as library from "@/lib/library/client";
import type { LibraryProject } from "@/lib/library/types";
import {
  applyResolvedImageUrls,
  entriesFromLibraryPhotosNow,
  evictEntryImages,
  resolveLibraryImages,
  pickPersistedPatch,
  projectMetaFromLibrary,
} from "@/lib/v2/cloudLibrary";
import {
  defaultNewProjectName,
  loadV2ProjectSession,
  loadV2StudioBootstrap,
  saveV2ProjectSession,
  saveV2ProjectsMeta,
  clearV2ProjectSession,
} from "@/lib/v2/studioSessionDb";
import type {
  StoryPrintArtMode,
  V2GeneratedStory,
  V2StoryBookPhase,
} from "@/lib/v2/storybookTypes";
import {
  emptyV2StudioSnapshot,
  type V2PhotoEntry,
  type V2ProjectMeta,
  type V2StudioSnapshot,
} from "@/lib/v2/studioTypes";

type PendingUpload = { id: string };

/**
 * The studio runs in one of two modes behind the same context:
 *  - "local": guests; projects and images persist in IndexedDB only.
 *  - "cloud": signed-in; the Supabase library is the source of truth and
 *    IndexedDB is only an image cache.
 */
export type V2StudioMode = "local" | "cloud";

type V2StudioContextValue = {
  hydrated: boolean;
  mode: V2StudioMode;
  /** True when the library lives in the user's account. */
  cloud: boolean;
  /** Re-read the active project from its source (after a migration, for instance). */
  reload: () => Promise<void>;
  /**
   * Cloud only: pull the active album's photos again, so pages other people
   * added show up. Resolves "gone" when the album is no longer available.
   */
  refreshActiveProject: () => Promise<"ok" | "gone">;
  projects: V2ProjectMeta[];
  activeProjectId: string | null;
  activeProject: V2ProjectMeta | null;
  createProject: () => void;
  switchProject: (projectId: string) => void;
  renameActiveProject: (name: string) => void;
  /**
   * Permanently removes a project and all its photos; switches to another project (or a fresh one).
   * For an album someone else shared, this leaves it instead and nothing is deleted.
   */
  deleteProject: (projectId: string) => Promise<void>;
  /** Keep the "Shared with N" hint in step after invites change. */
  setProjectSharedCount: (projectId: string, sharedCount: number) => void;
  photos: V2PhotoEntry[];
  photosRef: RefObject<V2PhotoEntry[]>;
  pendingUploads: PendingUpload[];
  selectedId: string | null;
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
  studioLayout: StudioLayoutMode;
  setStudioLayout: React.Dispatch<React.SetStateAction<StudioLayoutMode>>;
  tripNarrative: string;
  setTripNarrative: React.Dispatch<React.SetStateAction<string>>;
  familyContext: string;
  setFamilyContext: React.Dispatch<React.SetStateAction<string>>;
  generatedStory: V2GeneratedStory | null;
  setGeneratedStory: React.Dispatch<React.SetStateAction<V2GeneratedStory | null>>;
  printArtMode: StoryPrintArtMode;
  setPrintArtMode: React.Dispatch<React.SetStateAction<StoryPrintArtMode>>;
  storyPhase: V2StoryBookPhase;
  setStoryPhase: React.Dispatch<React.SetStateAction<V2StoryBookPhase>>;
  setPendingUploads: React.Dispatch<React.SetStateAction<PendingUpload[]>>;
  /** Replace the list (reorders persist in cloud mode). */
  replacePhotos: (next: V2PhotoEntry[]) => void;
  mutatePhotos: (recipe: (prev: V2PhotoEntry[]) => V2PhotoEntry[]) => void;
  /** Patch one entry; persisted fields sync to the cloud unless `persist: false`. */
  updatePhoto: (id: string, patch: Partial<V2PhotoEntry>, opts?: { persist?: boolean }) => void;
  appendPhoto: (entry: V2PhotoEntry) => void;
  removePhotosByIds: (ids: string[]) => void;
  clearAllPhotos: () => void;
  trackPreviewUrl: (url: string) => void;
};

const V2StudioContext = createContext<V2StudioContextValue | null>(null);

const ACTIVE_PROJECT_KEY = "cm_cloud_active_project";

function readActiveProjectPref(userId: string): string | null {
  try {
    return localStorage.getItem(`${ACTIVE_PROJECT_KEY}:${userId}`);
  } catch {
    return null;
  }
}

const noSubscribe = () => () => {};

/** The account this device last signed in as, if it still holds a session token. */
function readHintedUserId(): string | null {
  return hasSessionToken() ? readSessionHint()?.id ?? null : null;
}

const ALBUM_LINK_PARAM = "album";

/** Album id from a share email's link (`/studio?album=…`), if this page load has one. */
function readAlbumLink(): string | null {
  try {
    if (window.location.pathname !== STUDIO_PATH) return null;
    return new URLSearchParams(window.location.search).get(ALBUM_LINK_PARAM);
  } catch {
    return null;
  }
}

function clearAlbumLink() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete(ALBUM_LINK_PARAM);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* ignore */
  }
}

function writeActiveProjectPref(userId: string, projectId: string) {
  try {
    localStorage.setItem(`${ACTIVE_PROJECT_KEY}:${userId}`, projectId);
  } catch {
    /* ignore */
  }
}

type Setters = {
  setPhotos: React.Dispatch<React.SetStateAction<V2PhotoEntry[]>>;
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
  setStudioLayout: React.Dispatch<React.SetStateAction<StudioLayoutMode>>;
  setTripNarrative: React.Dispatch<React.SetStateAction<string>>;
  setFamilyContext: React.Dispatch<React.SetStateAction<string>>;
  setGeneratedStory: React.Dispatch<React.SetStateAction<V2GeneratedStory | null>>;
  setPrintArtMode: React.Dispatch<React.SetStateAction<StoryPrintArtMode>>;
  setStoryPhase: React.Dispatch<React.SetStateAction<V2StoryBookPhase>>;
  photosRef: React.MutableRefObject<V2PhotoEntry[]>;
};

function applySessionToState(
  session: V2StudioSnapshot,
  previewUrlsRef: React.MutableRefObject<Set<string>>,
  setters: Setters,
) {
  for (const photo of session.photos) {
    if (photo.previewUrl.startsWith("blob:") && !photo.remote) previewUrlsRef.current.add(photo.previewUrl);
  }
  setters.photosRef.current = session.photos;
  setters.setPhotos(session.photos);
  setters.setSelectedId(session.selectedId);
  setters.setStudioLayout(session.studioLayout);
  setters.setTripNarrative(session.tripNarrative);
  setters.setFamilyContext(session.familyContext);
  setters.setGeneratedStory(session.generatedStory);
  setters.setPrintArtMode(session.printArtMode);
  setters.setStoryPhase(session.storyPhase);
}

export function V2StudioProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useV2Toast();
  const toastRef = useRef(toast);
  // While the session check is still in flight, assume the account this device last signed in as,
  // so the album loads alongside that check instead of after it. If the check comes back with a
  // different answer (signed out, expired), the identity changes and the studio re-bootstraps.
  const hintedUserId = useSyncExternalStore(noSubscribe, readHintedUserId, () => null);
  const userId = authLoading ? hintedUserId : user?.id ?? null;
  const userEmailRef = useRef<string | null>(user?.email ?? null);
  const mode: V2StudioMode = userId ? "cloud" : "local";
  const cloud = mode === "cloud";

  const [hydrated, setHydrated] = useState(false);
  const [projects, setProjects] = useState<V2ProjectMeta[]>([]);
  const projectsRef = useRef<V2ProjectMeta[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<V2PhotoEntry[]>([]);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [studioLayout, setStudioLayout] = useState<StudioLayoutMode>("both");
  const [tripNarrative, setTripNarrative] = useState("");
  const [familyContext, setFamilyContext] = useState("");
  const [generatedStory, setGeneratedStory] = useState<V2GeneratedStory | null>(null);
  const [printArtMode, setPrintArtMode] = useState<StoryPrintArtMode>("photos");
  const [storyPhase, setStoryPhase] = useState<V2StoryBookPhase>("setup");

  const photosRef = useRef(photos);
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const persistSkipRef = useRef(true);
  const activeProjectIdRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const studioLayoutRef = useRef<StudioLayoutMode>("both");
  const tripNarrativeRef = useRef("");
  const familyContextRef = useRef("");
  const generatedStoryRef = useRef<V2GeneratedStory | null>(null);
  const printArtModeRef = useRef<StoryPrintArtMode>("photos");
  const storyPhaseRef = useRef<V2StoryBookPhase>("setup");
  const switchingRef = useRef(false);
  const modeRef = useRef<V2StudioMode>(mode);
  const userIdRef = useRef<string | null>(userId);
  const photoPatchTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingPhotoPatches = useRef<Map<string, Record<string, unknown>>>(new Map());

  const setters = useMemo<Setters>(
    () => ({
      setPhotos,
      setSelectedId,
      setStudioLayout,
      setTripNarrative,
      setFamilyContext,
      setGeneratedStory,
      setPrintArtMode,
      setStoryPhase,
      photosRef,
    }),
    [],
  );

  const buildSnapshot = useCallback(
    (): V2StudioSnapshot => ({
      photos: photosRef.current,
      selectedId: selectedIdRef.current,
      studioLayout: studioLayoutRef.current,
      tripNarrative: tripNarrativeRef.current,
      familyContext: familyContextRef.current,
      generatedStory: generatedStoryRef.current,
      printArtMode: printArtModeRef.current,
      storyPhase: storyPhaseRef.current,
    }),
    [],
  );

  const revokeAllPreviews = useCallback(() => {
    for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
    previewUrlsRef.current.clear();
  }, []);

  const trackPreviewUrl = useCallback((url: string) => {
    previewUrlsRef.current.add(url);
  }, []);

  // ---- keep refs in sync with state
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { studioLayoutRef.current = studioLayout; }, [studioLayout]);
  useEffect(() => { tripNarrativeRef.current = tripNarrative; }, [tripNarrative]);
  useEffect(() => { familyContextRef.current = familyContext; }, [familyContext]);
  useEffect(() => { generatedStoryRef.current = generatedStory; }, [generatedStory]);
  useEffect(() => { printArtModeRef.current = printArtMode; }, [printArtMode]);
  useEffect(() => { storyPhaseRef.current = storyPhase; }, [storyPhase]);
  useEffect(() => { activeProjectIdRef.current = activeProjectId; }, [activeProjectId]);
  useEffect(() => { projectsRef.current = projects; }, [projects]);
  useEffect(() => { modeRef.current = mode; userIdRef.current = userId; }, [mode, userId]);
  useEffect(() => { toastRef.current = toast; userEmailRef.current = user?.email ?? null; }, [toast, user?.email]);

  // ---------------------------------------------------------------- loading

  // What the server last had for the active album's own fields, so loads and photo-only changes
  // don't save them back unchanged.
  const savedProjectFieldsRef = useRef<string | null>(null);
  // Bumped on every album load, so background image downloads for an album we've left stop.
  const imageLoadGenRef = useRef(0);

  /**
   * Show an album as soon as its photo list arrives. Images not yet cached on this device keep
   * their signed URLs and are swapped for cached copies in the background, selected photo first.
   * Pass `list` when the caller already fetched the album list, to skip fetching it again.
   */
  const loadCloudProject = useCallback(
    async (projectId: string, meta: V2ProjectMeta[], list?: LibraryProject[]): Promise<void> => {
      const [photosRes, projectsRes] = await Promise.all([
        library.listPhotos(projectId),
        list ? { data: list, error: null } : library.listProjects(),
      ]);
      if (photosRes.error) throw new Error(photosRes.error.message);
      const { entries, pending } = await entriesFromLibraryPhotosNow(photosRes.data!);
      const project = projectsRes.error ? null : projectsRes.data!.find((p) => p.id === projectId) ?? null;
      const session: V2StudioSnapshot = {
        ...emptyV2StudioSnapshot(),
        photos: entries,
        selectedId:
          project?.selectedPhotoId && entries.some((e) => e.id === project.selectedPhotoId)
            ? project.selectedPhotoId
            : entries[0]?.id ?? null,
        studioLayout: (project?.studioLayout as StudioLayoutMode) ?? "both",
        tripNarrative: project?.tripNarrative ?? "",
        familyContext: project?.familyContext ?? "",
        generatedStory: (project?.generatedStory as V2GeneratedStory | null) ?? null,
        printArtMode: (project?.printArtMode as StoryPrintArtMode) ?? "photos",
        storyPhase: (project?.storyPhase as V2StoryBookPhase) ?? "setup",
      };
      applySessionToState(session, previewUrlsRef, setters);
      // As stored: anything the load had to fill in or correct still gets saved once.
      savedProjectFieldsRef.current = project
        ? JSON.stringify([
            projectId,
            {
              selectedPhotoId: project.selectedPhotoId,
              studioLayout: project.studioLayout,
              tripNarrative: project.tripNarrative,
              familyContext: project.familyContext,
              generatedStory: project.generatedStory,
              printArtMode: project.printArtMode,
              storyPhase: project.storyPhase,
            },
          ])
        : null;
      if (!projectsRes.error) setProjects(projectsRes.data!.map(projectMetaFromLibrary));
      else setProjects(meta);

      const gen = ++imageLoadGenRef.current;
      if (pending.length === 0) return;
      void resolveLibraryImages(pending, {
        first: session.selectedId,
        cancelled: () => imageLoadGenRef.current !== gen || activeProjectIdRef.current !== projectId,
        onResolved: (urls) => {
          setPhotos((prev) => {
            const next = prev.map((entry) => applyResolvedImageUrls(entry, urls));
            photosRef.current = next;
            return next;
          });
        },
      });
    },
    [setters],
  );

  const notifyAlbumLinkMiss = useCallback(() => {
    const who = userEmailRef.current ? ` with ${userEmailRef.current}` : "";
    toastRef.current.error(
      `That album isn't shared${who}. Check that you're signed in with the address the invitation was sent to.`,
      "Album not available",
    );
  }, []);

  const bootstrapCloud = useCallback(
    async (uid: string) => {
      const res = await library.listProjects();
      if (res.error) throw new Error(res.error.message);
      let list = res.data!;
      if (list.length === 0) {
        const created = await library.createProject(defaultNewProjectName(0));
        if (created.error) throw new Error(created.error.message);
        list = [created.data!];
      }
      // A share email's link wins over wherever this user last was.
      const linked = readAlbumLink();
      if (linked) {
        clearAlbumLink();
        if (!list.some((p) => p.id === linked)) notifyAlbumLinkMiss();
      }
      const preferred = readActiveProjectPref(uid);
      const active =
        list.find((p) => p.id === linked)?.id ?? list.find((p) => p.id === preferred)?.id ?? list[0].id;
      const meta = list.map(projectMetaFromLibrary);
      setProjects(meta);
      setActiveProjectId(active);
      activeProjectIdRef.current = active;
      writeActiveProjectPref(uid, active);
      await loadCloudProject(active, meta, list);
    },
    [loadCloudProject, notifyAlbumLinkMiss],
  );

  const bootstrapLocal = useCallback(async () => {
    const bootstrap = await loadV2StudioBootstrap();
    if (bootstrap) {
      setProjects(bootstrap.meta.projects);
      setActiveProjectId(bootstrap.meta.activeProjectId);
      activeProjectIdRef.current = bootstrap.meta.activeProjectId;
      applySessionToState(bootstrap.session, previewUrlsRef, setters);
    }
  }, [setters]);

  // Re-bootstrap whenever the identity changes (sign-in, sign-out, first load).
  // Nothing to load until we know (or have a good guess at) who is signed in.
  const awaitingIdentity = authLoading && !hintedUserId;
  useEffect(() => {
    if (awaitingIdentity) return;
    // Share links need an account: sign in first, then come back to the album.
    const linkedAlbum = userId ? null : readAlbumLink();
    if (linkedAlbum) {
      const next = `${STUDIO_PATH}?${ALBUM_LINK_PARAM}=${encodeURIComponent(linkedAlbum)}`;
      router.replace(`/sign-in?next=${encodeURIComponent(next)}`);
      return;
    }
    let cancelled = false;
    persistSkipRef.current = true;
    setHydrated(false);
    revokeAllPreviews();
    setPendingUploads([]);

    void (async () => {
      try {
        if (userId) await bootstrapCloud(userId);
        else await bootstrapLocal();
      } catch (e) {
        console.error("studio bootstrap failed", e);
      } finally {
        if (!cancelled) {
          persistSkipRef.current = false;
          setHydrated(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [awaitingIdentity, userId, bootstrapCloud, bootstrapLocal, revokeAllPreviews, router]);

  const reload = useCallback(async () => {
    if (modeRef.current === "cloud" && userIdRef.current) {
      persistSkipRef.current = true;
      try {
        await bootstrapCloud(userIdRef.current);
      } finally {
        persistSkipRef.current = false;
      }
    } else {
      await bootstrapLocal();
    }
  }, [bootstrapCloud, bootstrapLocal]);

  const refreshActiveProject = useCallback(async (): Promise<"ok" | "gone"> => {
    const projectId = activeProjectIdRef.current;
    const uid = userIdRef.current;
    if (modeRef.current !== "cloud" || !projectId || !uid || switchingRef.current) return "ok";
    switchingRef.current = true;
    persistSkipRef.current = true;
    const keepSelected = selectedIdRef.current;
    try {
      const list = await library.listProjects();
      if (list.error) throw new Error(list.error.message);
      if (!list.data!.some((p) => p.id === projectId)) {
        // Deleted, or the owner stopped sharing it: fall back to another album.
        await bootstrapCloud(uid);
        return "gone";
      }
      await loadCloudProject(projectId, list.data!.map(projectMetaFromLibrary), list.data!);
      if (keepSelected && photosRef.current.some((p) => p.id === keepSelected)) setSelectedId(keepSelected);
      return "ok";
    } finally {
      persistSkipRef.current = false;
      switchingRef.current = false;
    }
  }, [bootstrapCloud, loadCloudProject]);

  // ------------------------------------------------------------- persisting

  // Project-level fields (selection, layout, story) — local snapshot or cloud PATCH.
  useEffect(() => {
    if (!hydrated || persistSkipRef.current || switchingRef.current) return;
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;

    const timer = window.setTimeout(() => {
      if (modeRef.current === "cloud") {
        const fields = {
          selectedPhotoId: selectedIdRef.current,
          studioLayout: studioLayoutRef.current,
          tripNarrative: tripNarrativeRef.current,
          familyContext: familyContextRef.current,
          generatedStory: generatedStoryRef.current,
          printArtMode: printArtModeRef.current,
          storyPhase: storyPhaseRef.current,
        };
        // Photo changes (images arriving, edits) also land here; only save what actually changed.
        const signature = JSON.stringify([projectId, fields]);
        if (signature === savedProjectFieldsRef.current) return;
        savedProjectFieldsRef.current = signature;
        void library.updateProject(projectId, fields);
        return;
      }
      void saveV2ProjectSession(projectId, buildSnapshot()).then(() => {
        setProjects((prev) =>
          prev.map((project) =>
            project.id === projectId ? { ...project, photoCount: photos.length } : project,
          ),
        );
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    photos,
    selectedId,
    studioLayout,
    tripNarrative,
    familyContext,
    generatedStory,
    printArtMode,
    storyPhase,
    hydrated,
    activeProjectId,
    buildSnapshot,
  ]);

  useEffect(() => () => revokeAllPreviews(), [revokeAllPreviews]);

  // ---------------------------------------------------------- photo mutators

  const replacePhotos = useCallback((next: V2PhotoEntry[]) => {
    const prev = photosRef.current;
    photosRef.current = next;
    setPhotos(next);
    if (modeRef.current === "cloud" && activeProjectIdRef.current) {
      const prevIds = prev.filter((p) => p.remote).map((p) => p.id).join("|");
      const nextIds = next.filter((p) => p.remote).map((p) => p.id);
      if (nextIds.join("|") !== prevIds && nextIds.length > 0) {
        void library.reorderPhotos(activeProjectIdRef.current, nextIds);
      }
    }
  }, []);

  const mutatePhotos = useCallback((recipe: (prev: V2PhotoEntry[]) => V2PhotoEntry[]) => {
    setPhotos((prev) => {
      const next = recipe(prev);
      photosRef.current = next;
      return next;
    });
  }, []);

  const flushPhotoPatch = useCallback((id: string) => {
    const patch = pendingPhotoPatches.current.get(id);
    pendingPhotoPatches.current.delete(id);
    photoPatchTimers.current.delete(id);
    if (!patch || Object.keys(patch).length === 0) return;
    const entry = photosRef.current.find((p) => p.id === id);
    if (!entry?.remote) return;
    void library.updatePhoto(entry.remote.photoId, patch);
  }, []);

  const updatePhoto = useCallback(
    (id: string, patch: Partial<V2PhotoEntry>, opts?: { persist?: boolean }) => {
      setPhotos((prev) => {
        const next = prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry));
        photosRef.current = next;
        return next;
      });
      if (modeRef.current !== "cloud" || opts?.persist === false) return;
      const persisted = pickPersistedPatch(patch);
      if (Object.keys(persisted).length === 0) return;
      pendingPhotoPatches.current.set(id, { ...(pendingPhotoPatches.current.get(id) ?? {}), ...persisted });
      const existing = photoPatchTimers.current.get(id);
      if (existing) clearTimeout(existing);
      photoPatchTimers.current.set(id, setTimeout(() => flushPhotoPatch(id), 400));
    },
    [flushPhotoPatch],
  );

  const appendPhoto = useCallback((entry: V2PhotoEntry) => {
    setPhotos((prev) => {
      const next = [...prev, entry];
      photosRef.current = next;
      return next;
    });
  }, []);

  const removePhotosByIds = useCallback((ids: string[]) => {
    // Photos other people added to a shared album aren't this user's to delete.
    const locked = new Set(photosRef.current.filter((e) => e.canDelete === false).map((e) => e.id));
    ids = ids.filter((id) => !locked.has(id));
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const removed = photosRef.current.filter((e) => idSet.has(e.id));
    let nextPhotos: V2PhotoEntry[] = [];

    setPhotos((prev) => {
      nextPhotos = prev.filter((entry) => {
        if (idSet.has(entry.id)) {
          if (!entry.remote) {
            URL.revokeObjectURL(entry.previewUrl);
            previewUrlsRef.current.delete(entry.previewUrl);
          }
          return false;
        }
        return true;
      });
      photosRef.current = nextPhotos;
      return nextPhotos;
    });

    setSelectedId((current) => {
      if (current && idSet.has(current)) return nextPhotos[0]?.id ?? null;
      return current;
    });

    if (modeRef.current === "cloud") {
      const remoteIds = removed.filter((e) => e.remote).map((e) => e.remote!.photoId);
      if (remoteIds.length > 0) {
        void library.deletePhotos(remoteIds).then(() => evictEntryImages(removed));
      }
    }
  }, []);

  const clearAllPhotos = useCallback(() => {
    revokeAllPreviews();
    photosRef.current = [];
    setPhotos([]);
    setPendingUploads([]);
    setSelectedId(null);
  }, [revokeAllPreviews]);

  // ---------------------------------------------------------------- projects

  const switchProject = useCallback(
    (projectId: string) => {
      if (projectId === activeProjectIdRef.current || switchingRef.current) return;
      switchingRef.current = true;
      persistSkipRef.current = true;

      void (async () => {
        try {
          const previousId = activeProjectIdRef.current;
          const previousPhotoCount = photosRef.current.length;

          if (modeRef.current === "cloud") {
            setActiveProjectId(projectId);
            activeProjectIdRef.current = projectId;
            if (userIdRef.current) writeActiveProjectPref(userIdRef.current, projectId);
            try {
              await loadCloudProject(projectId, projectsRef.current);
            } catch (e) {
              // Most likely an album that stopped being shared since the list was loaded.
              console.error("switch project failed", e);
              toastRef.current.error("That album is no longer available.");
              if (userIdRef.current) await bootstrapCloud(userIdRef.current);
            }
            return;
          }

          if (previousId) await saveV2ProjectSession(previousId, buildSnapshot());
          revokeAllPreviews();
          setPendingUploads([]);
          const session = await loadV2ProjectSession(projectId);
          applySessionToState(session, previewUrlsRef, setters);
          setActiveProjectId(projectId);
          activeProjectIdRef.current = projectId;
          setProjects((prev) => {
            const next = prev.map((project) =>
              project.id === previousId ? { ...project, photoCount: previousPhotoCount } : project,
            );
            void saveV2ProjectsMeta({ activeProjectId: projectId, projects: next });
            return next;
          });
        } finally {
          persistSkipRef.current = false;
          switchingRef.current = false;
        }
      })();
    },
    [bootstrapCloud, buildSnapshot, loadCloudProject, revokeAllPreviews, setters],
  );

  // Arriving at a share link after the studio has already loaded (e.g. straight from sign-in).
  useEffect(() => {
    if (!hydrated || !userId) return;
    const linked = readAlbumLink();
    if (!linked) return;
    clearAlbumLink();
    if (linked === activeProjectIdRef.current) return;
    if (projectsRef.current.some((p) => p.id === linked)) switchProject(linked);
    else notifyAlbumLinkMiss();
  }, [hydrated, userId, pathname, switchProject, notifyAlbumLinkMiss]);

  const createProject = useCallback(() => {
    if (switchingRef.current) return;
    switchingRef.current = true;
    persistSkipRef.current = true;

    void (async () => {
      try {
        if (modeRef.current === "cloud") {
          const created = await library.createProject(defaultNewProjectName(projectsRef.current.length));
          if (created.error) throw new Error(created.error.message);
          const meta = projectMetaFromLibrary(created.data!);
          setProjects((prev) => [...prev, meta]);
          setActiveProjectId(meta.id);
          activeProjectIdRef.current = meta.id;
          if (userIdRef.current) writeActiveProjectPref(userIdRef.current, meta.id);
          revokeAllPreviews();
          setPendingUploads([]);
          applySessionToState(emptyV2StudioSnapshot(), previewUrlsRef, setters);
          return;
        }

        const previousId = activeProjectIdRef.current;
        const previousPhotoCount = photosRef.current.length;
        if (previousId) await saveV2ProjectSession(previousId, buildSnapshot());

        const newProjectId = crypto.randomUUID();
        const empty = emptyV2StudioSnapshot();
        setProjects((prev) => {
          const newProject: V2ProjectMeta = {
            id: newProjectId,
            name: defaultNewProjectName(prev.length),
            updatedAt: new Date().toISOString(),
            photoCount: 0,
          };
          const nextProjects = [
            ...prev.map((project) =>
              project.id === previousId ? { ...project, photoCount: previousPhotoCount } : project,
            ),
            newProject,
          ];
          void saveV2ProjectsMeta({ activeProjectId: newProjectId, projects: nextProjects });
          return nextProjects;
        });
        await saveV2ProjectSession(newProjectId, empty);
        revokeAllPreviews();
        setPendingUploads([]);
        applySessionToState(empty, previewUrlsRef, setters);
        setActiveProjectId(newProjectId);
        activeProjectIdRef.current = newProjectId;
      } catch (e) {
        console.error("create project failed", e);
      } finally {
        persistSkipRef.current = false;
        switchingRef.current = false;
      }
    })();
  }, [buildSnapshot, revokeAllPreviews, setters]);

  const renameActiveProject = useCallback((name: string) => {
    const trimmed = name.trim();
    const id = activeProjectIdRef.current;
    if (!trimmed || !id) return;
    setProjects((prev) => {
      const next = prev.map((project) =>
        project.id === id ? { ...project, name: trimmed, updatedAt: new Date().toISOString() } : project,
      );
      if (modeRef.current === "cloud") void library.updateProject(id, { name: trimmed });
      else void saveV2ProjectsMeta({ activeProjectId: id, projects: next });
      return next;
    });
  }, []);

  const deleteProject = useCallback(
    async (projectId: string) => {
      if (switchingRef.current) return;
      const remaining = projectsRef.current.filter((project) => project.id !== projectId);
      const wasActive = activeProjectIdRef.current === projectId;

      switchingRef.current = true;
      persistSkipRef.current = true;
      try {
        if (modeRef.current === "cloud") {
          const removedEntries = wasActive ? photosRef.current : [];
          const shared = projectsRef.current.find((p) => p.id === projectId)?.role === "contributor";
          const res = shared ? await library.leaveAlbum(projectId) : await library.deleteProject(projectId);
          if (res.error) throw new Error(res.error.message);
          void evictEntryImages(removedEntries);

          let nextProjects = remaining;
          let nextActiveId = activeProjectIdRef.current;
          if (wasActive) {
            if (remaining.length === 0) {
              const created = await library.createProject(defaultNewProjectName(0));
              if (created.error) throw new Error(created.error.message);
              nextProjects = [projectMetaFromLibrary(created.data!)];
            }
            nextActiveId = nextProjects[0].id;
            setActiveProjectId(nextActiveId);
            activeProjectIdRef.current = nextActiveId;
            if (userIdRef.current) writeActiveProjectPref(userIdRef.current, nextActiveId);
            revokeAllPreviews();
            setPendingUploads([]);
            await loadCloudProject(nextActiveId, nextProjects);
          }
          setProjects(nextProjects);
          return;
        }

        await clearV2ProjectSession(projectId);
        let nextActiveId = activeProjectIdRef.current;
        let nextProjects = remaining;
        if (wasActive) {
          revokeAllPreviews();
          setPendingUploads([]);
          if (remaining.length > 0) {
            nextActiveId = remaining[0].id;
            const session = await loadV2ProjectSession(nextActiveId);
            applySessionToState(session, previewUrlsRef, setters);
          } else {
            nextActiveId = crypto.randomUUID();
            const empty = emptyV2StudioSnapshot();
            nextProjects = [
              { id: nextActiveId, name: defaultNewProjectName(0), updatedAt: new Date().toISOString(), photoCount: 0 },
            ];
            await saveV2ProjectSession(nextActiveId, empty);
            applySessionToState(empty, previewUrlsRef, setters);
          }
          setActiveProjectId(nextActiveId);
          activeProjectIdRef.current = nextActiveId;
        }
        setProjects(nextProjects);
        await saveV2ProjectsMeta({ activeProjectId: nextActiveId!, projects: nextProjects });
      } finally {
        persistSkipRef.current = false;
        switchingRef.current = false;
      }
    },
    [loadCloudProject, revokeAllPreviews, setters],
  );

  const setProjectSharedCount = useCallback((projectId: string, sharedCount: number) => {
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, sharedCount } : p)));
  }, []);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );

  const value = useMemo(
    () => ({
      hydrated,
      mode,
      cloud,
      reload,
      refreshActiveProject,
      projects,
      activeProjectId,
      activeProject,
      createProject,
      switchProject,
      renameActiveProject,
      deleteProject,
      setProjectSharedCount,
      photos,
      photosRef,
      pendingUploads,
      selectedId,
      setSelectedId,
      studioLayout,
      setStudioLayout,
      tripNarrative,
      setTripNarrative,
      familyContext,
      setFamilyContext,
      generatedStory,
      setGeneratedStory,
      printArtMode,
      setPrintArtMode,
      storyPhase,
      setStoryPhase,
      setPendingUploads,
      replacePhotos,
      mutatePhotos,
      updatePhoto,
      appendPhoto,
      removePhotosByIds,
      clearAllPhotos,
      trackPreviewUrl,
    }),
    [
      hydrated,
      mode,
      cloud,
      reload,
      refreshActiveProject,
      projects,
      activeProjectId,
      activeProject,
      createProject,
      switchProject,
      renameActiveProject,
      deleteProject,
      setProjectSharedCount,
      photos,
      pendingUploads,
      selectedId,
      studioLayout,
      tripNarrative,
      familyContext,
      generatedStory,
      printArtMode,
      storyPhase,
      replacePhotos,
      mutatePhotos,
      updatePhoto,
      appendPhoto,
      removePhotosByIds,
      clearAllPhotos,
      trackPreviewUrl,
    ],
  );

  return <V2StudioContext.Provider value={value}>{children}</V2StudioContext.Provider>;
}

export function useV2Studio() {
  const ctx = useContext(V2StudioContext);
  if (!ctx) throw new Error("useV2Studio must be used within V2StudioProvider");
  return ctx;
}
