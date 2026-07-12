"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useLocale } from "next-intl";
import { useTheme } from "next-themes";

// Minimal ambient types for Google Identity Services — we only touch a slice of the API.
type GsiButtonConfig = {
  type?: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "rectangular" | "pill" | "circle" | "square";
  logo_alignment?: "left" | "center";
  width?: number;
  locale?: string;
};

type GsiCredentialResponse = { credential: string };

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: GsiCredentialResponse) => void;
            auto_select?: boolean;
            use_fedcm_for_prompt?: boolean;
          }) => void;
          renderButton: (parent: HTMLElement, options: GsiButtonConfig) => void;
        };
      };
    };
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

type Props = {
  onCredential: (idToken: string) => void;
  text?: GsiButtonConfig["text"];
  disabled?: boolean;
};

export function GoogleSignInButton({ onCredential, text = "continue_with", disabled }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const { resolvedTheme } = useTheme();
  const locale = useLocale();

  useEffect(() => {
    if (!scriptReady || !containerRef.current || !CLIENT_ID) return;
    const gsi = window.google?.accounts.id;
    if (!gsi) return;

    gsi.initialize({
      client_id: CLIENT_ID,
      callback: (response) => {
        if (response.credential) onCredential(response.credential);
      },
    });
    // renderButton replaces the container's children each call — safe to re-run on theme/locale changes.
    containerRef.current.innerHTML = "";
    gsi.renderButton(containerRef.current, {
      type: "standard",
      theme: resolvedTheme === "dark" ? "filled_black" : "outline",
      size: "large",
      text,
      shape: "rectangular",
      logo_alignment: "left",
      width: containerRef.current.offsetWidth || 320,
      locale,
    });
  }, [scriptReady, resolvedTheme, locale, text, onCredential]);

  if (!CLIENT_ID) {
    // Silently render nothing when the env var isn't set — dev without a client id shouldn't crash.
    return null;
  }

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
      <div
        ref={containerRef}
        className="w-full [color-scheme:normal]"
        aria-disabled={disabled}
        style={disabled ? { pointerEvents: "none", opacity: 0.6 } : undefined}
      />
    </>
  );
}
