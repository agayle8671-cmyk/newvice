"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
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
    <AnimatePresence>
      {showAuthModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={handleClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md glass-panel rounded-xl overflow-hidden border border-vice-pink/40"
            style={{
              boxShadow:
                "0 0 40px rgba(255,0,127,0.3), 0 0 80px rgba(255,0,127,0.1)",
            }}
          >
            {/* CRT overlay */}
            <div className="crt-overlay rounded-xl" />

            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute top-3 right-3 z-20 text-vice-cyan/50 hover:text-vice-pink transition-colors"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M5 5L15 15M15 5L5 15" />
              </svg>
            </button>

            {/* Header */}
            <div className="relative z-10 text-center pt-6 pb-4 px-6">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-wider">
                <span className="neon-text-pink text-vice-pink">PARK</span>{" "}
                <span className="neon-text-cyan text-vice-cyan">YOUR RIDE</span>
              </h2>
              <p className="text-vice-cyan/40 text-xs font-[family-name:var(--font-chat)] mt-1">
                Join the drive-in community
              </p>
            </div>

            {/* Tabs */}
            <div className="relative z-10 flex mx-6 border border-vice-cyan/15 rounded-lg overflow-hidden">
              <button
                onClick={() => {
                  setTab("signin");
                  setError(null);
                  setSuccess(null);
                }}
                className={`flex-1 py-2 text-xs font-[family-name:var(--font-display)] tracking-wider transition-all ${
                  tab === "signin"
                    ? "bg-vice-pink/20 text-vice-pink border-r border-vice-cyan/15"
                    : "text-vice-cyan/40 hover:text-vice-cyan/60 border-r border-vice-cyan/15"
                }`}
              >
                SIGN IN
              </button>
              <button
                onClick={() => {
                  setTab("signup");
                  setError(null);
                  setSuccess(null);
                }}
                className={`flex-1 py-2 text-xs font-[family-name:var(--font-display)] tracking-wider transition-all ${
                  tab === "signup"
                    ? "bg-vice-pink/20 text-vice-pink"
                    : "text-vice-cyan/40 hover:text-vice-cyan/60"
                }`}
              >
                SIGN UP
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="relative z-10 p-6 space-y-4">
              {tab === "signup" && (
                <div>
                  <label className="block text-[10px] font-[family-name:var(--font-display)] text-vice-cyan/50 tracking-wider mb-1">
                    USERNAME
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="YourDriverName"
                    maxLength={20}
                    minLength={3}
                    autoComplete="username"
                    className="w-full bg-surface-input border border-vice-cyan/20 rounded-lg px-3 py-2.5 text-sm font-[family-name:var(--font-chat)] text-gray-200 placeholder:text-vice-cyan/25 focus:outline-none focus:border-vice-pink/50 focus:shadow-[0_0_10px_rgba(255,0,127,0.2)] transition-all"
                  />
                </div>
              )}

              <div>
                <label className="block text-[10px] font-[family-name:var(--font-display)] text-vice-cyan/50 tracking-wider mb-1">
                  EMAIL
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="driver@leonidavice.com"
                  required
                  autoComplete="email"
                  className="w-full bg-surface-input border border-vice-cyan/20 rounded-lg px-3 py-2.5 text-sm font-[family-name:var(--font-chat)] text-gray-200 placeholder:text-vice-cyan/25 focus:outline-none focus:border-vice-pink/50 focus:shadow-[0_0_10px_rgba(255,0,127,0.2)] transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] font-[family-name:var(--font-display)] text-vice-cyan/50 tracking-wider mb-1">
                  PASSWORD
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  autoComplete={
                    tab === "signin" ? "current-password" : "new-password"
                  }
                  className="w-full bg-surface-input border border-vice-cyan/20 rounded-lg px-3 py-2.5 text-sm font-[family-name:var(--font-chat)] text-gray-200 placeholder:text-vice-cyan/25 focus:outline-none focus:border-vice-pink/50 focus:shadow-[0_0_10px_rgba(255,0,127,0.2)] transition-all"
                />
              </div>

              {/* Error */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs text-vice-orange font-[family-name:var(--font-chat)] bg-vice-orange/10 border border-vice-orange/20 rounded-lg px-3 py-2 text-center"
                >
                  {error}
                </motion.div>
              )}

              {/* Success */}
              {success && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs text-neon-green font-[family-name:var(--font-chat)] bg-neon-green/10 border border-neon-green/20 rounded-lg px-3 py-2 text-center"
                >
                  {success}
                </motion.div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-gradient-to-r from-vice-pink to-vice-magenta text-white text-sm font-[family-name:var(--font-display)] font-bold tracking-wider rounded-lg hover:shadow-[0_0_20px_rgba(255,0,127,0.5)] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting
                  ? "..."
                  : tab === "signin"
                  ? "START YOUR ENGINE"
                  : "JOIN THE DRIVE-IN"}
              </button>
            </form>

            {/* Footer */}
            <div className="relative z-10 text-center pb-5 px-6">
              <p className="text-[10px] text-vice-cyan/25 font-[family-name:var(--font-chat)]">
                By joining, you agree to keep discussions respectful.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
