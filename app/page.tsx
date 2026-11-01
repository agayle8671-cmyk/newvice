import { Suspense } from "react";
import HomeClient from "@/components/HomeClient";

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-surface-dark flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-vice-pink border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <h1 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-wider mb-2">
          <span className="text-vice-pink">LEONIDA</span>
          <span className="text-vice-cyan">VICE</span>
        </h1>
        <p className="text-xs text-vice-cyan/40 font-[family-name:var(--font-chat)]">
          Starting the projector...
        </p>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <HomeClient />
    </Suspense>
  );
}
