import { useState } from "react";
import { useAppStore } from "../stores/app-store";
import { supabase } from "../lib/supabase";

function getRedirectTo() {
  return "renderizador://sign-in";
}

export function AuthPage() {
  const setScreen = useAppStore((state) => state.setScreen);
  const stationConfig = useAppStore((state) => state.stationConfig);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function signIn() {
    if (!supabase) {
      setMessage("El cliente Supabase no está configurado.");
      return;
    }

    setBusy(true);
    setMessage(null);
    const redirectTo = getRedirectTo();

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: { redirectTo, skipBrowserRedirect: true, scopes: "email profile" }
    });

    if (error || !data?.url) {
      setBusy(false);
      setMessage(error?.message ?? "Supabase no devolvió una URL de autenticación.");
      return;
    }

    const authResult = await window.workstation.startMicrosoftAuth({ authUrl: data.url, redirectTo });

    if (!authResult.ok || !authResult.callbackUrl) {
      setBusy(false);
      setMessage(authResult.message ?? "El inicio de sesión fue cancelado.");
      return;
    }

    const callbackUrl = new URL(authResult.callbackUrl);
    const errorParam = callbackUrl.searchParams.get("error");

    if (errorParam) {
      setBusy(false);
      setMessage(callbackUrl.searchParams.get("error_description") ?? errorParam);
      return;
    }

    const code = callbackUrl.searchParams.get("code");

    if (code) {
      // PKCE flow: exchange code for session
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      setBusy(false);
      if (exchangeError) {
        setMessage(exchangeError.message);
        return;
      }
      window.location.reload();
      return;
    }

    // Implicit flow fallback: tokens in hash fragment
    const hashParams = new URLSearchParams(callbackUrl.hash.replace(/^#/, ""));
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");

    if (accessToken && refreshToken) {
      const { error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      setBusy(false);
      if (sessionError) {
        setMessage(sessionError.message);
        return;
      }
      window.location.reload();
      return;
    }

    setBusy(false);
    setMessage(`URL de callback inesperada: ${authResult.callbackUrl}`);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050816] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(117,163,255,0.14),transparent_28%),linear-gradient(180deg,#050816_0%,#060b1c_55%,#0a1020_100%)]" />

      {/* top bar */}
      <div className="relative flex items-center justify-between px-8 py-5">
        <p className="text-[10px] uppercase tracking-[0.4em] text-sky-200/60">Renderizador</p>
        {stationConfig?.mode && (
          <button
            className="rounded-xl border border-white/10 bg-white/4 px-4 py-2 text-xs text-slate-400 transition hover:text-white"
            onClick={() => setScreen("mode-select")}
          >
            ← Cambiar modo
          </button>
        )}
      </div>

      <div className="relative flex min-h-[calc(100vh-80px)] flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-4xl font-semibold tracking-[-0.03em] text-white">Iniciar sesión</h1>
          <p className="mt-3 text-sm text-slate-400">Usa tu cuenta Microsoft para acceder.</p>

          <button
            className="mt-10 w-full rounded-2xl bg-sky-400 px-6 py-5 text-base font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy}
            onClick={() => void signIn()}
          >
            {busy ? "Abriendo Microsoft..." : "Continuar con Microsoft"}
          </button>

          {message && (
            <p className="mt-5 rounded-2xl border border-white/8 bg-[#071024] px-4 py-3 text-sm text-slate-300">
              {message}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
