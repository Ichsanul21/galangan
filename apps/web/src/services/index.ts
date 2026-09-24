// Titik masuk lapisan service.
// Fase frontend: halaman memakai useStore() (adapter lokal di data/store.tsx).
// Fase backend: ganti pemakaian per halaman ke pickRepository() + isi VITE_API_URL,
// tanpa mengubah bentuk data maupun kontrak fungsi di bawah ini.

export { apiFetch, isBackendConfigured, ApiError, ApiNotConfigured, setJwt, getJwt, clearJwt } from "./http";
export { newId } from "./ids";
export { localRepository, remoteRepository, pickRepository } from "./repositories";
export { uploadFile, UploadNotConfigured } from "./upload";
export type { Repository, Snapshot } from "./repositories";
