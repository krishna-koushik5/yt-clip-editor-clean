"use client";

import { useState, useEffect } from "react";
import { SavedClip } from "@/app/page";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Trash2, Save, Edit, Pencil } from "lucide-react";
import { VideoPlayer } from "./video/VideoPlayer";
import { VideoSettings } from "./video/VideoSettings";
import { TextStylingSettings } from "./video/TextStylingSettings";
import { ClipSettings } from "./video/types";
import { formatTime } from "./video/utils";
import { toast } from "sonner";
import { WebhookUrlModal } from "./WebhookUrlModal";
import { getWebhookUrl, saveWebhookUrl } from "@/lib/webhookStore";
import { Textarea } from "./ui/textarea";
import Image from "next/image";
// import { DateTimePicker } from "./ui/datetime-picker";

interface SavedClipsProps {
  clips: SavedClip[];
  onRemoveClip: (id: string) => void;
  onUpdateClip: (clipId: string, updatedData: Partial<SavedClip>) => void;
  onSwitchToSaveClips?: () => void; // New prop for tab switching
  onVideoGenerated?: (clipId: string, videoUrl: string) => void; // New prop for video tracking
}

export default function SavedClips({ clips, onRemoveClip, onUpdateClip, onSwitchToSaveClips, onVideoGenerated }: SavedClipsProps) {
  const [mounted, setMounted] = useState(false);
  const [clipSettings, setClipSettings] = useState<Record<string, ClipSettings>>({});
  // Aspect ratio is fixed to 9:16 now, so we no longer track it per-clip
  const [isSaving, setIsSaving] = useState(false);
  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
  const [preset, setPreset] = useState("Custom");
  const [editingClipId, setEditingClipId] = useState<string | null>(null);
  const [editedTranscription, setEditedTranscription] = useState<string>('');
  const [generatingClipId, setGeneratingClipId] = useState<string | null>(null);
  const [generatedVideoUrls, setGeneratedVideoUrls] = useState<Record<string, string>>({});
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [showClipsList, setShowClipsList] = useState(true);

  // Only initialize on the client side
  useEffect(() => {
    setMounted(true);

    // Initialize settings for all clips
    const initialSettings: Record<string, ClipSettings> = {};

    clips.forEach(clip => {
      initialSettings[clip.id] = getDefaultSettings("9:16"); // Default to 9:16, will be updated when user changes aspect ratio
    });

    setClipSettings(initialSettings);
  }, [clips]);



  const getDefaultSettings = (aspectRatio: string = "9:16"): ClipSettings => {
    // Get canvas dimensions for the aspect ratio
    const getCanvasDimensions = (ar: string) => {
      switch (ar) {
        case '16:9': return { width: 1920, height: 1080 };
        case '1:1': return { width: 1080, height: 1080 };
        case '4:5': return { width: 1080, height: 1350 };
        case '3:4': return { width: 1080, height: 1440 };
        case '9:16':
        default: return { width: 1080, height: 1920 };
      }
    };

    const canvasDimensions = getCanvasDimensions(aspectRatio);
    const padding = 180; // Horizontal padding
    const elementWidth = canvasDimensions.width - (padding * 2);

    return {
      aspectRatio: aspectRatio as any,
      xPosition: 50,
      yPosition: 50,
      zoomLevel: 100,
      isPlaying: false,
      currentTime: 0,
      // Text styling defaults
      topText: "Enter Video Title",
      bottomText: "Enter Credits",
      topTextColor: "#FFFFFF",
      bottomTextColor: "#FFFFFF",
      topTextFontSize: 60,
      bottomTextFontSize: 30, // Increased from 20 to 30 for better credit visibility
      titleFontFamily: "Inter-Medium",
      creditsFontFamily: "Inter-Medium",
      // 101xFounders template specific fields
      boldTitleText: "Enter Bold Text",
      regularTitleText: "Enter Regular Text",
      boldTitleColor: "#F9A21B", // Default orange for 101xFounders
      titleFontWeightsSwapped: false, // Track if font weights are swapped

      // Watermark settings
      watermarkText: "@101xfounders",
      watermarkColor: "#FFFFFF",
      watermarkFontSize: 20,
      watermarkFontFamily: "Inter-Regular",
      watermarkPosition: { x: 50, y: 95 }, // Center, near bottom
      watermarkOpacity: 0.8,
      canvasBackgroundColor: "#000000",
      topTextBold: false,
      topTextItalic: false,
      bottomTextBold: false,
      bottomTextItalic: false,
      // Caption styling defaults
      captionColor: "#FFFFFF",
      captionFontSize: 40,
      captionFontFamily: "Roboto-Medium",
      captionStrokeWidth: 0,
      captionStrokeColor: "#000000",
      captionBold: false,
      captionItalic: false,
      // Manual positioning defaults - responsive to aspect ratio
      titlePosition: {
        x: padding,
        y: Math.max(60, canvasDimensions.height * 0.05), // 5% from top or minimum 60px
        width: elementWidth,
        height: 200,
      },
      captionPosition: {
        x: padding,
        y: canvasDimensions.height / 2 - 100, // Center vertically
        width: elementWidth,
        height: 200,
      },
      creditPosition: {
        x: padding,
        y: Math.min(canvasDimensions.height - 260, canvasDimensions.height * 0.85), // 85% down or 260px from bottom
        width: elementWidth,
        height: 200,
      },
    };
  };

  const getSettings = (clipId: string): ClipSettings => {
    const baseSettings = clipSettings[clipId] || getDefaultSettings("9:16");
    return baseSettings;
  };

  const updateSettings = (clipId: string, updates: Partial<ClipSettings>) => {
    setClipSettings(prev => {
      const currentSettings = prev[clipId] || getDefaultSettings("9:16");

      // If aspect ratio is changing, recalculate default positions
      if (updates.aspectRatio && updates.aspectRatio !== currentSettings.aspectRatio) {
        const newDefaults = getDefaultSettings(updates.aspectRatio);
        return {
          ...prev,
          [clipId]: {
            ...currentSettings,
            ...updates,
            // Update positions to new aspect ratio defaults if they haven't been manually customized
            titlePosition: newDefaults.titlePosition,
            captionPosition: newDefaults.captionPosition,
            creditPosition: newDefaults.creditPosition,
          },
        };
      }

      return {
        ...prev,
        [clipId]: {
          ...currentSettings,
          ...updates,
        },
      };
    });
  };



  const handleStartEditing = (clip: SavedClip) => {
    setEditingClipId(clip.id);
    setEditedTranscription(clip.captions?.map(c => c.text).join(' ') || '');
    // Clear generated video URL for this clip when editing starts
    setGeneratedVideoUrls(prev => {
      const newUrls = { ...prev };
      delete newUrls[clip.id];
      return newUrls;
    });
  };

  const handleSaveTranscription = (clipId: string) => {
    const originalClip = clips.find(clip => clip.id === clipId);
    if (!originalClip) return;

    // --- FIX START ---
    // The previous logic was creating a single caption but used an incorrect end time
    // derived from old caption data.
    // This fix creates a single, new caption object that correctly spans the *entire*
    // duration of the clip. This aligns with the UI, which provides a single
    // textarea for editing the transcription for the whole clip.
    const clipDuration = originalClip.end - originalClip.start;
    const updatedCaptions = [{
      start: '00:00:00.000',
      end: formatTime(clipDuration), // Use the clip's duration for the end time
      text: editedTranscription,
    }];
    // --- FIX END ---

    onUpdateClip(clipId, { captions: updatedCaptions });
    setEditingClipId(null);
    toast.success("Transcription updated locally. Generate the video to apply changes.");
  };

  const handleExtractAudio = async (clip: SavedClip) => {
    try {
      toast.loading('Extracting audio...', {
        description: 'This may take a moment depending on clip duration.',
      });

      const response = await fetch('/api/extract-audio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          youtubeUrl: clip.originalUrl,
          startTime: clip.start,
          endTime: clip.end,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to extract audio');
      }

      // Get the filename from the response headers
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch ? filenameMatch[1] : `clip_${clip.start}s-${clip.end}s.mp3`;

      // Convert response to blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success('Audio extracted successfully!', {
        description: `MP3 file "${filename}" downloaded. Upload to hinglishcaptions.com for transcription.`,
      });

    } catch (error) {
      console.error('Audio extraction error:', error);
      toast.error('Failed to extract audio', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred.',
      });
    }
  };

  const handleSrtUpload = async (event: React.ChangeEvent<HTMLInputElement>, clipId: string) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      toast.loading('Processing SRT file...');

      const text = await file.text();
      console.log('SRT file content:', text);

      const captions = parseSrtFile(text);
      console.log('Parsed captions:', captions);
      console.log('Number of captions:', captions.length);

      // Debug: Check the clip before update
      const clipBeforeUpdate = clips.find(c => c.id === clipId);
      console.log('Clip before update:', clipBeforeUpdate);
      console.log('Clip captions before update:', clipBeforeUpdate?.captions);

      // Update the clip with the new captions
      onUpdateClip(clipId, { captions });

      // Debug: Check the clip after update
      const clipAfterUpdate = clips.find(c => c.id === clipId);
      console.log('Clip after update:', clipAfterUpdate);
      console.log('Clip captions after update:', clipAfterUpdate?.captions);

      toast.success('SRT file imported successfully!', {
        description: `${captions.length} captions loaded. You can now generate the video.`,
      });

      // Reset the file input
      event.target.value = '';

    } catch (error) {
      console.error('SRT upload error:', error);
      toast.error('Failed to process SRT file', {
        description: error instanceof Error ? error.message : 'Invalid SRT file format.',
      });
    }
  };

  const parseSrtFile = (srtContent: string) => {
    const captions: Array<{ start: string; end: string; text: string }> = [];
    const blocks = srtContent.trim().split('\n\n');

    for (const block of blocks) {
      const lines = block.split('\n');
      if (lines.length >= 3) {
        const timeLine = lines[1];
        const text = lines.slice(2).join('\n');

        const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/);
        if (timeMatch) {
          captions.push({
            start: timeMatch[1].replace(',', '.'),
            end: timeMatch[2].replace(',', '.'),
            text: text.trim(),
          });
        }
      }
    }

    return captions;
  };

  const handleGenerateVideo = async (clip: SavedClip) => {
    setGeneratingClipId(clip.id);
    setGeneratedVideoUrls(prev => {
      const newUrls = { ...prev };
      delete newUrls[clip.id];
      return newUrls;
    });

    const settings = getSettings(clip.id);

    // Debug: Log the clip data and captions
    console.log('=== VIDEO GENERATION DEBUG ===');
    console.log('Clip data:', clip);
    console.log('Clip captions:', clip.captions);
    console.log('Captions length:', clip.captions?.length || 0);
    console.log('Captions type:', typeof clip.captions);
    if (clip.captions && clip.captions.length > 0) {
      console.log('First caption:', clip.captions[0]);
      console.log('Last caption:', clip.captions[clip.captions.length - 1]);
    }

    // Log the settings being sent for debugging
    console.log('Generating video with settings:', {
      title: settings.topText,
      credits: settings.bottomText,
      titleFont: settings.titleFontFamily,
      captionFont: settings.captionFontFamily,
      creditsFont: settings.creditsFontFamily,
      captionCount: clip.captions?.length || 0,
      // 101xFounders template specific logging
      boldTitleText: settings.boldTitleText,
      regularTitleText: settings.regularTitleText,
      template: preset === "101xFounders" ? "101xfounders" : preset === "101xBusiness" ? "101xbusiness" : preset === "101xMarketing" ? "101xmarketing" : preset === "BizzIndia" ? "bizzindia" : preset === "BestIndianPodcasts" ? "bestindianpodcasts" : "default",
    });

    try {
      const requestBody = {
        youtubeUrl: clip.originalUrl,
        startTime: clip.start,
        endTime: clip.end,
        captions: clip.captions,
        aspectRatio: settings.aspectRatio,
        title: settings.topText,
        credit: settings.bottomText,
        // 101xFounders template specific fields
        boldTitleText: settings.boldTitleText,
        regularTitleText: settings.regularTitleText,
        titleFontWeightsSwapped: settings.titleFontWeightsSwapped,
        template: preset === "101xFounders" ? "101xfounders" : preset === "101xBusiness" ? "101xbusiness" : preset === "101xMarketing" ? "101xmarketing" : preset === "BizzIndia" ? "bizzindia" : preset === "BestIndianPodcasts" ? "bestindianpodcasts" : "default",
        titleFontFamily: settings.titleFontFamily,
        titleFontSize: settings.topTextFontSize,
        titleColor: settings.topTextColor,
        captionFontFamily: settings.captionFontFamily,
        captionFontSize: settings.captionFontSize,
        captionColor: settings.captionColor,
        creditFontFamily: settings.creditsFontFamily,
        creditFontSize: settings.bottomTextFontSize,
        creditColor: settings.bottomTextColor,
        captionStrokeWidth: settings.captionStrokeWidth,
        captionStrokeColor: settings.captionStrokeColor,
        canvasBackgroundColor: settings.canvasBackgroundColor,
        titleBold: settings.topTextBold,
        titleItalic: settings.topTextItalic,
        captionBold: settings.captionBold,
        captionItalic: settings.captionItalic,
        creditBold: settings.bottomTextBold,
        creditItalic: settings.bottomTextItalic,
        titlePosition: settings.titlePosition,
        captionPosition: settings.captionPosition,
        creditPosition: settings.creditPosition,
        // Watermark settings
        watermarkText: settings.watermarkText,
        watermarkColor: settings.watermarkColor,
        watermarkFontSize: settings.watermarkFontSize,
        watermarkFontFamily: settings.watermarkFontFamily,
        watermarkPosition: settings.watermarkPosition,
      };

      console.log('Request body being sent to API:', requestBody);

      const response = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to generate video');
      }

      const result = await response.json();
      setGeneratedVideoUrls(prev => ({
        ...prev,
        [clip.id]: result.videoUrl,
      }));

      // Notify parent component about the generated video FIRST
      if (onVideoGenerated) {
        onVideoGenerated(clip.id, result.videoUrl);
      }

      toast.success('Video generated successfully!', {
        description: 'Video includes title, captions, and credits as shown in preview. Switching to Save Clips tab...',
        duration: 3000,
      });

      // Switch to Save Clips tab immediately after successful generation
      setTimeout(() => {
        if (onSwitchToSaveClips) {
          onSwitchToSaveClips();
        }
      }, 1000);

    } catch (error) {
      console.error('Video generation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast.error('Video Generation Failed', {
        description: errorMessage,
      });
    } finally {
      setGeneratingClipId(null);
    }
  };

  // Function to handle edit clip (placeholder for now)
  const handleEditClip = (clipId: string) => {
    // For now, just show a toast. In the future, this could open an edit modal
    // or navigate to an edit page
    toast.info("Edit functionality coming soon!", {
      description: `Editing clip: ${clips.find(c => c.id === clipId)?.title}`
    });
  };

  // Function to open the webhook modal
  const openSaveAllClipsModal = () => {
    if (clips.length === 0) {
      toast.error("No clips to save");
      return;
    }
    setIsWebhookModalOpen(true);
  };

  // Function to handle webhook URL submission
  const handleWebhookSubmit = async (url: string) => {
    // Save the webhook URL for future use
    saveWebhookUrl('saveAllClips', url);

    // Call the function to save all clips with the provided URL
    await saveAllClipsWithWebhook(url);
  };

  // New function to save all clips with the provided webhook URL
  const saveAllClipsWithWebhook = async (webhookUrl: string) => {
    if (clips.length === 0) {
      toast.error("No clips to save");
      return;
    }

    setIsSaving(true);
    try {
      // Create an array of clip data with their settings
      const clipsData = clips.map(clip => {
        const settings = getSettings(clip.id);
        return {
          start: clip.start,
          end: clip.end,
          aspectRatio: settings.aspectRatio || '9:16', // Use actual clip setting
          youtubeURL: clip.originalUrl,
          videoId: clip.videoId,
          title: clip.title,
          caption: clip.captions?.map(c => c.text).join(' ') || '', // Include caption in the webhook data
        };
      });

      // Call the webhook with all clips data
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clips: clipsData }),
      });

      if (!response.ok) {
        throw new Error('Failed to save clips');
      }

      toast.success("All clips saved successfully", {
        description: `${clips.length} clips have been saved.`
      });
    } catch (error) {
      console.error('Error saving clips:', error);
      toast.error("Failed to save clips", {
        description: "Please check the webhook URL and try again."
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Extended preset logic for captions, title, credits
  const applyPresetToAllClips = (preset: string) => {
    let presetSettings: Partial<ClipSettings> = {};

    switch (preset) {
      case "101xFounders":
        presetSettings = {
          titleFontFamily: "Inter-Medium", // Hook: FONTSPRING DEMO - Articulat CF & Inter (medium)
          captionFontFamily: "NotoSans-Regular", // Subtitle: Neue Haas Grotesk Display Pro (65 medium) - using NotoSans as fallback
          creditsFontFamily: "LibreFranklin-Regular", // Credit: Franklin Gothic Book - using LibreFranklin as fallback
          topTextColor: "#F9A21B", // Hook color: F9A21B (orange accent)
          captionColor: "#FFFFFF", // Subt color: FFFFFF
          bottomTextColor: "#FFFFFF", // Credits color
          captionStrokeWidth: 2.0,
          captionStrokeColor: "#000000",
          // Watermark settings
          watermarkText: "@101xfounders",
          watermarkColor: "#FFFFFF",
          watermarkFontSize: 20,
          watermarkFontFamily: "Inter-Regular",
          watermarkPosition: { x: 50, y: 95 },
          watermarkOpacity: 0.8,
        };
        break;
      case "101xBusiness":
        presetSettings = {
          titleFontFamily: "Inter-Medium", // Hook: FONTSPRING DEMO - Articulat CF & Inter (medium)
          captionFontFamily: "NotoSans-Regular", // Subtitle: Neue Haas Grotesk Display Pro (65 medium) - using NotoSans as fallback
          creditsFontFamily: "LibreFranklin-Regular", // Credit: Franklin Gothic Book - using LibreFranklin as fallback
          topTextColor: "#FEFFFF", // Hook color: FEFFFF (light blue/white)
          boldTitleColor: "#1D6CF2", // Bold text color: 1D6CF2 (blue)
          captionColor: "#FFFFFF", // Subt color: FFFFFF
          bottomTextColor: "#FFFFFF", // Credits color
          captionStrokeWidth: 2.0,
          captionStrokeColor: "#000000",
          // Watermark settings
          watermarkText: "@101xbusiness",
          watermarkColor: "#FFFFFF",
          watermarkFontSize: 20,
          watermarkFontFamily: "Inter-Regular",
          watermarkPosition: { x: 50, y: 95 },
          watermarkOpacity: 0.8,
        };
        break;
      case "101xMarketing":
        presetSettings = {
          titleFontFamily: "Inter-Medium", // Hook: FONTSPRING DEMO - Articulat CF & Inter (medium)
          captionFontFamily: "NotoSans-Regular", // Subtitle: Neue Haas Grotesk Display Pro (65 medium) - using NotoSans as fallback
          creditsFontFamily: "LibreFranklin-Regular", // Credit: Franklin Gothic Book - using LibreFranklin as fallback
          topTextColor: "#FEFFFF", // Hook color: FEFFFF (light blue/white)
          boldTitleColor: "#3AA946", // Bold text color: 3AA946 (green)
          captionColor: "#FFFFFF", // Subt color: FFFFFF
          bottomTextColor: "#FFFFFF", // Credits color
          captionStrokeWidth: 2.0,
          captionStrokeColor: "#000000",
          // Watermark settings
          watermarkText: "@101xmarketing",
          watermarkColor: "#FFFFFF",
          watermarkFontSize: 20,
          watermarkFontFamily: "Inter-Regular",
          watermarkPosition: { x: 50, y: 95 },
          watermarkOpacity: 0.8,
        };
        break;
      case "BizzIndia":
        presetSettings = {
          titleFontFamily: "Inter-Medium", // Hook: FONTSPRING DEMO - Articulat CF & Inter (medium)
          captionFontFamily: "NotoSans-Regular", // Subtitle: Neue Haas Grotesk Display Pro (65 medium) - using NotoSans as fallback
          creditsFontFamily: "LibreFranklin-Regular", // Credit: Franklin Gothic Book - using LibreFranklin as fallback
          topTextColor: "#FEFFFF", // Hook color: FEFFFF (light blue/white)
          boldTitleColor: "#0095FA", // Bold text color: 0095FA (blue)
          captionColor: "#FFFFFF", // Subt color: FFFFFF
          bottomTextColor: "#FFFFFF", // Credits color
          captionStrokeWidth: 2.0,
          captionStrokeColor: "#000000",
          // Watermark settings
          watermarkText: "@bizzindia",
          watermarkColor: "#FFFFFF",
          watermarkFontSize: 20,
          watermarkFontFamily: "Inter-Regular",
          watermarkPosition: { x: 50, y: 95 },
          watermarkOpacity: 0.8,
        };
        break;
      case "BestIndianPodcasts":
        presetSettings = {
          titleFontFamily: "Articulat CF", // Hook: FONTSPRING DEMO - Articulat CF
          captionFontFamily: "NotoSans-Regular", // Subtitle: Neue Haas Grotesk Display Pro (65 medium) - using NotoSans as fallback
          creditsFontFamily: "LibreFranklin-Regular", // Credit: Franklin Gothic Book - using LibreFranklin as fallback
          topTextColor: "#FEFFFF", // Hook color: FEFFFF (light blue/white)
          boldTitleColor: "#FFF200", // Bold text color: FFF200 (bright yellow)
          captionColor: "#FFFFFF", // Subt color: FFFFFF
          bottomTextColor: "#FFFFFF", // Credits color
          captionStrokeWidth: 2.0,
          captionStrokeColor: "#000000",
          // Watermark settings
          watermarkText: "@bestindianpodcasts",
          watermarkColor: "#FFFFFF",
          watermarkFontSize: 20,
          watermarkFontFamily: "Inter-Regular",
          watermarkPosition: { x: 50, y: 95 },
          watermarkOpacity: 0.8,
        };
        break;
      case "IndianFoundersco":
        presetSettings = {
          titleFontFamily: "NotoSans-Regular", // Hook: Neue Haas Grotesk Display Pro (65 medium) - using NotoSans as fallback
          captionFontFamily: "NotoSans-Regular", // Subt: Neue Haas Grotesk Display Pro (65 medium) - using NotoSans as fallback
          creditsFontFamily: "LibreFranklin-Regular", // Credit: Franklin Gothic Book - using LibreFranklin as fallback
          topTextColor: "#F2DB2D", // Hook color: F2DB2D (yellow accent)
          captionColor: "#FFFFFF", // Subt color: FFFFFF
          bottomTextColor: "#FFFFFF", // Credits color
          captionStrokeWidth: 5.0,
          captionStrokeColor: "#000000",
          // Watermark settings
          watermarkText: "@indianfoundersco",
          watermarkColor: "#FFFFFF",
          watermarkFontSize: 20,
          watermarkFontFamily: "Inter-Regular",
          watermarkPosition: { x: 50, y: 95 },
          watermarkOpacity: 0.8,
        };
        break;
      case "BIP":
        presetSettings = {
          titleFontFamily: "Inter-Medium", // Hook: Articulat CF (Bold) - using Inter as fallback
          captionFontFamily: "NotoSans-Regular", // Subtitle: Neue Haas Grotesk Display Pro - using NotoSans as fallback
          creditsFontFamily: "NotoSans-Regular", // Credit: Ebrima Regular - using NotoSans as fallback
          topTextColor: "#FFF200", // Hook color: FFF200 (bright yellow)
          captionColor: "#FFFFFF", // Subt color: FFFFFF
          bottomTextColor: "#FFFFFF", // Credits color
          captionStrokeWidth: 3.5,
          captionStrokeColor: "#000000",
          // Watermark settings
          watermarkText: "@bip",
          watermarkColor: "#FFFFFF",
          watermarkFontSize: 20,
          watermarkFontFamily: "Inter-Regular",
          watermarkPosition: { x: 50, y: 95 },
          watermarkOpacity: 0.8,
        };
        break;
      case "Lumen Links":
        presetSettings = {
          titleFontFamily: "Inter-Medium", // Hook: Manrope (Bold/Medium) - using Inter as fallback
          captionFontFamily: "Roboto-Medium", // Subt: Roboto (medium)
          creditsFontFamily: "LibreFranklin-Regular", // Credit: Poppins (regular) - using LibreFranklin as fallback
          topTextColor: "#FFFFFF", // Hook color: White with highlight
          captionColor: "#02D17E", // Subtitle color: 02D17E (green)
          bottomTextColor: "#FFFFFF", // Credits color
          captionStrokeWidth: 2.0,
          captionStrokeColor: "#000000",
          // Watermark settings
          watermarkText: "@lumenlinks",
          watermarkColor: "#FFFFFF",
          watermarkFontSize: 20,
          watermarkFontFamily: "Inter-Regular",
          watermarkPosition: { x: 50, y: 95 },
          watermarkOpacity: 0.8,
        };
        break;
      case "GoodClipsMatter":
        presetSettings = {
          titleFontFamily: "Inter-Medium", // Hook: Onest (Medium) - using Inter as fallback
          captionFontFamily: "Roboto-Medium", // Subt: Trebuchet MS (Italic) - using Roboto as fallback
          creditsFontFamily: "LibreFranklin-Regular", // Credit: Poppins (regular) - using LibreFranklin as fallback
          topTextColor: "#FFFFFF", // Hook color: White
          captionColor: "#FFFFFF", // Subtitle color: FFFFFF
          bottomTextColor: "#FFFFFF", // Credits color
          captionStrokeWidth: 3.0,
          captionStrokeColor: "#000000",
          // Watermark settings
          watermarkText: "@goodclipsmatter",
          watermarkColor: "#FFFFFF",
          watermarkFontSize: 20,
          watermarkFontFamily: "Inter-Regular",
          watermarkPosition: { x: 50, y: 95 },
          watermarkOpacity: 0.8,
        };
        break;
      case "JabWeWatched":
        presetSettings = {
          titleFontFamily: "NotoSans-Regular", // Hook: Spectral (Bold) - using NotoSans as fallback
          captionFontFamily: "Roboto-Medium", // Subt: Trebuchet MS (Italic) - using Roboto as fallback
          creditsFontFamily: "LibreFranklin-Regular", // Credit: Poppins (regular) - using LibreFranklin as fallback
          topTextColor: "#FFFFFF", // Hook color: White
          captionColor: "#FFFA00", // Subtitle color: FFFA00 (bright yellow)
          bottomTextColor: "#FFFFFF", // Credits color
          captionStrokeWidth: 4.0,
          captionStrokeColor: "#000000",
          // Watermark settings
          watermarkText: "@jabwewatched",
          watermarkColor: "#FFFFFF",
          watermarkFontSize: 20,
          watermarkFontFamily: "Inter-Regular",
          watermarkPosition: { x: 50, y: 95 },
          watermarkOpacity: 0.8,
        };
        break;
      default:
        // Custom or default case
        presetSettings = getDefaultSettings();
        break;
    }

    // For all clips, update settings and set video credits to @Preset Name
    setClipSettings(prev => {
      const updated: Record<string, ClipSettings> = { ...prev };
      Object.keys(updated).forEach(cid => {
        updated[cid] = { ...updated[cid], ...presetSettings };
      });
      return updated;
    });
  };

  // Don't render anything until client-side hydration is complete
  if (!mounted) {
    return null;
  }

  if (clips.length === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold mb-4">Editor</h2>
        <p className="text-base text-gray-600 dark:text-gray-400 mb-6">
          You haven&apos;t saved any clips yet. Go to the YouTube Clipper tab to create and save clips.
        </p>
      </div>
    );
  }

  const selectedClip = selectedClipId ? clips.find(c => c.id === selectedClipId) : null;

  return (
    <div>
      {/* Webhook URL Modal */}
      <WebhookUrlModal
        isOpen={isWebhookModalOpen}
        onClose={() => setIsWebhookModalOpen(false)}
        onSubmit={handleWebhookSubmit}
        title="Save All Clips Webhook"
        description="Enter the webhook URL to save all clips."
        defaultUrl={getWebhookUrl('saveAllClips')}
      />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold mb-2">Editor</h2>
          <p className="text-base text-gray-600 dark:text-gray-400">
            Select a clip to edit and customize.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Clips Section - Collapsible */}
        <div className="bg-gray-50 dark:bg-[#1E1E1E] rounded-lg border border-gray-200 dark:border-[#333333]">
          <div className="p-4 border-b border-gray-200 dark:border-[#333333]">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Clips ({clips.length})</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowClipsList(!showClipsList)}
              >
                {showClipsList ? 'Collapse' : 'Expand'}
              </Button>
            </div>
          </div>

          {showClipsList && (
            <div className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {clips.map((clip) => (
                  <div
                    key={clip.id}
                    onClick={() => {
                      setSelectedClipId(clip.id);
                      setShowClipsList(false);
                    }}
                    className={`rounded-lg border cursor-pointer transition-all hover:scale-105 overflow-hidden ${selectedClipId === clip.id
                      ? 'border-[#7C3AED] bg-[#7C3AED]/5'
                      : 'border-gray-200 dark:border-[#333333] bg-white dark:bg-[#2A2A2A] hover:border-[#7C3AED]/50'
                      }`}
                  >
                    {/* Thumbnail - Full width at top */}
                    <div className="relative w-full aspect-video">
                      <Image
                        src={clip.thumbnail}
                        alt={clip.title}
                        fill
                        className="object-cover"
                      />
                    </div>

                    {/* Content below thumbnail */}
                    <div className="p-3 space-y-1">
                      <h4 className="font-medium text-sm leading-tight line-clamp-2">{clip.title}</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatTime(clip.start)} - {formatTime(clip.end)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Duration: {formatTime(clip.end - clip.start)}
                      </p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Captions: {clip.captions?.length || 0}
                        </span>
                        {clip.captions && clip.captions.length > 0 && (
                          <span className="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded">
                            Ready
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Editor Section - Two Screens */}
        {selectedClip && (
          <div className="space-y-6">
            {/* First Screen - Captions and Preview */}
            <div className="bg-gray-50 dark:bg-[#1E1E1E] rounded-lg border border-gray-200 dark:border-[#333333] p-6">
              <h3 className="text-xl font-semibold mb-4">Preview & Captions</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  {mounted && (
                    <VideoPlayer
                      clip={selectedClip}
                      settings={getSettings(selectedClip.id)}
                      onSettingsChange={(updates) => updateSettings(selectedClip.id, updates)}
                    />
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium flex items-center">
                      <Pencil className="h-4 w-4 mr-2" /> Auto-Generated Transcription
                    </label>
                    <div className="flex gap-2">
                      {editingClipId === selectedClip.id ? (
                        <Button
                          size="sm"
                          onClick={() => handleSaveTranscription(selectedClip.id)}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <Save className="h-4 w-4 mr-1" />
                          Save
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStartEditing(selectedClip)}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="h-64 overflow-y-auto p-4 bg-white dark:bg-[#2A2A2A] rounded-lg border border-gray-200 dark:border-[#333333]">
                    {editingClipId === selectedClip.id ? (
                      <textarea
                        value={editedTranscription}
                        onChange={(e) => setEditedTranscription(e.target.value)}
                        className="w-full h-full bg-transparent border-none outline-none text-sm text-gray-800 dark:text-gray-200 leading-relaxed resize-none"
                        autoFocus
                      />
                    ) : (
                      <>
                        {selectedClip.captions && selectedClip.captions.length > 0 ? (
                          <div>
                            <div className="mb-2 p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-700">
                              <p className="text-xs text-green-700 dark:text-green-300 font-medium">
                                ✅ {selectedClip.captions.length} captions loaded
                              </p>
                            </div>
                            <div className="space-y-2">
                              {selectedClip.captions.map((caption, index) => (
                                <div key={index} className="p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs">
                                  <div className="text-gray-600 dark:text-gray-400">
                                    {caption.start} → {caption.end}
                                  </div>
                                  <div className="text-gray-800 dark:text-gray-200 font-medium">
                                    {caption.text}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <div className="text-center">
                              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                                No captions available for this clip.
                              </p>
                              <p className="text-xs text-gray-400 dark:text-gray-500">
                                Upload an SRT file or use test captions below.
                              </p>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Test Captions Panel */}
                  <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-700">
                    <h4 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-3 flex items-center">
                      <span className="mr-2">🧪</span>
                      Test Captions (Debug)
                    </h4>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
                      Create test captions to verify video generation works
                    </p>
                    <Button
                      size="sm"
                      onClick={() => {
                        const testCaptions = [
                          { start: '00:00:00.000', end: '00:00:05.000', text: 'This is test caption 1' },
                          { start: '00:00:05.000', end: '00:00:10.000', text: 'This is test caption 2' },
                          { start: '00:00:10.000', end: '00:00:15.000', text: 'This is test caption 3' }
                        ];
                        onUpdateClip(selectedClip.id, { captions: testCaptions });
                        toast.success('Test captions added!', {
                          description: '3 test captions created. Try generating video now.'
                        });
                      }}
                      className="bg-yellow-600 hover:bg-yellow-700 text-white"
                    >
                      Add Test Captions
                    </Button>
                  </div>

                  {/* Subtitle Workflow Panel */}
                  <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-3 flex items-center">
                      <span className="mr-2">🎯</span>
                      Subtitle Workflow
                    </h4>

                    <div className="space-y-3">
                      {/* Step 1: Download MP3 */}
                      <div className="flex items-center justify-between p-3 bg-white dark:bg-[#2A2A2A] rounded-lg border border-blue-200 dark:border-blue-700">
                        <div className="flex items-center space-x-3">
                          <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">1</div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">Download MP3 Audio</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">Extract audio segment using yt-dlp and ffmpeg</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleExtractAudio(selectedClip)}
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          Download MP3
                        </Button>
                      </div>

                      {/* Step 2: External Service Instructions */}
                      <div className="flex items-center justify-between p-3 bg-white dark:bg-[#2A2A2A] rounded-lg border border-blue-200 dark:border-blue-700">
                        <div className="flex items-center space-x-3">
                          <div className="w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-xs font-bold">2</div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">Generate Captions</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">Upload MP3 to hinglishcaptions.com for professional transcription</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open('https://hinglishcaptions.com', '_blank')}
                          className="border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                        >
                          Visit Service
                        </Button>
                      </div>

                      {/* Step 3: Upload SRT */}
                      <div className="flex items-center justify-between p-3 bg-white dark:bg-[#2A2A2A] rounded-lg border border-blue-200 dark:border-blue-700">
                        <div className="flex items-center space-x-3">
                          <div className="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center text-xs font-bold">3</div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">Upload SRT File</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">Import generated captions back to the application</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => document.getElementById('srt-upload')?.click()}
                          className="border-purple-500 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                        >
                          Upload SRT
                        </Button>
                      </div>
                    </div>

                    {/* Hidden file input for SRT upload */}
                    <input
                      id="srt-upload"
                      type="file"
                      accept=".srt"
                      onChange={(e) => handleSrtUpload(e, selectedClip.id)}
                      className="hidden"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Second Screen - Settings and Generate */}
            <div className="bg-gray-50 dark:bg-[#1E1E1E] rounded-lg border border-gray-200 dark:border-[#333333] p-6">
              <h3 className="text-xl font-semibold mb-4">Video Settings</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium mb-3">Positioning & Layout</h4>
                  {mounted && (
                    <VideoSettings
                      clipId={selectedClip.id}
                      clip={selectedClip}
                      settings={getSettings(selectedClip.id)}
                      onSettingsChange={(updates) => updateSettings(selectedClip.id, updates)}
                    />
                  )}
                </div>
                <div className="space-y-6">
                  {mounted && (
                    <TextStylingSettings
                      clipId={selectedClip.id}
                      clip={selectedClip}
                      settings={getSettings(selectedClip.id)}
                      onSettingsChange={(updates) => updateSettings(selectedClip.id, updates)}
                      preset={preset}
                      onPresetChange={(newPreset) => {
                        setPreset(newPreset);
                        applyPresetToAllClips(newPreset);
                      }}
                    />
                  )}

                  <div className="space-y-4">
                    {/* Caption Warning */}
                    {(!selectedClip.captions || selectedClip.captions.length === 0) && (
                      <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-700">
                        <p className="text-sm text-yellow-700 dark:text-yellow-300">
                          ⚠️ No captions available. Upload an SRT file or use test captions first.
                        </p>
                      </div>
                    )}

                    {/* Generate Button */}
                    <Button
                      onClick={() => handleGenerateVideo(selectedClip)}
                      disabled={generatingClipId === selectedClip.id || !selectedClip.captions || selectedClip.captions.length === 0}
                      className="w-full bg-green-600 hover:bg-green-700 text-white py-3 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {generatingClipId === selectedClip.id ? 'Generating Video...' : 'Generate Video'}
                    </Button>

                    {/* Generated Video Display */}
                    {generatedVideoUrls[selectedClip.id] && (
                      <div className="mt-4">
                        <h4 className="font-semibold mb-2">Generated Video:</h4>
                        <video src={generatedVideoUrls[selectedClip.id]} controls className="w-full rounded-lg max-h-64"></video>
                        <div className="flex gap-2 mt-2">
                          <a
                            href={generatedVideoUrls[selectedClip.id]}
                            download={`clip-${selectedClip.title}.mp4`}
                            className="text-blue-500 hover:underline"
                          >
                            Download Video
                          </a>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-500 border-red-500 hover:bg-red-100 dark:hover:bg-red-900 ml-auto"
                            onClick={() => onRemoveClip(selectedClip.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Remove Clip
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {!selectedClip && (
          <div className="text-center py-12 bg-gray-50 dark:bg-[#1E1E1E] rounded-lg border-2 border-dashed border-gray-300 dark:border-[#333333]">
            <h3 className="text-xl font-semibold mb-2">Select a Clip to Edit</h3>
            <p className="text-base text-gray-600 dark:text-gray-400">
              Choose a clip from the list above to start editing and customizing.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}