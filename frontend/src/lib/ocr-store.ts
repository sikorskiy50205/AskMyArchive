import { create } from "zustand";

type OcrTarget = { documentId: string; fileName: string };

type OcrState = {
  target: OcrTarget | null;
  open: (t: OcrTarget) => void;
  close: () => void;
};

export const useOcrStore = create<OcrState>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
}));
