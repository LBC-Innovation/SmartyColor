const HEIC_TYPES = new Set(["image/heic", "image/heif"]);

export function isHeicFile(file: File) {
  const type = file.type.toLowerCase();
  if (HEIC_TYPES.has(type)) return true;
  const name = file.name.toLowerCase();
  return name.endsWith(".heic") || name.endsWith(".heif");
}

export function isHeicDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);/i);
  if (!match) return false;
  const type = match[1].toLowerCase();
  return HEIC_TYPES.has(type);
}

export function isAllowedPhotoFile(file: File) {
  if (file.type.startsWith("image/")) return true;
  if (isHeicFile(file)) return true;
  const name = file.name.toLowerCase();
  return /\.(jpe?g|png|webp|heic|heif)$/.test(name);
}
