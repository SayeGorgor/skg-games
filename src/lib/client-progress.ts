export type LocalProgress = { alibiSolved: boolean; stackSolved: boolean };
const KEY = "skg-progress-v1";

export function getLocalProgress(): LocalProgress {
  if (typeof window === "undefined")
    return { alibiSolved: false, stackSolved: false };
  try {
    return {
      alibiSolved: false,
      stackSolved: false,
      ...JSON.parse(localStorage.getItem(KEY) ?? "{}"),
    };
  } catch {
    return { alibiSolved: false, stackSolved: false };
  }
}

export function markLocalSolved(game: "alibi" | "stack") {
  const current = getLocalProgress();
  const next = {
    ...current,
    [game === "alibi" ? "alibiSolved" : "stackSolved"]: true,
  };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function getAnonymousId() {
  const key = "skg-anonymous-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}
