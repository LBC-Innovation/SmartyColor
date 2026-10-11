"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import type { StudioLayoutMode } from "@/components/v2/V2StudioLayoutToggle";
import { useAuth } from "@/context/AuthContext";
import * as library from "@/lib/library/client";
import {
  entriesFromLibraryPhotos,
  evictEntryImages,
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
  projects: V2ProjectMeta[];
  activeProjectId: string | null;
  activeProject: V2ProjectMeta | null;
  createProject: () => void;
  switchProject: (projectId: string) => void;
  renameActiveProject: (name: string) => void;
  /** Permanently removes a project and all its photos; switches to another project (or a fresh one). */
  deleteProject: (projectId: string) => Promise<void>;
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
  const userId = user?.id ?? null;
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

  // ---------------------------------------------------------------- loading

  const loadCloudProject = useCallback(
    async (projectId: string, meta: V2ProjectMeta[]): Promise<void> => {
      const [photosRes, projectsRes] = await Promise.all([
        library.listPhotos(projectId),
        library.listProjects(),
      ]);
      if (photosRes.error) throw new Error(photosRes.error.message);
      const entries = await entriesFromLibraryPhotos(photosRes.data!);
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
      if (!projectsRes.error) setProjects(projectsRes.data!.map(projectMetaFromLibrary));
      else setProjects(meta);
    },
    [setters],
  );

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
      const preferred = readActiveProjectPref(uid);
      const active = list.find((p) => p.id === preferred)?.id ?? list[0].id;
      const meta = list.map(projectMetaFromLibrary);
      setProjects(meta);
      setActiveProjectId(active);
      activeProjectIdRef.current = active;
      writeActiveProjectPref(uid, active);
      await loadCloudProject(active, meta);
    },
    [loadCloudProject],
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
  useEffect(() => {
    if (authLoading) return;
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
  }, [authLoading, userId, bootstrapCloud, bootstrapLocal, revokeAllPreviews]);

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

  // ------------------------------------------------------------- persisting

  // Project-level fields (selection, layout, story) — local snapshot or cloud PATCH.
  useEffect(() => {
    if (!hydrated || persistSkipRef.current || switchingRef.current) return;
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;

    const timer = window.setTimeout(() => {
      if (modeRef.current === "cloud") {
        void library.updateProject(projectId, {
          selectedPhotoId: selectedIdRef.current,
          studioLayout: studioLayoutRef.current,
          tripNarrative: tripNarrativeRef.current,
          familyContext: familyContextRef.current,
          generatedStory: generatedStoryRef.current,
          printArtMode: printArtModeRef.current,
          storyPhase: storyPhaseRef.current,
        });
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
            await loadCloudProject(projectId, projectsRef.current);
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
    [buildSnapshot, loadCloudProject, revokeAllPreviews, setters],
  );

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
          const res = await library.deleteProject(projectId);
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
      projects,
      activeProjectId,
      activeProject,
      createProject,
      switchProject,
      renameActiveProject,
      deleteProject,
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
      projects,
      activeProjectId,
      activeProject,
      createProject,
      switchProject,
      renameActiveProject,
      deleteProject,
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
