/** Types for the admin Files page (/admin/files) and the file_events log (migration 0035). */

export type FileKind = "photo" | "sheet" | "thumbnail" | "cover" | "print_pdf" | "digital_pdf" | "other";

export type FileEventSource =
  | "browser"
  | "generated"
  | "edited"
  | "mirrored"
  | "copied"
  | "thumbnail"
  | "book_order"
  | "migration"
  | "photo_delete"
  | "album_delete"
  | "account_delete"
  | "replaced"
  | "cleanup"
  | "backfill"
  | "server";

/** Pending uploads are resolved against storage: there → success, missing after an hour → abandoned. */
export type FileEventOutcome = "pending" | "success" | "failed" | "abandoned";

export type FileStorageState = "in_use" | "orphaned" | "no_account";

export type FilePerson = { id: string; email: string | null; name: string | null; deleted: boolean };

export type FileEvent = {
  id: string;
  at: string;
  action: "upload" | "delete";
  kind: FileKind;
  source: FileEventSource;
  outcome: FileEventOutcome;
  ownerId: string | null;
  actorId: string | null;
  fileCount: number | null;
  photoCount: number | null;
  bytes: number | null;
  path: string | null;
  durationMs: number | null;
  error: string | null;
};

export type FileKindStorage = {
  kind: FileKind;
  objects: number;
  bytes: number;
  gbMonths: number;
  orphanedObjects: number;
  orphanedBytes: number;
  added30dBytes: number;
  added30dObjects: number;
  oldest: string | null;
};

export type FileEventTotals = {
  photosUploaded: number;
  photosUploadedBytes: number;
  sheetsSaved: number;
  sheetsSavedBytes: number;
  bookFiles: number;
  bookFilesBytes: number;
  thumbnails: number;
  uploadsSucceeded: number;
  uploadsFailed: number;
  uploadsAbandoned: number;
  uploadsPending: number;
  /** Browser uploads only: from the upload link being issued to the file being registered. */
  browserUploadAvgMs: number | null;
  browserUploadP95Ms: number | null;
  /** Server writes (generated sheets, PDFs, thumbnails): the storage write alone. */
  serverWriteAvgMs: number | null;
  deleteEvents: number;
  photosDeleted: number;
  filesDeleted: number;
  bytesFreed: number;
  deletesBySource: Array<{ source: FileEventSource; events: number; photos: number; files: number; bytes: number }>;
};

export type FilesReport = {
  /** False until migration 0035 is applied: storage totals still show, the log is empty. */
  tracking: boolean;
  periodDays: number | null;
  storage: {
    objects: number;
    bytes: number;
    byKind: FileKindStorage[];
    orphanedObjects: number;
    orphanedBytes: number;
    noAccountObjects: number;
    noAccountBytes: number;
    added30dBytes: number;
    usdPerGbMonth: number;
    includedGb: number;
    /** GB-months held since each file was saved, priced at the current rate. */
    lifetimeUsd: number;
  };
  totals: FileEventTotals;
  daily: Array<{ date: string; uploads: number; uploadBytes: number; deletes: number; deletedFiles: number; deleteBytes: number; failed: number }>;
  topOwners: Array<{ person: FilePerson; objects: number; bytes: number }>;
  largest: Array<{ path: string; kind: FileKind; owner: FilePerson | null; bytes: number; at: string }>;
  events: FileEvent[];
  people: Record<string, FilePerson>;
};
