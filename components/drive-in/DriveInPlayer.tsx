"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";

export interface DriveInPlayerHandle {
  loadVideo: (videoId: string) => void;
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
}

interface DriveInPlayerProps {
  videoId: string;
  onReady?: () => void;
  roomSlug?: string;
}

declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

const DriveInPlayer = forwardRef<DriveInPlayerHandle, DriveInPlayerProps>(
  function DriveInPlayer({ videoId, onReady, roomSlug }, ref) {
    const playerRef = useRef<YT.Player | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(true);
    const [isReady, setIsReady] = useState(false);
    const syncChannelRef = useRef<unknown>(null);

    // Expose imperative methods for video sync
    useImperativeHandle(ref, () => ({
      loadVideo: (newVideoId: string) => {
        playerRef.current?.loadVideoById(newVideoId);
      },
      seekTo: (seconds: number) => {
        playerRef.current?.seekTo(seconds, true);
      },
      getCurrentTime: () => {
        return playerRef.current?.getCurrentTime() ?? 0;
      },
    }));

    useEffect(() => {
      // Load YouTube IFrame API
      if (!window.YT) {
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScript = document.getElementsByTagName("script")[0];
        firstScript.parentNode?.insertBefore(tag, firstScript);
      }

      const initPlayer = () => {
        if (!containerRef.current) return;
        playerRef.current = new window.YT.Player("drive-in-iframe", {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 1,
            controls: 0,
            modestbranding: 1,
            rel: 0,
            showinfo: 0,
            iv_load_policy: 3,
            fs: 0,
            disablekb: 1,
            playsinline: 1,
            loop: 1,
            playlist: videoId,
          },
          events: {
            onReady: (event: YT.PlayerEvent) => {
              event.target.mute();
              setIsReady(true);
              setIsMuted(true);
              onReady?.();
            },
            onStateChange: (event: YT.OnStateChangeEvent) => {
              setIsPlaying(event.data === YT.PlayerState.PLAYING);
            },
          },
        });
      };

      if (window.YT && window.YT.Player) {
        initPlayer();
      } else {
        window.onYouTubeIframeAPIReady = initPlayer;
      }

      return () => {
        playerRef.current?.destroy();
      };
    }, [videoId, onReady]);

    // Video sync subscription
    useEffect(() => {
      if (!roomSlug) return;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseKey) return;

      let channelToClean: { unsubscribe?: () => void } | null = null;

      async function connectSync() {
        const { subscribeToVideoSync } = await import(
          "@/lib/realtime/video-sync"
        );
        const ch = await subscribeToVideoSync(roomSlug!, {
          onVideoChange: (newVideoId) => {
            playerRef.current?.loadVideoById(newVideoId);
          },
          onSeek: (seekTo) => {
            const currentTime = playerRef.current?.getCurrentTime() ?? 0;
            // Only seek if drift > 2 seconds
            if (Math.abs(currentTime - seekTo) > 2) {
              playerRef.current?.seekTo(seekTo, true);
            }
          },
        });
        channelToClean = ch as { unsubscribe?: () => void } | null;
        syncChannelRef.current = ch;
      }

      connectSync();

      return () => {
        if (channelToClean && syncChannelRef.current) {
          import("@/lib/supabase/client").then(({ createClient }) => {
            const supabase = createClient();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabase.removeChannel(syncChannelRef.current as any);
          });
        }
      };
    }, [roomSlug]);

    const togglePlay = useCallback(() => {
      if (!playerRef.current) return;
      if (isPlaying) {
        playerRef.current.pauseVideo();
      } else {
        playerRef.current.playVideo();
      }
    }, [isPlaying]);

    const toggleMute = useCallback(() => {
      if (!playerRef.current) return;
      if (isMuted) {
        playerRef.current.unMute();
        setIsMuted(false);
      } else {
        playerRef.current.mute();
        setIsMuted(true);
      }
    }, [isMuted]);

    return (
      <div className="relative w-full h-full group" ref={containerRef}>
        {/* YouTube Player */}
        <div id="drive-in-iframe" className="absolute inset-0 w-full h-full" />

        {/* Click-blocking overlay to prevent YouTube UI */}
        <div className="absolute inset-0 bg-transparent z-10" />

        {/* Loading State */}
        {!isReady && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-vice-pink border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-vice-cyan/50 text-xs font-[family-name:var(--font-chat)]">
                TUNING IN...
              </p>
            </div>
          </div>
        )}

        {/* Custom Controls */}
        <div className="absolute bottom-0 left-0 right-0 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="bg-gradient-to-t from-black/80 to-transparent p-3 flex items-center gap-3">
            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className="text-white hover:text-vice-pink transition-colors"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <rect x="4" y="3" width="4" height="14" rx="1" />
                  <rect x="12" y="3" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M5 3.5L16 10L5 16.5V3.5Z" />
                </svg>
              )}
            </button>

            {/* Mute/Unmute */}
            <button
              onClick={toggleMute}
              className="text-white hover:text-vice-cyan transition-colors"
              aria-label={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              )}
            </button>

            {/* Now Playing Label */}
            <span className="flex-1 text-right text-[10px] text-vice-cyan/50 font-[family-name:var(--font-chat)] truncate">
              NOW SHOWING ON THE BIG SCREEN
            </span>
          </div>
        </div>
      </div>
    );
  }
);

export default DriveInPlayer;
