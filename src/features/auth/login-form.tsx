"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(false);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setFields({});
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error);
        setFields(result.fields ?? {});
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung. Periksa koneksi Anda dan coba lagi.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="form-stack" aria-busy={pending}>
      <label htmlFor="email">
        Email admin
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="nama@perusahaan.co.id"
          required
          maxLength={254}
          aria-invalid={!!fields.email}
          aria-describedby={fields.email ? "email-error" : undefined}
        />
      </label>
      {fields.email && (
        <small id="email-error" className="field-error">
          {fields.email[0]}
        </small>
      )}
      <label htmlFor="password">
        Password
        <span className="password-input">
          <input
            id="password"
            name="password"
            type={visible ? "text" : "password"}
            autoComplete="current-password"
            required
            maxLength={128}
          />
          <button
            type="button"
            className="icon-button"
            onClick={() => setVisible(!visible)}
            aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </span>
      </label>
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      <button disabled={pending} className="button full" type="submit">
        {pending ? "Sedang masuk…" : "Masuk ke ruang kerja"}
        <ArrowRight size={17} />
      </button>
    </form>
  );
}
