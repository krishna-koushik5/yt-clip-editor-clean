"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, RotateCcw, Volume2, Maximize2 } from "lucide-react";
import { SavedClip } from "@/app/page";
import { ClipSettings } from "./types";
import { formatTime, timeToSeconds } from "./utils";
import { VideoControls } from "./VideoControls";

interface VideoPlayerProps {
  clip: SavedClip;
  settings: ClipSettings;
  onSettingsChange: (updates: Partial<ClipSettings>) => void;
}

// Helper function to convert font names for CSS
const getFontDisplayName = (fontName: string): string => {
  const fontMap: Record<string, string> = {
    'Inter-Medium': 'Inter, sans-serif',
    'Inter-ExtraBold': 'Inter, sans-serif',
    'Inter-Thin': 'Inter, sans-serif',
    'Roboto-Medium': 'Roboto, sans-serif',
    'NotoSans-Regular': '"Noto Sans", sans-serif',
    'LibreFranklin-Regular': '"Libre Franklin", sans-serif',
    'Manrope-Bold': 'Manrope, sans-serif',
    'Manrope-Medium': 'Manrope, sans-serif',
    'Poppins-Regular': 'Poppins, sans-serif',
    'Spectral-Bold': 'Spectral, serif',
    'TrebuchetMS-Italic': '"Trebuchet MS", sans-serif',
  };
  return fontMap[fontName] || fontName?.replace('-', ' ') || 'Inter, sans-serif';
};

// Helper function to load Google Fonts
const loadGoogleFont = (fontFamily: string) => {
  const fontName = fontFamily.split('-')[0]; // Get base font name
  if (fontName && !document.querySelector(`link[href*="${fontName}"]`)) {
    const link = document.createElement('link');
    // Load Inter with all necessary weights for 101xFounders template
    if (fontName === 'Inter') {
      link.href = `https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800;900&display=swap`;
    } else {
      link.href = `https://fonts.googleapis.com/css2?family=${fontName}:wght@400;500;700&display=swap`;
    }
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
};

// Helper function to get aspect ratio CSS value
const getAspectRatio = (aspectRatio: string): string => {
  switch (aspectRatio) {
    case "16:9":
      return "16/9";
    case "1:1":
      return "1/1";
    case "4:5":
      return "4/5";
    case "3:4":
      return "3/4";
    case "9:16":
    default:
      return "9/16";
  }
};

// Helper function to get container width based on aspect ratio
const getContainerWidth = (aspectRatio: string): string => {
  switch (aspectRatio) {
    case "16:9":
      return "100%"; // Full width for horizontal
    case "1:1":
      return "400px"; // Square
    case "4:5":
      return "320px"; // Portrait
    case "3:4":
      return "300px"; // Portrait
    case "9:16":
    default:
      return "auto"; // Original behavior
  }
};

// Helper function to get max width based on aspect ratio
const getMaxWidth = (aspectRatio: string): string => {
  switch (aspectRatio) {
    case "16:9":
      return "800px"; // Wider for horizontal
    case "1:1":
      return "400px"; // Square
    case "4:5":
      return "320px"; // Portrait
    case "3:4":
      return "300px"; // Portrait  
    case "9:16":
    default:
      return "400px"; // Original behavior
  }
};

// Helper function to get canvas dimensions
const getCanvasDimensions = (aspectRatio: string): { width: number; height: number } => {
  switch (aspectRatio) {
    case '16:9':
      return { width: 1920, height: 1080 };
    case '1:1':
      return { width: 1080, height: 1080 };
    case '4:5':
      return { width: 1080, height: 1350 };
    case '3:4':
      return { width: 1080, height: 1440 };
    case '9:16':
    default:
      return { width: 1080, height: 1920 };
  }
};

export function VideoPlayer({ clip, settings, onSettingsChange }: VideoPlayerProps) {
  const playerRef = useRef<any>(null);
  const [apiReady, setApiReady] = useState(false);
  const timeUpdateRef = useRef<number | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerCurrentTime, setPlayerCurrentTime] = useState(clip.start);
  const [mounted, setMounted] = useState(false);
  const [activeCaption, setActiveCaption] = useState('');
  const [volume, setVolume] = useState(50);
  const [isMuted, setIsMuted] = useState(false);

  // Debug: Log clip data when component mounts
  useEffect(() => {
    console.log('VideoPlayer mounted with clip:', {
      id: clip.id,
      hasCaptions: !!clip.captions,
      captionCount: clip.captions?.length || 0,
      firstCaption: clip.captions?.[0],
      // 101xFounders template debugging
      boldTitleText: settings.boldTitleText,
      regularTitleText: settings.regularTitleText,
      topText: settings.topText,
    });

    // Load Inter font for 101xFounders template
    if (settings.boldTitleText || settings.regularTitleText) {
      loadGoogleFont('Inter');
    }
  }, [clip.id, settings.boldTitleText, settings.regularTitleText, settings.topText]);

  // Use a ref to check if we're currently handling seeking to avoid circular updates
  const isSeeking = useRef(false);

  // Get canvas dimensions for positioning
  const canvasDimensions = getCanvasDimensions(settings.aspectRatio);

  // Extract playback settings to separate object
  const playbackSettings = {
    isPlaying: settings.isPlaying,
    currentTime: settings.currentTime
  };

  // Extract appearance settings to separate object with fixed values
  const appearanceSettings = {
    aspectRatio: settings.aspectRatio,
    xPosition: 50, // Fixed center position
    yPosition: 50, // Fixed center position
    zoomLevel: 100  // Fixed default zoom (100%)
  };

  // Only initialize on the client side
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    // Check if API is already loaded
    if (window.YT) {
      setApiReady(true);
      initializePlayer();
      return;
    }

    // Load YouTube API
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    // Define the callback
    window.onYouTubeIframeAPIReady = () => {
      setApiReady(true);
      initializePlayer();
    };

    return () => {
      if (timeUpdateRef.current) {
        cancelAnimationFrame(timeUpdateRef.current);
      }
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (e) {
          console.error("Error destroying player:", e);
        }
      }
    };
  }, [clip.id, mounted]);

  // Re-initialize player when clip changes
  useEffect(() => {
    if (apiReady && mounted) {
      initializePlayer();
    }
  }, [clip.videoId, clip.start, clip.end, mounted]);

  // Handle time updates
  useEffect(() => {
    let frameId: number | null = null;

    const updateTime = () => {
      if (!playerRef.current || !playerReady || isSeeking.current) return;

      try {
        // Check if getCurrentTime method exists before calling it
        if (typeof playerRef.current.getCurrentTime !== 'function') {
          return;
        }
        const time = playerRef.current.getCurrentTime();
        if (!isNaN(time)) {
          setPlayerCurrentTime(time);

          // Only update the settings time if it's significantly different (to reduce updates)
          if (Math.abs(time - playbackSettings.currentTime) > 0.5) {
            // Only update currentTime, not aspectRatio
            onSettingsChange({
              currentTime: time,
            });
          }

          // Find and set the active caption with precise timing
          // The captions are relative to the clip start time, not absolute video time
          const clipRelativeTime = time - clip.start;
          const currentCaption = clip.captions?.find(c => {
            const startTime = timeToSeconds(c.start);
            const endTime = timeToSeconds(c.end);
            // Use a larger tolerance to ensure captions are visible
            const tolerance = 0.1;
            return clipRelativeTime >= (startTime - tolerance) && clipRelativeTime <= (endTime + tolerance);
          });

          // Only update if caption has changed to avoid unnecessary re-renders
          const newCaption = currentCaption?.text || '';
          if (newCaption !== activeCaption) {
            setActiveCaption(newCaption);
            console.log('Active caption changed:', newCaption, 'at time:', time, 'from caption:', currentCaption);
          }
        }

        if (time >= clip.end) {
          // Directly apply the reset logic here to avoid dependency issues
          playerRef.current.seekTo(clip.start, true);
          playerRef.current.pauseVideo();
          setPlayerCurrentTime(clip.start);
          onSettingsChange({
            isPlaying: false,
            currentTime: clip.start,
          });
          return;
        }

        if (playbackSettings.isPlaying) {
          frameId = requestAnimationFrame(updateTime);
        }
      } catch (e) {
        console.error("Error updating time:", e);
      }
    };

    if (playbackSettings.isPlaying && playerReady) {
      frameId = requestAnimationFrame(updateTime);
    }

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [playbackSettings.isPlaying, playerReady, clip.end, clip.start, settings]);

  // Load fonts when settings change
  useEffect(() => {
    if (settings.titleFontFamily) loadGoogleFont(settings.titleFontFamily);
    if (settings.captionFontFamily) loadGoogleFont(settings.captionFontFamily);
    if (settings.creditsFontFamily) loadGoogleFont(settings.creditsFontFamily);
  }, [settings.titleFontFamily, settings.captionFontFamily, settings.creditsFontFamily]);

  const initializePlayer = () => {
    if (playerRef.current) {
      try {
        playerRef.current.destroy();
      } catch (e) {
        console.error("Error destroying player:", e);
      }
      playerRef.current = null;
    }

    const container = document.getElementById(`player-${clip.id}`);
    if (!container) return;

    playerRef.current = new window.YT.Player(`player-${clip.id}`, {
      videoId: clip.videoId,
      playerVars: {
        controls: 0,
        disablekb: 1,
        modestbranding: 1,
        rel: 0,
        autoplay: 0,
        enablejsapi: 1,
      },
      events: {
        onReady: () => {
          setPlayerReady(true);
          const iframe = playerRef.current.getIframe();
          if (iframe) {
            iframe.style.opacity = '1';
          }
          // Seek to start time when player is ready
          playerRef.current.seekTo(clip.start, true);
          setPlayerCurrentTime(clip.start);
          // Remove settings initialization as it may override existing settings
        },
        onStateChange: (event: any) => {
          const isPlaying = event.data === window.YT.PlayerState.PLAYING;
          // Only update isPlaying to preserve other settings
          onSettingsChange({
            isPlaying,
          });
        },
      },
    });
  };

  const handlePlayPause = useCallback(() => {
    if (!playerRef.current || !playerReady) return;

    const newIsPlaying = !playbackSettings.isPlaying;

    if (newIsPlaying) {
      playerRef.current.playVideo();
    } else {
      playerRef.current.pauseVideo();
    }

    // Only update isPlaying, not aspectRatio
    onSettingsChange({
      isPlaying: newIsPlaying,
    });
  }, [playerReady, playbackSettings.isPlaying]);

  const handleSeek = useCallback((time: number) => {
    if (!playerRef.current || !playerReady) return;

    isSeeking.current = true;
    playerRef.current.seekTo(time, true);
    setPlayerCurrentTime(time);

    // Only update currentTime, not aspectRatio
    onSettingsChange({
      currentTime: time,
    });

    // Reset the seeking flag after a short delay
    setTimeout(() => {
      isSeeking.current = false;
    }, 100);
  }, [playerReady]);

  const handleReset = useCallback(() => {
    if (!playerRef.current || !playerReady) return;

    isSeeking.current = true;
    playerRef.current.seekTo(clip.start, true);
    playerRef.current.pauseVideo();
    setPlayerCurrentTime(clip.start);

    // Only update isPlaying and currentTime, not aspectRatio
    onSettingsChange({
      isPlaying: false,
      currentTime: clip.start,
    });

    // Reset the seeking flag after a short delay
    setTimeout(() => {
      isSeeking.current = false;
    }, 100);
  }, [clip.start, playerReady]);

  const handleVolumeChange = useCallback((newVolume: number) => {
    if (!playerRef.current || !playerReady) return;

    setVolume(newVolume);
    if (newVolume > 0) {
      setIsMuted(false);
      playerRef.current.unMute();
    }
    playerRef.current.setVolume(newVolume);
  }, [playerReady]);

  const handleMuteToggle = useCallback(() => {
    if (!playerRef.current || !playerReady) return;

    const newMuted = !isMuted;
    setIsMuted(newMuted);

    if (newMuted) {
      playerRef.current.mute();
    } else {
      playerRef.current.unMute();
    }
  }, [isMuted, playerReady]);

  // Calculate progress with safety checks
  const duration = Math.max(0.1, clip.end - clip.start);
  const clampedTime = Math.max(clip.start, Math.min(clip.end, playerCurrentTime));
  const progress = Math.max(0, Math.min(100, ((clampedTime - clip.start) / duration) * 100));

  const formattedCurrentTime = formatTime(clampedTime);
  const formattedEndTime = formatTime(clip.end);

  // Don't render anything until client-side hydration is complete
  if (!mounted) {
    return (
      <div className="flex flex-col gap-4">
        <div className="relative">
          <div className="relative bg-black rounded-lg overflow-hidden"
            style={{
              maxWidth: getMaxWidth(settings.aspectRatio || "9:16"),
              width: getContainerWidth(settings.aspectRatio || "9:16"),
              margin: 0,
              aspectRatio: getAspectRatio(settings.aspectRatio || "9:16"),
            }}>
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Video Preview Container */}
      <div className="relative">
        {/* Aspect Ratio Container */}
        <div
          className="relative mx-auto bg-black rounded-lg overflow-hidden"
          style={{
            aspectRatio: getAspectRatio(settings.aspectRatio || "9:16"),
            maxWidth: getMaxWidth(settings.aspectRatio || "9:16"),
            width: getContainerWidth(settings.aspectRatio || "9:16"),
            maxHeight: '600px',
            backgroundColor: settings.canvasBackgroundColor || '#000000',
          }}
        >
          {/* Title Overlay - Manual Positioning */}
          {settings.topText && !settings.boldTitleText && !settings.regularTitleText && settings.titlePosition && (
            <div
              className="absolute px-2 z-10 text-center"
              style={{
                left: `${(settings.titlePosition.x / canvasDimensions.width) * 100}%`,
                top: `${(settings.titlePosition.y / canvasDimensions.height) * 100}%`,
                width: `${(settings.titlePosition.width / canvasDimensions.width) * 100}%`,
                height: `${(settings.titlePosition.height / canvasDimensions.height) * 100}%`,
                fontFamily: getFontDisplayName(settings.titleFontFamily || 'Inter-Medium'),
                fontSize: `${settings.topTextFontSize * 0.3}px`, // Scale down for preview
                color: settings.topTextColor,
                fontWeight: settings.topTextBold ? 'bold' : 'normal',
                fontStyle: settings.topTextItalic ? 'italic' : 'normal',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {settings.topText}
            </div>
          )}

          {/* 101xFounders/101xBusiness Template Title Overlay */}
          {settings.boldTitleText && settings.regularTitleText && settings.titlePosition && (
            <div
              className="absolute px-2 z-10 text-center"
              style={{
                left: `${(settings.titlePosition.x / canvasDimensions.width) * 100}%`,
                top: `${(settings.titlePosition.y / canvasDimensions.height) * 100}%`,
                width: `${(settings.titlePosition.width / canvasDimensions.width) * 100}%`,
                height: `${(settings.titlePosition.height / canvasDimensions.height) * 100}%`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {/* First Title - Font weight depends on swap setting */}
              <span
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: `${settings.topTextFontSize * 0.3}px`,
                  color: settings.titleFontWeightsSwapped 
                    ? (settings.topTextColor || '#FFFFFF') 
                    : (settings.boldTitleColor || '#F9A21B'),
                  fontWeight: settings.titleFontWeightsSwapped ? 100 : 800, // Thin if swapped, Bold if normal
                }}
              >
                {settings.boldTitleText}
              </span>
              {/* Second Title - Font weight depends on swap setting */}
              <span
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: `${settings.topTextFontSize * 0.3}px`,
                  color: settings.titleFontWeightsSwapped 
                    ? (settings.boldTitleColor || '#F9A21B') 
                    : (settings.topTextColor || '#FFFFFF'),
                  fontWeight: settings.titleFontWeightsSwapped ? 800 : 100, // Bold if swapped, Thin if normal
                }}
              >
                {settings.regularTitleText}
              </span>
            </div>
          )}

          <div
            className="relative w-full h-full"
            style={{
              // Use fixed center position with no zoom
              transform: `translate(0%, 0%) scale(1)`,
              transition: 'transform 0.2s ease-out'
            }}
          >
            <div
              id={`player-${clip.id}`}
              className="absolute inset-0 w-full h-full opacity-0 transition-opacity duration-300"
            />
            {/* Live Caption Overlay - Fixed Center Position for Better Visibility */}
            {activeCaption && (
              <div
                className="absolute px-4 py-2 z-20 text-center bg-black bg-opacity-75 rounded-lg"
                style={{
                  left: '50%',
                  top: '90%',
                  transform: 'translateX(-50%)',
                  maxWidth: '90%',
                  fontFamily: getFontDisplayName(settings.captionFontFamily || 'Roboto-Medium'),
                  fontSize: `${Math.max(16, settings.captionFontSize * 0.4)}px`, // Ensure minimum readable size
                  color: settings.captionColor || '#FFFFFF',
                  fontWeight: settings.captionBold ? 'bold' : 'bold', // Always bold for better visibility
                  fontStyle: settings.captionItalic ? 'italic' : 'normal',
                  textShadow: settings.captionStrokeWidth && settings.captionStrokeColor
                    ? `${settings.captionStrokeColor} 2px 2px 4px, ${settings.captionStrokeColor} -2px -2px 4px, ${settings.captionStrokeColor} 2px -2px 4px, ${settings.captionStrokeColor} -2px 2px 4px`
                    : '2px 2px 4px rgba(0,0,0,0.8), -2px -2px 4px rgba(0,0,0,0.8), 2px -2px 4px rgba(0,0,0,0.8), -2px 2px 4px rgba(0,0,0,0.8)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  wordWrap: 'break-word',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {activeCaption}
              </div>
            )}
            {/* Debug: Show caption status */}
            <div className="absolute top-2 left-2 bg-black bg-opacity-75 text-white text-xs p-2 rounded z-20">
              <div>Captions: {clip.captions?.length || 0}</div>
              <div>Active: {activeCaption ? 'Yes' : 'No'}</div>
              <div>Time: {formatTime(playerCurrentTime)}</div>
              <div>Clip Rel: {(playerCurrentTime - clip.start).toFixed(1)}s</div>
              {activeCaption && (
                                  <div className="mt-1 text-xs bg-white bg-opacity-20 p-1 rounded">
                    &ldquo;{activeCaption}&rdquo;
                  </div>
              )}
            </div>
            {!apiReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-black">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
              </div>
            )}
          </div>

          {/* Credits Overlay - Manual Positioning */}
          {settings.bottomText && settings.creditPosition && (
            <div
              className="absolute px-2 z-10"
              style={{
                left: `${(settings.creditPosition.x / canvasDimensions.width) * 100}%`,
                top: `${(settings.creditPosition.y / canvasDimensions.height) * 100}%`,
                width: `${(settings.creditPosition.width / canvasDimensions.width) * 100}%`,
                height: `${(settings.creditPosition.height / canvasDimensions.height) * 100}%`,
                fontFamily: getFontDisplayName(settings.creditsFontFamily || 'LibreFranklin-Regular'),
                fontSize: `${settings.bottomTextFontSize * 0.3}px`, // Scale down for preview
                color: settings.bottomTextColor,
                fontWeight: settings.bottomTextBold ? 'bold' : 'normal',
                fontStyle: settings.bottomTextItalic ? 'italic' : 'normal',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
              }}
            >
              {settings.bottomText.startsWith('Credit: ') ? settings.bottomText : `Credit: ${settings.bottomText}`}
            </div>
          )}

          {/* Watermark Overlay */}
          {settings.watermarkText && settings.watermarkPosition && (
            <div
              className="absolute z-10 text-center"
              style={{
                left: `${settings.watermarkPosition.x}%`,
                top: `${settings.watermarkPosition.y}%`,
                transform: 'translate(-50%, -50%)',
                opacity: settings.watermarkOpacity || 0.8,
              }}
            >
              <span
                style={{
                  fontFamily: getFontDisplayName(settings.watermarkFontFamily || 'Inter-Regular'),
                  fontSize: `${(settings.watermarkFontSize || 20) * 0.3}px`,
                  color: settings.watermarkColor || '#FFFFFF',
                  fontWeight: 'normal',
                  textShadow: '1px 1px 2px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.8), 1px -1px 2px rgba(0,0,0,0.8), -1px 1px 2px rgba(0,0,0,0.8)',
                }}
              >
                {settings.watermarkText}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Caption Preview Panel */}
      {clip.captions && clip.captions.length > 0 && (
        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Caption Preview ({clip.captions.length} captions)
          </h4>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {clip.captions.map((caption, index) => {
              const startTime = timeToSeconds(caption.start);
              const endTime = timeToSeconds(caption.end);
              const clipRelativeTime = playerCurrentTime - clip.start;
              const isActive = clipRelativeTime >= startTime && clipRelativeTime <= endTime;

              return (
                <div
                  key={index}
                  className={`p-2 rounded text-xs transition-colors ${isActive
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 border border-blue-300 dark:border-blue-700'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-mono">
                      {caption.start} → {caption.end}
                    </span>
                    {isActive && (
                      <span className="text-blue-600 dark:text-blue-400 font-medium">
                        ● LIVE
                      </span>
                    )}
                  </div>
                  <div className="text-sm">{caption.text}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Seconds: {startTime.toFixed(2)}s → {endTime.toFixed(2)}s
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Caption Timing Debug Panel */}
      {clip.captions && clip.captions.length > 0 && (
        <div className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-700">
          <h4 className="text-sm font-medium text-yellow-700 dark:text-yellow-300 mb-2">
            🧪 Caption Timing Debug
          </h4>
          <div className="text-xs space-y-1">
            <div>Current Time: {formatTime(playerCurrentTime)} ({playerCurrentTime.toFixed(2)}s)</div>
            <div>Clip Relative: {(playerCurrentTime - clip.start).toFixed(2)}s</div>
            <div>Clip Range: {formatTime(clip.start)} → {formatTime(clip.end)}</div>
            <div>Active Caption: {activeCaption || 'None'}</div>
            <div className="mt-2">
              {clip.captions.map((caption, index) => {
                const startTime = timeToSeconds(caption.start);
                const endTime = timeToSeconds(caption.end);
                const clipRelativeTime = playerCurrentTime - clip.start;
                const isActive = clipRelativeTime >= startTime && clipRelativeTime <= endTime;
                return (
                  <div key={index} className={`p-1 rounded text-xs ${isActive ? 'bg-yellow-200 dark:bg-yellow-800' : 'bg-gray-100 dark:bg-gray-700'}`}>
                    Caption {index + 1}: {startTime.toFixed(2)}s → {endTime.toFixed(2)}s {isActive ? '● ACTIVE' : ''}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Video Controls */}
      <VideoControls
        isPlaying={settings.isPlaying}
        currentTime={playerCurrentTime}
        startTime={clip.start}
        endTime={clip.end}
        onPlayPause={handlePlayPause}
        onReset={handleReset}
        onSeek={handleSeek}
        onVolumeChange={handleVolumeChange}
        onMuteToggle={handleMuteToggle}
      />
    </div>
  );
} 