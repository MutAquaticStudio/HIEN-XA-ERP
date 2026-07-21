"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyInviteLink({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  }

  return (
    <div className="invite-link-control">
      <input aria-label="Liên kết lời mời" readOnly value={value} />
      <button className="button button-primary" type="button" onClick={copyLink}>
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? "Đã sao chép" : "Sao chép"}
      </button>
    </div>
  );
}
