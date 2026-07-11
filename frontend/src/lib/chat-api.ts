import { API_URL, ApiError, apiFetch } from "./api";
import { useAuthStore } from "./auth-store";

export type Conversation = {
  id: string;
  title: string;
  createdAt: string;
};

export type ChatMessageDto = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type Source = {
  documentId: string;
  fileName: string;
  page: number | null;
};

export const chatApi = {
  conversations: () => apiFetch<Conversation[]>("/api/conversations"),
  messages: (id: string) =>
    apiFetch<ChatMessageDto[]>(`/api/conversations/${id}/messages`),
  deleteConversation: (id: string) =>
    apiFetch<void>(`/api/conversations/${id}`, { method: "DELETE" }),
  renameConversation: (id: string, title: string) =>
    apiFetch<void>(`/api/conversations/${id}`, {
      method: "PUT",
      body: JSON.stringify({ title }),
    }),
  deleteLastExchange: (id: string) =>
    apiFetch<void>(`/api/conversations/${id}/messages/last`, {
      method: "DELETE",
    }),
};

export type AskHandlers = {
  onMeta: (meta: { conversationId: string; sources: Source[] }) => void;
  onToken: (text: string) => void;
  onError: (message: string) => void;
};

// POST + SSE: EventSource only supports GET, so we read the stream by hand.
export async function askStream(
  question: string,
  conversationId: string | null,
  handlers: AskHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const token = useAuthStore.getState().token;
  const response = await fetch(`${API_URL}/api/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ question, conversationId }),
    signal,
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const data = await response.json();
      if (typeof data?.error === "string") message = data.error;
    } catch {
      // Not JSON; keep the status text.
    }
    throw new ApiError(response.status, message);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
    let separator;
    while ((separator = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);

      let event = "message";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7).trim();
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (!data) continue;

      const payload = JSON.parse(data);
      if (event === "meta") handlers.onMeta(payload);
      else if (event === "token") handlers.onToken(payload.text);
      else if (event === "error") handlers.onError(payload.error);
      else if (event === "done") return;
    }
  }
}
