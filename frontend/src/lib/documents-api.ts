import { API_URL, ApiError, apiFetch } from "./api";
import { useAuthStore } from "./auth-store";

export type DocumentStatus = "Uploaded" | "Indexing" | "Indexed" | "Failed";

export type DocumentDto = {
  id: string;
  fileName: string;
  sizeBytes: number;
  status: DocumentStatus;
  error: string | null;
  pageCount: number;
  uploadedAt: string;
};

// Mirror the server-side restrictions so obviously bad files fail fast.
export const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"];
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export type Storage = { usedBytes: number; limitBytes: number };

export const documentsApi = {
  list: () => apiFetch<DocumentDto[]>("/api/documents"),
  delete: (id: string) =>
    apiFetch<void>(`/api/documents/${id}`, { method: "DELETE" }),
  deleteBatch: (ids: string[]) =>
    apiFetch<{ deleted: number }>("/api/documents/delete-batch", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),
  storage: () => apiFetch<Storage>("/api/documents/storage"),
};

export function hasPendingDocuments(docs: DocumentDto[] | undefined): boolean {
  return !!docs?.some(
    (d) => d.status === "Uploaded" || d.status === "Indexing",
  );
}

// fetch() has no upload progress events, so uploads go through XMLHttpRequest.
export function uploadDocument(
  file: File,
  onProgress: (percent: number) => void,
): Promise<DocumentDto> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/api/documents`);
    const token = useAuthStore.getState().token;
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        let message = xhr.statusText;
        try {
          const data = JSON.parse(xhr.responseText);
          if (typeof data?.error === "string") message = data.error;
        } catch {
          // Not JSON; keep the status text.
        }
        reject(new ApiError(xhr.status, message));
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));

    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}
