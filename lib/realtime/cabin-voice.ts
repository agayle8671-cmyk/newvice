"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getDriveInAudioGraph } from "@/lib/audio/DriveInAudioGraph";

// ─── NewVice V3 4-Seat Car Crew Cabin (WebRTC Mesh + -12 dB Voice Ducking) ───
// Up to 4 friends join a private car cabin inside the public drive-in using a
// 6-character invite code (e.g. "VICE86"):
//   • "Roll Up the Windows" routes movie audio through warm 950 Hz FM Cabin DSP
//   • WebRTC peer-to-peer audio mesh signaled via Supabase Realtime broadcast
//   • Real-time Voice Activity Detection (VAD) automatically ducks movie audio
//     by -12 dB whenever any passenger in the 4-seat cabin speaks.

export interface CabinSeatOccupant {
  userId: string;
  username: string;
  badgeColor: string;
  seatPosition: 0 | 1 | 2 | 3; // 0=Driver, 1=Shotgun, 2=Rear-Left, 3=Rear-Right
  micEnabled: boolean;
  isSpeaking: boolean;
}

export interface CabinQuickNote {
  id: string;
  username: string;
  badgeColor: string;
  text: string;
  createdAt: string;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export function generateCabinCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

interface UseCarCabinVoiceOptions {
  userId: string;
  username: string;
  badgeColor: string;
}

export function useCarCabinVoice({
  userId,
  username,
  badgeColor,
}: UseCarCabinVoiceOptions) {
  const [cabinCode, setCabinCode] = useState<string | null>(null);
  const [windowsUpFmMode, setWindowsUpFmMode] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);
  const [passengers, setPassengers] = useState<CabinSeatOccupant[]>([]);
  const [cabinNotes, setCabinNotes] = useState<CabinQuickNote[]>([]);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteAudioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const vadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const duckReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerVoiceDuck = useCallback(() => {
    getDriveInAudioGraph().setVoiceDucking(true);
    if (duckReleaseTimerRef.current) clearTimeout(duckReleaseTimerRef.current);
    duckReleaseTimerRef.current = setTimeout(() => {
      getDriveInAudioGraph().setVoiceDucking(false);
    }, 520);
  }, []);

  const toggleWindowsUpFm = useCallback((force?: boolean) => {
    setWindowsUpFmMode((prev) => {
      const next = force !== undefined ? force : !prev;
      const g = getDriveInAudioGraph();
      g.unlock();
      g.setCabinRadioMode(next);
      return next;
    });
  }, []);

  const stopMicrophone = useCallback(() => {
    if (vadTimerRef.current) {
      clearInterval(vadTimerRef.current);
      vadTimerRef.current = null;
    }
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        track.stop();
      }
      localStreamRef.current = null;
    }
    setMicEnabled(false);
    setIsLocalSpeaking(false);
    getDriveInAudioGraph().setVoiceDucking(false);
  }, []);

  const closeAllPeers = useCallback(() => {
    for (const pc of peersRef.current.values()) {
      try {
        pc.close();
      } catch {
        /* ignore */
      }
    }
    peersRef.current.clear();
    for (const el of remoteAudioElsRef.current.values()) {
      el.srcObject = null;
      el.remove();
    }
    remoteAudioElsRef.current.clear();
  }, []);

  // Connect or create a PeerConnection to a remote cabin passenger
  const getOrCreatePeer = useCallback(
    (remoteUserId: string, initiator: boolean): RTCPeerConnection => {
      const existing = peersRef.current.get(remoteUserId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peersRef.current.set(remoteUserId, pc);

      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getTracks()) {
          pc.addTrack(track, localStreamRef.current);
        }
      }

      pc.onicecandidate = (ev) => {
        if (ev.candidate && channelRef.current) {
          channelRef.current.send({
            type: "broadcast",
            event: "webrtc-ice",
            payload: {
              from: userId,
              to: remoteUserId,
              candidate: ev.candidate.toJSON(),
            },
          });
        }
      };

      pc.ontrack = (ev) => {
        const stream = ev.streams?.[0];
        if (!stream) return;
        let audioEl = remoteAudioElsRef.current.get(remoteUserId);
        if (!audioEl) {
          audioEl = document.createElement("audio");
          audioEl.autoplay = true;
          audioEl.style.display = "none";
          document.body.appendChild(audioEl);
          remoteAudioElsRef.current.set(remoteUserId, audioEl);
        }
        audioEl.srcObject = stream;
        audioEl.play().catch(() => {});
      };

      if (initiator) {
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => {
            if (channelRef.current && pc.localDescription) {
              channelRef.current.send({
                type: "broadcast",
                event: "webrtc-offer",
                payload: {
                  from: userId,
                  to: remoteUserId,
                  sdp: pc.localDescription,
                },
              });
            }
          })
          .catch(() => {});
      }

      return pc;
    },
    [userId]
  );

  // Join or leave 4-seat cabin channel when cabinCode changes
  useEffect(() => {
    if (!cabinCode) {
      closeAllPeers();
      return;
    }

    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const sbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    if (!sbUrl.startsWith("https://") || sbKey.length < 10) {
      return;
    }

    let disposed = false;
    let activeChannel: RealtimeChannel | null = null;

    import("@/lib/supabase/client")
      .then(({ createClient }) => {
        if (disposed) return;
        const supabase = createClient();
        const channel = supabase.channel(`cabin-voice-${cabinCode}`, {
          config: {
            broadcast: { self: false },
            presence: { key: userId },
          },
        });
        activeChannel = channel;
        channelRef.current = channel;

        const syncRoster = () => {
          const state = channel.presenceState<{
            userId: string;
            username: string;
            badgeColor: string;
            micEnabled: boolean;
            joinedAt: number;
          }>();

          const allEntries = Object.values(state)
            .flat()
            .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))
            .slice(0, 4);

          const nextRoster: CabinSeatOccupant[] = allEntries.map((entry, idx) => ({
            userId: entry.userId,
            username: entry.username,
            badgeColor: entry.badgeColor,
            seatPosition: Math.min(3, idx) as 0 | 1 | 2 | 3,
            micEnabled: Boolean(entry.micEnabled),
            isSpeaking: false,
          }));

          if (!nextRoster.some((p) => p.userId === userId)) {
            nextRoster.unshift({
              userId,
              username,
              badgeColor,
              seatPosition: 0,
              micEnabled,
              isSpeaking: false,
            });
          }

          setPassengers(nextRoster.slice(0, 4));

          // Establish WebRTC mesh with any new cabin peers
          for (const peer of nextRoster) {
            if (peer.userId !== userId && userId < peer.userId) {
              getOrCreatePeer(peer.userId, true);
            }
          }
        };

        channel
          .on("presence", { event: "sync" }, syncRoster)
          .on("broadcast", { event: "webrtc-offer" }, async ({ payload }) => {
            if (!payload || payload.to !== userId) return;
            const pc = getOrCreatePeer(payload.from, false);
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              channel.send({
                type: "broadcast",
                event: "webrtc-answer",
                payload: {
                  from: userId,
                  to: payload.from,
                  sdp: pc.localDescription,
                },
              });
            } catch {
              /* ignore */
            }
          })
          .on("broadcast", { event: "webrtc-answer" }, async ({ payload }) => {
            if (!payload || payload.to !== userId) return;
            const pc = peersRef.current.get(payload.from);
            if (!pc) return;
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            } catch {
              /* ignore */
            }
          })
          .on("broadcast", { event: "webrtc-ice" }, async ({ payload }) => {
            if (!payload || payload.to !== userId || !payload.candidate) return;
            const pc = peersRef.current.get(payload.from);
            if (!pc) return;
            try {
              await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } catch {
              /* ignore */
            }
          })
          .on("broadcast", { event: "cabin-speaking" }, ({ payload }) => {
            if (!payload?.userId) return;
            const active = Boolean(payload.speaking);
            if (active) triggerVoiceDuck();
            setPassengers((prev) =>
              prev.map((p) =>
                p.userId === payload.userId ? { ...p, isSpeaking: active } : p
              )
            );
          })
          .on("broadcast", { event: "cabin-note" }, ({ payload }) => {
            if (!payload?.text) return;
            setCabinNotes((prev) => [
              ...prev.slice(-19),
              payload as CabinQuickNote,
            ]);
          })
          .subscribe(async (status) => {
            if (status === "SUBSCRIBED") {
              await channel.track({
                userId,
                username,
                badgeColor,
                micEnabled,
                joinedAt: Date.now(),
              });
            }
          });
      })
      .catch(() => {});

    return () => {
      disposed = true;
      channelRef.current = null;
      closeAllPeers();
      if (activeChannel) {
        import("@/lib/supabase/client")
          .then(({ createClient }) => createClient().removeChannel(activeChannel!))
          .catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cabinCode, userId]);

  // Toggle live microphone + Web Audio VAD (-12 dB voice ducking)
  const toggleMicrophone = useCallback(async () => {
    setMicError(null);
    if (micEnabled) {
      stopMicrophone();
      return;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMicError("Microphone requires HTTPS or localhost.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      localStreamRef.current = stream;
      setMicEnabled(true);

      // Attach audio track to existing peer connections
      for (const [remoteId, pc] of peersRef.current.entries()) {
        for (const track of stream.getTracks()) {
          pc.addTrack(track, stream);
        }
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => {
            if (channelRef.current && pc.localDescription) {
              channelRef.current.send({
                type: "broadcast",
                event: "webrtc-offer",
                payload: {
                  from: userId,
                  to: remoteId,
                  sdp: pc.localDescription,
                },
              });
            }
          })
          .catch(() => {});
      }

      // Set up Voice Activity Detection (VAD) for automatic -12 dB movie audio ducking
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        const vadCtx = new AudioCtx();
        const src = vadCtx.createMediaStreamSource(stream);
        const analyser = vadCtx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);

        vadTimerRef.current = setInterval(() => {
          analyser.getByteFrequencyData(buf);
          let sum = 0;
          for (let i = 2; i < 36; i++) sum += buf[i];
          const avg = sum / 34;
          const speaking = avg > 28;

          setIsLocalSpeaking((prev) => {
            if (prev !== speaking && channelRef.current) {
              channelRef.current.send({
                type: "broadcast",
                event: "cabin-speaking",
                payload: { userId, speaking },
              });
            }
            return speaking;
          });

          if (speaking) {
            triggerVoiceDuck();
          }
        }, 110);
      }
    } catch {
      setMicError("Mic permission denied — joined cabin in listen/chat mode.");
    }
  }, [micEnabled, stopMicrophone, triggerVoiceDuck, userId]);

  const openOrJoinCabin = useCallback(
    (requestedCode?: string) => {
      const code = (requestedCode || cabinCode || generateCabinCode())
        .replace(/[^A-Za-z0-9]/g, "")
        .slice(0, 6)
        .toUpperCase();
      if (code.length < 4) return;
      setPassengers([
        {
          userId,
          username,
          badgeColor,
          seatPosition: 0,
          micEnabled,
          isSpeaking: false,
        },
      ]);
      setCabinCode(code);
      // Automatically roll up windows to warm FM Radio mode when entering a crew cabin
      toggleWindowsUpFm(true);
    },
    [cabinCode, toggleWindowsUpFm, userId, username, badgeColor, micEnabled]
  );

  const leaveCabin = useCallback(() => {
    stopMicrophone();
    closeAllPeers();
    setPassengers([]);
    setCabinNotes([]);
    setCabinCode(null);
    toggleWindowsUpFm(false);
  }, [stopMicrophone, closeAllPeers, toggleWindowsUpFm]);

  const sendCabinNote = useCallback(
    (text: string) => {
      const trimmed = text.trim().slice(0, 140);
      if (!trimmed) return;
      const note: CabinQuickNote = {
        id: `cn_${Date.now()}`,
        username,
        badgeColor,
        text: trimmed,
        createdAt: new Date().toISOString(),
      };
      setCabinNotes((prev) => [...prev.slice(-19), note]);
      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "cabin-note",
          payload: note,
        });
      }
    },
    [username, badgeColor]
  );

  useEffect(() => {
    return () => {
      stopMicrophone();
      closeAllPeers();
    };
  }, [stopMicrophone, closeAllPeers]);

  return {
    cabinCode,
    cabinUnlocked: Boolean(cabinCode),
    windowsUpFmMode,
    micEnabled,
    micError,
    isLocalSpeaking,
    passengers,
    cabinNotes,
    toggleWindowsUpFm,
    toggleMicrophone,
    openOrJoinCabin,
    leaveCabin,
    sendCabinNote,
    triggerVoiceDuck,
  };
}
