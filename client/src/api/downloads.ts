import { api } from "./client";

export interface DownloadFile {
  name: string;
  ext: string;
  sizeBytes: number;
  coverFile: string | null;
}

export const downloadsApi = {
  listFiles: () => api.get<DownloadFile[]>("/downloads"),
  fileUrl:   (filename: string) => `/api/downloads/file/${encodeURIComponent(filename)}`,
};
