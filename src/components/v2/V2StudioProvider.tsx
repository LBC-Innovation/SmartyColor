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
import {
  defaultNewProjectName,
  loadV2ProjectSession,
  loadV2StudioBootstrap,
  saveV2ProjectSession,
  saveV2ProjectsMeta,
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

type V2StudioContextValue = {
  hydrated: boolean;
  projects: V2ProjectMeta[];
  activeProjectId: string | null;
  activeProject: V2ProjectMeta | null;
  createProject: () => void;
  switchProject: (projectId: string) => void;
  renameActiveProject: (name: string) => void;
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
  setGeneratedStory: React.Dispatch<
    React.SetStateAction<V2GeneratedStory | null>
  >;
  printArtMode: StoryPrintArtMode;
  setPrintArtMode: React.Dispatch<React.SetStateAction<StoryPrintArtMode>>;
  storyPhase: V2StoryBookPhase;
  setStoryPhase: React.Dispatch<React.SetStateAction<V2StoryBookPhase>>;
  setPendingUploads: React.Dispatch<React.SetStateAction<PendingUpload[]>>;
  replacePhotos: (next: V2PhotoEntry[]) => void;
  mutatePhotos: (
    recipe: (prev: V2PhotoEntry[]) => V2PhotoEntry[],
  ) => void;
  updatePhoto: (id: string, patch: Partial<V2PhotoEntry>) => void;
  appendPhoto: (entry: V2PhotoEntry) => void;
  removePhotosByIds: (ids: string[]) => void;
  clearAllPhotos: () => void;
  trackPreviewUrl: (url: string) => void;
};

const V2StudioContext = createContext<V2StudioContextValue | null>(null);

function applySessionToState(
  session: V2StudioSnapshot,
  previewUrlsRef: React.MutableRefObject<Set<string>>,
  setters: {
    setPhotos: React.Dispatch<React.SetStateAction<V2PhotoEntry[]>>;
    setSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
    setStudioLayout: React.Dispatch<React.SetStateAction<StudioLayoutMode>>;
    setTripNarrative: React.Dispatch<React.SetStateAction<string>>;
    setFamilyContext: React.Dispatch<React.SetStateAction<string>>;
    setGeneratedStory: React.Dispatch<
      React.SetStateAction<V2GeneratedStory | null>
    >;
    setPrintArtMode: React.Dispatch<React.SetStateAction<StoryPrintArtMode>>;
    setStoryPhase: React.Dispatch<React.SetStateAction<V2StoryBookPhase>>;
    photosRef: React.MutableRefObject<V2PhotoEntry[]>;
  },
) {
  for (const photo of session.photos) {
    previewUrlsRef.current.add(photo.previewUrl);
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
  const [hydrated, setHydrated] = useState(false);
  const [projects, setProjects] = useState<V2ProjectMeta[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<V2PhotoEntry[]>([]);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [studioLayout, setStudioLayout] = useState<StudioLayoutMode>("both");
  const [tripNarrative, setTripNarrative] = useState("");
  const [familyContext, setFamilyContext] = useState("");
  const [generatedStory, setGeneratedStory] = useState<V2GeneratedStory | null>(
    null,
  );
  const [printArtMode, setPrintArtMode] =
    useState<StoryPrintArtMode>("photos");
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

  const buildSnapshot = useCallback((): V2StudioSnapshot => {
    return {
      photos: photosRef.current,
      selectedId: selectedIdRef.current,
      studioLayout: studioLayoutRef.current,
      tripNarrative: tripNarrativeRef.current,
      familyContext: familyContextRef.current,
      generatedStory: generatedStoryRef.current,
      printArtMode: printArtModeRef.current,
      storyPhase: storyPhaseRef.current,
    };
  }, []);

  const revokeAllPreviews = useCallback(() => {
    for (const url of previewUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    previewUrlsRef.current.clear();
  }, []);

  const trackPreviewUrl = useCallback((url: string) => {
    previewUrlsRef.current.add(url);
  }, []);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    studioLayoutRef.current = studioLayout;
  }, [studioLayout]);

  useEffect(() => {
    tripNarrativeRef.current = tripNarrative;
  }, [tripNarrative]);

  useEffect(() => {
    familyContextRef.current = familyContext;
  }, [familyContext]);

  useEffect(() => {
    generatedStoryRef.current = generatedStory;
  }, [generatedStory]);

  useEffect(() => {
    printArtModeRef.current = printArtMode;
  }, [printArtMode]);

  useEffect(() => {
    storyPhaseRef.current = storyPhase;
  }, [storyPhase]);

  useEffect(() => {
    let cancelled = false;
    void loadV2StudioBootstrap().then((bootstrap) => {
      if (cancelled) return;
      if (bootstrap) {
        setProjects(bootstrap.meta.projects);
        setActiveProjectId(bootstrap.meta.activeProjectId);
        activeProjectIdRef.current = bootstrap.meta.activeProjectId;
        applySessionToState(bootstrap.session, previewUrlsRef, {
          setPhotos,
          setSelectedId,
          setStudioLayout,
          setTripNarrative,
          setFamilyContext,
          setGeneratedStory,
          setPrintArtMode,
          setStoryPhase,
          photosRef,
        });
      }
      persistSkipRef.current = false;
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated || persistSkipRef.current || switchingRef.current) return;
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;

    const timer = window.setTimeout(() => {
      void saveV2ProjectSession(projectId, buildSnapshot()).then(() => {
        setProjects((prev) =>
          prev.map((project) =>
            project.id === projectId
              ? { ...project, photoCount: photos.length }
              : project,
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

  const replacePhotos = useCallback((next: V2PhotoEntry[]) => {
    photosRef.current = next;
    setPhotos(next);
  }, []);

  const mutatePhotos = useCallback(
    (recipe: (prev: V2PhotoEntry[]) => V2PhotoEntry[]) => {
      setPhotos((prev) => {
        const next = recipe(prev);
        photosRef.current = next;
        return next;
      });
    },
    [],
  );

  const updatePhoto = useCallback((id: string, patch: Partial<V2PhotoEntry>) => {
    setPhotos((prev) => {
      const next = prev.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      );
      photosRef.current = next;
      return next;
    });
  }, []);

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
    let nextPhotos: V2PhotoEntry[] = [];

    setPhotos((prev) => {
      nextPhotos = prev.filter((entry) => {
        if (idSet.has(entry.id)) {
          URL.revokeObjectURL(entry.previewUrl);
          previewUrlsRef.current.delete(entry.previewUrl);
          return false;
        }
        return true;
      });
      photosRef.current = nextPhotos;
      return nextPhotos;
    });

    setSelectedId((current) => {
      if (current && idSet.has(current)) {
        return nextPhotos[0]?.id ?? null;
      }
      return current;
    });
  }, []);

  const switchProject = useCallback(
    (projectId: string) => {
      if (projectId === activeProjectIdRef.current || switchingRef.current) {
        return;
      }

      switchingRef.current = true;
      persistSkipRef.current = true;

      void (async () => {
        const previousId = activeProjectIdRef.current;
        const previousPhotoCount = photosRef.current.length;
        if (previousId) {
          await saveV2ProjectSession(previousId, buildSnapshot());
        }

        revokeAllPreviews();
        setPendingUploads([]);

        const session = await loadV2ProjectSession(projectId);
        applySessionToState(session, previewUrlsRef, {
          setPhotos,
          setSelectedId,
          setStudioLayout,
          setTripNarrative,
          setFamilyContext,
          setGeneratedStory,
          setPrintArtMode,
          setStoryPhase,
          photosRef,
        });

        setActiveProjectId(projectId);
        activeProjectIdRef.current = projectId;

        setProjects((prev) => {
          const next = prev.map((project) =>
            project.id === previousId
              ? { ...project, photoCount: previousPhotoCount }
              : project,
          );
          void saveV2ProjectsMeta({
            activeProjectId: projectId,
            projects: next,
          });
          return next;
        });

        persistSkipRef.current = false;
        switchingRef.current = false;
      })();
    },
    [buildSnapshot, revokeAllPreviews],
  );

  const createProject = useCallback(() => {
    if (switchingRef.current) return;

    switchingRef.current = true;
    persistSkipRef.current = true;

    void (async () => {
      const previousId = activeProjectIdRef.current;
      const previousPhotoCount = photosRef.current.length;
      if (previousId) {
        await saveV2ProjectSession(previousId, buildSnapshot());
      }

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
            project.id === previousId
              ? { ...project, photoCount: previousPhotoCount }
              : project,
          ),
          newProject,
        ];
        void saveV2ProjectsMeta({
          activeProjectId: newProjectId,
          projects: nextProjects,
        });
        return nextProjects;
      });

      await saveV2ProjectSession(newProjectId, empty);

      revokeAllPreviews();
      setPendingUploads([]);
      applySessionToState(empty, previewUrlsRef, {
        setPhotos,
        setSelectedId,
        setStudioLayout,
        setTripNarrative,
        setFamilyContext,
        setGeneratedStory,
        setPrintArtMode,
        setStoryPhase,
        photosRef,
      });
      setActiveProjectId(newProjectId);
      activeProjectIdRef.current = newProjectId;

      persistSkipRef.current = false;
      switchingRef.current = false;
    })();
  }, [buildSnapshot, revokeAllPreviews]);

  const renameActiveProject = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || !activeProjectIdRef.current) return;

      setProjects((prev) => {
        const next = prev.map((project) =>
          project.id === activeProjectIdRef.current
            ? { ...project, name: trimmed, updatedAt: new Date().toISOString() }
            : project,
        );
        void saveV2ProjectsMeta({
          activeProjectId: activeProjectIdRef.current!,
          projects: next,
        });
        return next;
      });
    },
    [],
  );

  const clearAllPhotos = useCallback(() => {
    revokeAllPreviews();
    photosRef.current = [];
    setPhotos([]);
    setPendingUploads([]);
    setSelectedId(null);
    const projectId = activeProjectIdRef.current;
    if (projectId) {
      void saveV2ProjectSession(projectId, {
        ...buildSnapshot(),
        photos: [],
        selectedId: null,
      });
      setProjects((prev) =>
        prev.map((project) =>
          project.id === projectId ? { ...project, photoCount: 0 } : project,
        ),
      );
    }
  }, [buildSnapshot, revokeAllPreviews]);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );

  const value = useMemo(
    () => ({
      hydrated,
      projects,
      activeProjectId,
      activeProject,
      createProject,
      switchProject,
      renameActiveProject,
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
      projects,
      activeProjectId,
      activeProject,
      createProject,
      switchProject,
      renameActiveProject,
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

  return (
    <V2StudioContext.Provider value={value}>{children}</V2StudioContext.Provider>
  );
}

export function useV2Studio() {
  const ctx = useContext(V2StudioContext);
  if (!ctx) {
    throw new Error("useV2Studio must be used within V2StudioProvider");
  }
  return ctx;
}
