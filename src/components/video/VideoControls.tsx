"use client";

import { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, RotateCcw, Volume2, VolumeX, Maximize2 } from "lucide-react";
import { formatTime } from "./utils";

interface VideoControlsProps {
  isPlaying: boolean;
  currentTime: number;
  startTime: number;
  endTime: number;
  onPlayPause: () => void;
  onReset: () => void;
  onSeek: (time: number) => void;
  onVolumeChange?: (volume: number) => void;
  onMuteToggle?: () => void;
}

export const VideoControls = memo(function VideoControls({
  isPlaying,
  currentTime,
  startTime,
  endTime,
  onPlayPause,
  onReset,
  onSeek,
  onVolumeChange,
  onMuteToggle,
}: VideoControlsProps) {
  const [volume, setVolume] = useState(50);
  const [isMuted, setIsMuted] = useState(false);
  // Calculate progress with safety checks
  const duration = Math.max(0.1, endTime - startTime);
  const clampedCurrentTime = Math.max(startTime, Math.min(endTime, currentTime));
  const progress = Math.max(0, Math.min(100, ((clampedCurrentTime - startTime) / duration) * 100));
  
  const formattedCurrentTime = formatTime(clampedCurrentTime);
  const formattedEndTime = formatTime(endTime);

  const handleVolumeChange = (newVolume: number[]) => {
    const vol = newVolume[0];
    setVolume(vol);
    if (vol > 0) {
      setIsMuted(false);
    }
    onVolumeChange?.(vol);
  };

  const handleMuteToggle = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    onMuteToggle?.();
  };

  return (
    <div className="w-full space-y-2">
      {/* Progress bar */}
      <div className="w-full">
        <Slider
          value={[progress]}
          onValueChange={([value]) => {
            const newTime = startTime + (duration * value / 100);
            onSeek(newTime);
          }}
          min={0}
          max={100}
          step={0.1}
          className="w-full"
        />
      </div>
      
      {/* Control buttons */}
      <div className="flex items-center justify-between bg-gray-100 dark:bg-[#252525] rounded-lg p-2">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="hover:bg-gray-200 dark:hover:bg-[#333333]"
            onClick={onPlayPause}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="hover:bg-gray-200 dark:hover:bg-[#333333]"
            onClick={onReset}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <span className="text-sm">
            {formattedCurrentTime} / {formattedEndTime}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="hover:bg-gray-200 dark:hover:bg-[#333333]"
            onClick={handleMuteToggle}
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
          <div className="w-16">
            <Slider
              value={[isMuted ? 0 : volume]}
              onValueChange={handleVolumeChange}
              min={0}
              max={100}
              step={1}
              className="w-full"
            />
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="hover:bg-gray-200 dark:hover:bg-[#333333]"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}); 