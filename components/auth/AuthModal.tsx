"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth/context";

export default function AuthModal() {
  const { showAuthModal, setShowAuthModal, signIn, signUp } = useAuth();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setUsername("");
    setError(null);
    setSuccess(null);
  };

  const handleClose = () => {
    setShowAuthModal(false);
    resetForm();
    setTab("signin");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      if (tab === "signin") {
        const result = await signIn(email, password);
        if (result.error) {
          setError(result.error);
        }
      } else {
        if (!username.trim()) {
          setError("Username is required");
          setIsSubmitting(false);
          return;
        }
        if (username.length < 3 || username.length > 20) {
          setError("Username must be 3-20 characters");
          setIsSubmitting(false);
          return;
        }
        const result = await signUp(email, password, username.trim());
        if (result.error) {
          setError(result.error);
        } else {
          setSuccess("Check your email for a confirmation link!");
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!showAuthModal || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60"
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-white text-black border border-black border-b-[4px] shadow-2xl overflow-hidden"
      >
        {/* Top Crimson Editorial Bar */}
        <div className="h-1.5 bg-[#e04040]" />

        {/* Close button */}
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-black/60 hover:text-[#e04040] transition-colors cursor-pointer text-lg font-bold"
        >
          ✕
        </button>

        {/* Header */}
        <div className="pt-6 pb-4 px-6 border-b border-black">
          <span
            className="inline-block bg-[#e04040] text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest mb-1.5"
            style={{ fontFamily: "'Work Sans', sans-serif" }}
          >
            CITIZEN PRESS CREDENTIALS
          </span>
          <h2
            className="text-[28px] font-extrabold uppercase leading-none tracking-wide"
            style={{ fontFamily: "'Big Shoulders Text', sans-serif" }}
          >
            LEONIDA VICE ACCOUNT
          </h2>
          <p
            className="text-xs text-black/70 mt-1"
            style={{ fontFamily: "'Roboto Slab', serif" }}
          >
            Sign in to post verified dispatches in the Live Citizen Wire.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-black text-xs font-bold uppercase tracking-wider">
          <button
            type="button"
            onClick={() => {
              setTab("signin");
              setError(null);
              setSuccess(null);
            }}
            style={{ fontFamily: "'Work Sans', sans-serif" }}
            className={`flex-1 py-2.5 border-r border-black transition-colors cursor-pointer ${
              tab === "signin"
                ? "bg-black text-white"
                : "bg-[#f4f4f4] text-black hover:bg-[#eaeaea]"
            }`}
          >
            SIGN IN
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("signup");
              setError(null);
              setSuccess(null);
            }}
            style={{ fontFamily: "'Work Sans', sans-serif" }}
            className={`flex-1 py-2.5 transition-colors cursor-pointer ${
              tab === "signup"
                ? "bg-black text-white"
                : "bg-[#f4f4f4] text-black hover:bg-[#eaeaea]"
            }`}
          >
            CREATE ACCOUNT
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {tab === "signup" && (
            <div>
              <label
                className="block text-[11px] font-bold uppercase tracking-wider text-black mb-1"
                style={{ fontFamily: "'Work Sans', sans-serif" }}
              >
                CITIZEN HANDLE
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ViceReporter305"
                maxLength={20}
                minLength={3}
                autoComplete="username"
                className="w-full bg-white border border-black px-3 py-2 text-sm text-black placeholder:text-black/40 focus:outline-none focus:border-[#e04040]"
                style={{ fontFamily: "'Work Sans', sans-serif" }}
              />
            </div>
          )}

          <div>
            <label
              className="block text-[11px] font-bold uppercase tracking-wider text-black mb-1"
              style={{ fontFamily: "'Work Sans', sans-serif" }}
            >
              EMAIL ADDRESS
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="citizen@leonidavice.com"
              required
              autoComplete="email"
              className="w-full bg-white border border-black px-3 py-2 text-sm text-black placeholder:text-black/40 focus:outline-none focus:border-[#e04040]"
              style={{ fontFamily: "'Work Sans', sans-serif" }}
            />
          </div>

          <div>
            <label
              className="block text-[11px] font-bold uppercase tracking-wider text-black mb-1"
              style={{ fontFamily: "'Work Sans', sans-serif" }}
            >
              PASSWORD
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              autoComplete={tab === "signin" ? "current-password" : "new-password"}
              className="w-full bg-white border border-black px-3 py-2 text-sm text-black placeholder:text-black/40 focus:outline-none focus:border-[#e04040]"
              style={{ fontFamily: "'Work Sans', sans-serif" }}
            />
          </div>

          {error && (
            <div
              className="text-xs text-[#e04040] font-semibold bg-[#e04040]/10 border border-[#e04040] px-3 py-2"
              style={{ fontFamily: "'Work Sans', sans-serif" }}
            >
              {error}
            </div>
          )}

          {success && (
            <div
              className="text-xs text-emerald-800 font-semibold bg-emerald-50 border border-emerald-700 px-3 py-2"
              style={{ fontFamily: "'Work Sans', sans-serif" }}
            >
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            style={{ fontFamily: "'Work Sans', sans-serif" }}
            className="w-full py-3 bg-[#e04040] hover:bg-black text-white text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting
              ? "AUTHENTICATING..."
              : tab === "signin"
              ? "SIGN IN TO LEONIDA VICE"
              : "REGISTER CITIZEN ACCOUNT"}
          </button>
        </form>

        {/* Footer */}
        <div className="bg-[#f4f4f4] border-t border-black/20 text-center py-3 px-6">
          <p
            className="text-[11px] text-black/70"
            style={{ fontFamily: "'Roboto Slab', serif" }}
          >
            By signing in, you agree to keep Live Citizen Wire dispatches civil.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
