import { Suspense } from "react";
import HomeClient from "@/components/HomeClient";

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-white text-black flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-[#e04040] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs uppercase tracking-widest font-bold text-black/70">
          Loading Leonida Vice Edition...
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
