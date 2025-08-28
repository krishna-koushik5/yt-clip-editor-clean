import { SavedClip } from "@/app/page";

export interface ClipSettings {
  aspectRatio: "9:16" | "16:9" | "1:1" | "4:5" | "3:4";
  xPosition: number;
  yPosition: number;
  zoomLevel: number;
  isPlaying: boolean;
  currentTime: number;

  // Title / Hook
  topText: string;
  topTextColor: string;
  topTextFontSize: number;
  titleFontFamily: string; // e.g., 'Manrope-Bold'

  // 101xFounders Template Specific Fields
  boldTitleText?: string; // For bold orange text
  regularTitleText?: string; // For regular white text
  boldTitleColor?: string; // For customizing bold title color
  titleFontWeightsSwapped?: boolean; // Track if bold/thin font weights are swapped

  // Watermark settings
  watermarkText?: string;
  watermarkColor?: string;
  watermarkFontSize?: number;
  watermarkFontFamily?: string;
  watermarkPosition?: { x: number; y: number };
  watermarkOpacity?: number;

  // Credits
  bottomText: string;
  bottomTextColor: string;
  bottomTextFontSize: number;
  creditsFontFamily: string; // e.g., 'Poppins-Regular'

  // Captions / Subtitles
  captionColor: string;
  captionFontSize: number;
  captionFontFamily: string; // e.g., 'Roboto-Medium'
  captionStrokeWidth?: number;
  captionStrokeColor?: string;

  // These are now handled by the font family string, but we keep them
  // to avoid breaking the UI components that use them.
  topTextBold: boolean;
  topTextItalic: boolean;
  bottomTextBold: boolean;
  bottomTextItalic: boolean;
  captionBold: boolean;
  captionItalic: boolean;

  canvasBackgroundColor: string;

  // Manual positioning for text elements
  titlePosition: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  captionPosition: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  creditPosition: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// Declare YouTube API types
declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string | HTMLDivElement,
        options: {
          videoId: string;
          playerVars?: {
            autoplay?: number;
            controls?: number;
            disablekb?: number;
            enablejsapi?: number;
            modestbranding?: number;
            rel?: number;
            showinfo?: number;
            iv_load_policy?: number;
            playsinline?: number;
            mute?: number;
            start?: number;
          };
          events?: {
            onReady?: (event: any) => void;
            onStateChange?: (event: any) => void;
          };
        }
      ) => {
        destroy: () => void;
        getCurrentTime: () => number;
        getDuration: () => number;
        seekTo: (seconds: number, allowSeekAhead: boolean) => void;
        playVideo: () => void;
        pauseVideo: () => void;
        getIframe: () => HTMLIFrameElement;
      };
      PlayerState: {
        PLAYING: number;
        PAUSED: number;
        ENDED: number;
      };
    };
    onYouTubeIframeAPIReady: () => void;
  }
} 