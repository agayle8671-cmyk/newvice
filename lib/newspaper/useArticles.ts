"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  getArticlesVersion,
  refreshLiveArticles,
  subscribeArticles,
} from "./content";

const getServerVersion = () => 0;

/**
 * Subscribes a client component to live admin-published article updates
 * without causing SSR hydration mismatches.
 */
export function useArticlesVersion(): number {
  const version = useSyncExternalStore(
    subscribeArticles,
    getArticlesVersion,
    getServerVersion
  );

  useEffect(() => {
    refreshLiveArticles(false);
  }, []);

  return version;
}
