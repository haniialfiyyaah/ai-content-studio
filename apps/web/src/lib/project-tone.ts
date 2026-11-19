export type ProjectTone = 0 | 1 | 2 | 3;

/** Stable tile tone per Project so lists don't reshuffle colours between renders or screens. */
export function projectTone(id: string): ProjectTone {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return (hash % 4) as ProjectTone;
}

export function projectInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "P";
}
