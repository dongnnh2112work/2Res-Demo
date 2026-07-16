"use client";

import { FormEvent, useState } from "react";
import { MAX_WISH_LENGTH } from "@/lib/types";

type Status = "idle" | "submitting" | "done" | "error";

export default function WishForm() {
  const [message, setMessage] = useState("");
  const [author, setAuthor] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || status === "submitting") return;

    setStatus("submitting");
    setError(null);

    try {
      const res = await fetch("/api/wishes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed.slice(0, MAX_WISH_LENGTH),
          author: author.trim() || null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Không gửi được. Thử lại nhé.",
        );
      }

      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Không gửi được. Thử lại nhé.");
    }
  }

  if (status === "done") {
    return (
      <div className="wish-thanks">
        <p className="wish-thanks-label">Đã gửi</p>
        <h2 className="wish-thanks-title">Cảm ơn bạn</h2>
        <p className="wish-thanks-body">
          Lời chúc của bạn đang bay lên màn hình chính.
        </p>
      </div>
    );
  }

  return (
    <form className="wish-form" onSubmit={onSubmit}>
      <label className="wish-field">
        <span>Lời chúc của bạn</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, MAX_WISH_LENGTH))}
          rows={4}
          required
          maxLength={MAX_WISH_LENGTH}
          placeholder="Viết lời chúc gửi gắm đến sự kiện…"
          disabled={status === "submitting"}
        />
        <em>
          {message.length}/{MAX_WISH_LENGTH}
        </em>
      </label>

      <label className="wish-field">
        <span>Tên (tuỳ chọn)</span>
        <input
          type="text"
          value={author}
          onChange={(e) => setAuthor(e.target.value.slice(0, 40))}
          maxLength={40}
          placeholder="Ẩn danh nếu để trống"
          disabled={status === "submitting"}
        />
      </label>

      {error && <p className="wish-error">{error}</p>}

      <button type="submit" className="wish-submit" disabled={!message.trim() || status === "submitting"}>
        {status === "submitting" ? "Đang gửi…" : "Gửi lời chúc"}
      </button>
    </form>
  );
}
