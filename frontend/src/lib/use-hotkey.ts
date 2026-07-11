"use client";

import { useEffect } from "react";

type Options = {
  ctrl?: boolean;
  // Whether the hotkey fires when focus is inside a text field.
  // Defaults to true for Ctrl/Cmd combos (they're intentional), false otherwise.
  allowInInputs?: boolean;
};

/**
 * Bind a single keyboard shortcut to a handler for as long as the component is mounted.
 * Ctrl combos also match Cmd on macOS. Plain-key hotkeys are ignored while the user
 * is typing in an input/textarea/contenteditable.
 */
export function useHotkey(
  key: string,
  handler: () => void,
  options: Options = {},
) {
  const { ctrl = false, allowInInputs = ctrl } = options;

  useEffect(() => {
    // Ctrl combos match by physical key code so Ctrl+K works in non-Latin layouts (event.key
     // would give "Л" on Russian). Plain-key hotkeys still match by character.
    const ctrlLetterCode = ctrl && /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : null;

    function onKeyDown(event: KeyboardEvent) {
      const matches = ctrlLetterCode
        ? event.code === ctrlLetterCode
        : event.key.toLowerCase() === key.toLowerCase();
      if (!matches) return;

      if (ctrl && !(event.ctrlKey || event.metaKey)) return;
      if (!ctrl && (event.ctrlKey || event.metaKey || event.altKey)) return;

      if (!allowInInputs) {
        const target = event.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
        ) {
          return;
        }
      }

      event.preventDefault();
      handler();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key, handler, ctrl, allowInInputs]);
}
