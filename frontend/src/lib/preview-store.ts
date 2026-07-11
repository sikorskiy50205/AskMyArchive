import { create } from "zustand";

export type PreviewTarget = {
  documentId: string;
  fileName: string;
  page?: number | null;
};

type PreviewState = {
  target: PreviewTarget | null;
  open: (target: PreviewTarget) => void;
  close: () => void;
};

// Global slot for the preview modal — lets chat citations and the documents
// page trigger the same viewer without prop-drilling through the app tree.
export const usePreviewStore = create<PreviewState>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
}));
