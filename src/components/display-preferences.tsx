"use client";

import { CaseUpper } from "lucide-react";
import { useEffect, useState } from "react";

const storageKey = "hien-xa-text-size";

export function DisplayPreferences() {
  const [largeText, setLargeText] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey) === "large";
    setLargeText(stored);
    document.documentElement.dataset.textSize = stored ? "large" : "normal";
  }, []);

  function toggleTextSize() {
    const nextValue = !largeText;
    setLargeText(nextValue);
    document.documentElement.dataset.textSize = nextValue ? "large" : "normal";
    window.localStorage.setItem(storageKey, nextValue ? "large" : "normal");
  }

  return (
    <section className="display-preferences" aria-labelledby="text-size-title">
      <div>
        <strong id="text-size-title">Cỡ chữ</strong>
        <span>{largeText ? "Đang dùng chữ lớn" : "Đang dùng chữ tiêu chuẩn"}</span>
      </div>
      <button
        aria-pressed={largeText}
        className="readability-toggle"
        onClick={toggleTextSize}
        type="button"
      >
        <CaseUpper aria-hidden="true" />
        {largeText ? "Chữ thường" : "Chữ lớn"}
      </button>
    </section>
  );
}
