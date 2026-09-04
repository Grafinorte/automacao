import { api } from "./client";

export interface DownloadFile {
  name: string;
  ext: string;
  sizeBytes: number;
  coverFile: string | null;
  group: string | null;
  relativePath: string;
}

export const downloadsApi = {
  listFiles: () => api.get<DownloadFile[]>("/downloads"),
  fileUrl:   (relativePath: string) => `/api/downloads/file/${relativePath.split(/[\\/]/).map(encodeURIComponent).join("/")}`,
};
