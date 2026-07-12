import { apiFetch } from "./api";

export type Profile = {
  id: string;
  email: string;
  createdAt: string;
  documentCount: number;
  questionCount: number;
  hasPassword: boolean;
  hasGoogle: boolean;
  emailConfirmedAt: string | null;
};

export const profileApi = {
  me: () => apiFetch<Profile>("/api/auth/me/"),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch<void>("/api/auth/me/password", {
      method: "PUT",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  deleteAccount: (password: string | null) =>
    apiFetch<void>("/api/auth/me/", {
      method: "DELETE",
      // Backend accepts null password for Google-only accounts; JSON.stringify(null) is a valid body.
      body: JSON.stringify({ password }),
    }),
  sendConfirmation: () =>
    apiFetch<void>("/api/auth/me/send-confirmation", { method: "POST" }),
};
