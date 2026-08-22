export const ORIENTATIONS = ["portrait", "landscape"] as const;
export const PAPERS = ["letter", "a4"] as const;
export const DETAILS = ["simple", "medium", "busy"] as const;

export type Orientation = (typeof ORIENTATIONS)[number];
export type PaperSize = (typeof PAPERS)[number];
export type DetailLevel = (typeof DETAILS)[number];

export type PrintPrefs = {
  orientation: Orientation;
  paper: PaperSize;
  detail: DetailLevel;
  showTitle: boolean;
  funBorder: boolean;
  nameLine: boolean;
};

export const defaultPrintPrefs: PrintPrefs = {
  orientation: "portrait",
  paper: "letter",
  detail: "simple",
  showTitle: false,
  funBorder: false,
  nameLine: false,
};

export function describePrintPrefs(prefs: PrintPrefs) {
  const bits = [
    prefs.orientation,
    prefs.paper === "letter" ? "US Letter" : "A4",
    `${prefs.detail} details`,
  ];
  if (prefs.showTitle) bits.push("title on the page");
  if (prefs.funBorder) bits.push("fun border");
  if (prefs.nameLine) bits.push("a line for a name");
  return bits.join(", ");
}

/** Explicit on/off instructions for AI prompts (never invent toggles). */
export function describePrintPrefsForAI(prefs: PrintPrefs) {
  return [
    `Orientation: ${prefs.orientation}`,
    `Paper: ${prefs.paper === "letter" ? "US Letter" : "A4"}`,
    `Detail level: ${prefs.detail}`,
    prefs.showTitle
      ? "Title: INCLUDE a short title in black outline letters near the top"
      : "Title: DO NOT draw any title, headline, or caption text on the page",
    prefs.funBorder
      ? "Border: INCLUDE a fun decorative border / frame around the page"
      : "Border: DO NOT draw any decorative border, frame, double outline, or page edge ornament",
    prefs.nameLine
      ? "Name line: INCLUDE a blank line for the kid's name near the bottom"
      : "Name line: DO NOT draw a name line, signature blank, or 'Name: ___' area",
  ].join("\n");
}
