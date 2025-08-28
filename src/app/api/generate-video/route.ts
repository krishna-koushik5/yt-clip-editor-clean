import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { ensureFontExists } from '@/lib/fonts';
import { createTextImage } from '@/lib/image-generator';
import { createCanvas } from 'canvas';

// Font registration removed for Docker compatibility - will use system fonts

// Add this new function for dual-color text

async function createDualColorText({
  boldText,
  regularText,
  width,
  fontSize,
  boldColor = '#F9A21B',
  regularColor = '#FFFFFF',
  fontFamily = 'Inter',
  padding = 20,
  swapFontWeights = false
}: {
  boldText: string,
  regularText: string,
  width: number,
  fontSize: number,
  boldColor?: string,
  regularColor?: string,
  fontFamily?: string,
  padding?: number,
  swapFontWeights?: boolean
}): Promise<Buffer> {

  // --- Instagram-style: all lines center-aligned, regular text wraps if needed ---
  let testFontSize = fontSize;
  const minFontSize = 16; // Further reduced from 20 to allow even smaller text for better wrapping and positioning
  const maxWidth = width - (padding * 2);
  // Optionally shrink font if any line is too wide
  const ctxTest = createCanvas(10, 10).getContext('2d');
  // Helper to wrap text into lines with improved wrapping logic
  function wrapText(text: string, fontWeight: string): string[] {
    if (!text) return [];
    ctxTest.font = `${fontWeight} ${testFontSize}px ${fontFamily}`;
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const testLine = currentLine ? currentLine + ' ' + word : word;
      const metrics = ctxTest.measureText(testLine);

      // If adding this word makes the line too long, start a new line
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    // Add the last line if it exists
    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }
  // Shrink font size if any line is too wide - more aggressive reduction for better text fitting
  let boldLines: string[] = [], regularLines: string[] = [];
  while (testFontSize > minFontSize) {
    // First text gets bold font, second text gets thin font
    boldLines = boldText ? wrapText(boldText, '700') : [];
    regularLines = regularText ? wrapText(regularText, '300') : [];

    const tooWide = boldLines.concat(regularLines).some(line => {
      // Determine font weight based on which array the line belongs to
      const isBoldLine = boldLines.includes(line);
      const fontWeight = isBoldLine ? '700' : '300';
      ctxTest.font = `${fontWeight} ${testFontSize}px ${fontFamily}`;
      return ctxTest.measureText(line).width > maxWidth;
    });
    if (!tooWide) break;
    testFontSize -= 4; // Increased from 3 to 4 for even more aggressive font size reduction for longer text
  }
  // Calculate total height with improved line spacing
  const totalLines = boldLines.length + regularLines.length;
  // Increased line height multiplier for better text separation and descender support
  const lineHeight = testFontSize * 1.6; // Increased from 1.3 to 1.6 for better spacing
  const canvas = createCanvas(width, totalLines * lineHeight + padding * 2);
  const ctx = canvas.getContext('2d');
  // Change from 'top' to 'alphabetic' to properly handle descenders
  ctx.textBaseline = 'alphabetic';
  let y = padding + testFontSize * 0.8; // Adjust starting position for alphabetic baseline
  // Draw lines (centered) - font weights depend on swapFontWeights parameter
  ctx.textAlign = 'center';

  // The function now properly handles font weights based on the swapFontWeights parameter
  // When swapFontWeights is true: first text gets thin font, second text gets bold font
  // When swapFontWeights is false: first text gets bold font, second text gets thin font

  if (boldLines.length > 0) {
    // Determine font weight for first text based on swapFontWeights
    const firstTextFontWeight = swapFontWeights ? '300' : '700';
    ctx.font = `${firstTextFontWeight} ${testFontSize}px ${fontFamily}`;
    ctx.fillStyle = boldColor;
    boldLines.forEach(line => {
      ctx.fillText(line, width / 2, y);
      y += lineHeight;
    });
  }
  if (regularLines.length > 0) {
    // Determine font weight for second text based on swapFontWeights
    const secondTextFontWeight = swapFontWeights ? '700' : '300';
    ctx.font = `${secondTextFontWeight} ${testFontSize}px ${fontFamily}`;
    ctx.fillStyle = regularColor;
    regularLines.forEach(line => {
      ctx.fillText(line, width / 2, y);
      y += lineHeight;
    });
  }
  const actualHeight = totalLines * lineHeight + padding * 2;
  const finalCanvas = createCanvas(width, actualHeight);
  const finalCtx = finalCanvas.getContext('2d');
  finalCtx.fillStyle = 'transparent';
  finalCtx.fillRect(0, 0, width, actualHeight);
  finalCtx.drawImage(canvas, 0, 0);
  return finalCanvas.toBuffer('image/png');
}

let resolvedFfmpegPath: string | undefined;
try {
  resolvedFfmpegPath = require('ffmpeg-static');
} catch { }
if (!resolvedFfmpegPath || !fsSync.existsSync(resolvedFfmpegPath as string)) {
  const common = ['/usr/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'];
  resolvedFfmpegPath = common.find(p => fsSync.existsSync(p));
}
if (resolvedFfmpegPath) {
  ffmpeg.setFfmpegPath(resolvedFfmpegPath as string);
  console.log('Using ffmpeg at', resolvedFfmpegPath);
} else {
  console.warn('FFmpeg binary not found. Ensure ffmpeg is installed.');
}

export const runtime = 'nodejs';

interface Caption {
  start: string;
  end: string;
  text: string;
}

// Template-specific font configurations
function getTemplateConfig(template: string) {
  switch (template) {
    case '101xfounders':
      return {
        titleFontFamily: 'Inter',
        titleFontWeight: '700',
        captionFontFamily: 'Inter',
        captionFontWeight: '500',
        creditFontFamily: 'Arial', // <-- use Arial or Inter-Thin if available
        creditFontWeight: '100',   // <-- ultra thin
      };
    case '101xbusiness':
      return {
        titleFontFamily: 'Inter',
        titleFontWeight: '700',
        captionFontFamily: 'Inter',
        captionFontWeight: '500',
        creditFontFamily: 'Arial', // <-- use Arial or Inter-Thin if available
        creditFontWeight: '100',   // <-- ultra thin
      };
    case '101xmarketing':
      return {
        titleFontFamily: 'Inter',
        titleFontWeight: '700',
        captionFontFamily: 'Inter',
        captionFontWeight: '500',
        creditFontFamily: 'Arial', // <-- use Arial or Inter-Thin if available
        creditFontWeight: '100',   // <-- ultra thin
      };
    case 'bizzindia':
      return {
        titleFontFamily: 'Inter',
        titleFontWeight: '700',
        captionFontFamily: 'Inter',
        captionFontWeight: '500',
        creditFontFamily: 'Arial', // <-- use Arial or Inter-Thin if available
        creditFontWeight: '100',   // <-- ultra thin
      };
    case 'bestindianpodcasts':
      return {
        titleFontFamily: 'Articulat CF',
        titleFontWeight: '700',
        captionFontFamily: 'Inter',
        captionFontWeight: '500',
        creditFontFamily: 'Arial', // <-- use Arial or Inter-Thin if available
        creditFontWeight: '100',   // <-- ultra thin
      };
    default:
      return {
        titleFontFamily: 'Inter-Medium',
        titleFontWeight: 'normal',
        captionFontFamily: 'Roboto-Medium',
        captionFontWeight: 'normal',
        creditFontFamily: 'Arial', // <-- use Arial or Inter-Thin if available
        creditFontWeight: '100',   // <-- ultra thin
      };
  }
}

// Helper function to download video using simplified Python script
async function downloadVideoWithPytubefix(
  youtubeUrl: string,
  startTime: number,
  endTime: number,
  outputPath: string
): Promise<{ success: boolean; error?: string; resolution?: string }> {
  return new Promise((resolve) => {
    const scriptPath = path.join(process.cwd(), 'scripts', 'download_video.py');

    console.log(`Calling Python script: python3 ${scriptPath} "${youtubeUrl}" ${startTime} ${endTime} "${outputPath}"`);

    const isWindows = process.platform === "win32";
    const venvPython = isWindows
      ? path.join(process.cwd(), ".venv", "Scripts", "python.exe")
      : path.join(process.cwd(), ".venv", "bin", "python");
    const pythonCmd = fsSync.existsSync(venvPython)
      ? venvPython
      : isWindows
        ? "python"
        : "python3";

    const scriptArgs = [
      scriptPath,
      youtubeUrl,
      startTime.toString(),
      endTime.toString(),
      outputPath
    ];

    const python = spawn(pythonCmd, scriptArgs);

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      console.log('PYTHON STDOUT:', data.toString());
      stdout += data.toString();
    });
    python.stderr.on('data', (data) => {
      console.log('PYTHON STDERR:', data.toString());
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdout.trim());
          resolve(result);
        } catch (error) {
          console.error('Failed to parse Python script output:', stdout);
          resolve({
            success: false,
            error: `Failed to parse download result: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
        }
      } else {
        console.error('Python script failed with code:', code);
        console.error('stderr:', stderr);
        resolve({
          success: false,
          error: `Download script failed with exit code ${code}: ${stderr}`
        });
      }
    });
  });
}

// Helper function to get canvas dimensions based on aspect ratio
function getCanvasDimensions(aspectRatio: string): { width: number; height: number } {
  switch (aspectRatio) {
    case '16:9':
      return { width: 2560, height: 1440 }; // Increased from 1920x1080 to 2560x1440 (2K)
    case '1:1':
      return { width: 1440, height: 1440 }; // Increased from 1080x1080 to 1440x1440
    case '4:5':
      return { width: 1440, height: 1800 }; // Increased from 1080x1350 to 1440x1800
    case '3:4':
      return { width: 1440, height: 1920 }; // Increased from 1080x1440 to 1440x1920
    case '9:16':
    default:
      return { width: 1440, height: 2560 }; // Increased from 1080x1920 to 1440x2560 (2K)
  }
}

// Helper function to get video crop and scale settings
function getVideoProcessing(aspectRatio: string): { crop: string; scale: string } {
  switch (aspectRatio) {
    case '16:9':
      return { crop: 'crop=2560:1440', scale: 'scale=2560:-1' }; // Increased to 2K resolution
    case '1:1':
      return { crop: 'crop=1440:1440', scale: 'scale=1440:-1' }; // Increased to 1440p
    case '4:5':
      // Scale to the width and then crop the height
      return { crop: 'crop=1440:1800', scale: 'scale=1440:-1' }; // Increased to 1440p
    case '3:4':
      return { crop: 'crop=1440:1920', scale: 'scale=-1:1440' }; // Increased to 1440p
    case '9:16':
    default:
      // For 9:16, scale to the height and crop the width for maximum quality
      return { crop: 'crop=1440:2560', scale: 'scale=-1:2560' }; // Increased to 2K resolution
  }
}

const generateSrtContent = (captions: Caption[], startTimeOffset: number): string => {
  return captions
    .map((caption, index) => {
      const startSeconds = timeToSeconds(caption.start) - startTimeOffset;
      const endSeconds = timeToSeconds(caption.end) - startTimeOffset;
      const adjustedStart = Math.max(0, startSeconds);
      const adjustedEnd = Math.max(0, endSeconds);
      const srtStart = formatTimestamp(adjustedStart).replace('.', ',');
      const srtEnd = formatTimestamp(adjustedEnd).replace('.', ',');
      return `${index + 1}\n${srtStart} --> ${srtEnd}\n${caption.text}\n`;
    })
    .join('\n');
};

function timeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  try {
    const parts = timeStr.split(':');
    const secondsParts = parts[parts.length - 1].split('.');
    const hours = parts.length > 2 ? parseInt(parts[0], 10) : 0;
    const minutes = parts.length > 1 ? parseInt(parts[parts.length - 2], 10) : 0;
    const seconds = parseInt(secondsParts[0], 10);
    const milliseconds = secondsParts.length > 1 ? parseInt(secondsParts[1].padEnd(3, '0'), 10) : 0;

    return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
  } catch (e) {
    console.error(`Error converting time string "${timeStr}" to seconds:`, e);
    return 0;
  }
}

function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  const wholeSeconds = Math.floor(remainingSeconds);
  const milliseconds = Math.round((remainingSeconds - wholeSeconds) * 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${wholeSeconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

export async function POST(request: NextRequest) {
  const tempDir = path.join('/tmp', `video-gen-${uuidv4()}`);
  let cleanupDone = false;
  try {
    await fs.mkdir(tempDir, { recursive: true });

    const body = await request.json();
    console.log('=== VIDEO GENERATION API DEBUG ===');
    console.log('Received request body:', JSON.stringify(body, null, 2));

    const {
      youtubeUrl,
      startTime: rawStartTime,
      endTime: rawEndTime,
      captions,
      title,
      credit,
      thin_text,
      bold_text,
      boldTitleText,
      regularTitleText,
      titleFontWeightsSwapped,
      template = 'default',
      aspectRatio = '9:16',
      titleFontSize = 35, // Further reduced from 45 to 35 to prevent overlap with longer text
      titleColor = 'white',
      // captionFontSize is now dynamically set below
      captionColor = 'white',
      creditFontSize = 30, // <-- increased from 10 to 30 for better credit visibility
      creditColor = 'white',
      titleFontFamily = 'Inter-Medium',
      captionFontFamily = 'Inter-Medium', // Use Inter-Medium as fallback since NeueHaasDisplayMediu might not be available
      creditsFontFamily = 'Inter-Medium',
      // REMOVE captionStrokeWidth = 0,
      captionStrokeColor = 'black',
      canvasBackgroundColor = 'black',
      titleBold = false,
      titleItalic = false,
      captionBold = false,
      captionItalic = false,
      creditBold = false,
      creditItalic = false,
      // Watermark parameters
      watermarkText,
      watermarkColor = '#FFFFFF',
      watermarkFontSize = 20,
      watermarkFontFamily = 'Inter-Regular',
      watermarkPosition = { x: 50, y: 85 }// Positioned below captions with 10% gap
    } = body;

    console.log('Extracted captions from body:', captions);
    console.log('Captions type:', typeof captions);
    console.log('Captions length:', captions?.length || 0);
    console.log('Captions array:', JSON.stringify(captions, null, 2));
    if (captions && captions.length > 0) {
      console.log('First caption sample:', captions[0]);
      console.log('Last caption sample:', captions[captions.length - 1]);
    }

    // Validate and set default values for startTime and endTime
    const startTime = typeof rawStartTime === 'number' && !isNaN(rawStartTime) && rawStartTime >= 0 ? rawStartTime : 0;
    const endTime = typeof rawEndTime === 'number' && !isNaN(rawEndTime) && rawEndTime > startTime ? rawEndTime : startTime + 30;

    // Get template-specific configurations
    const templateConfig = getTemplateConfig(template);

    // --- MATCH INSTAGRAM REFERENCE LAYOUT ---
    const canvasDimensions = getCanvasDimensions(aspectRatio);
    console.log('=== CANVAS AND ASPECT RATIO DEBUG ===');
    console.log('Requested aspect ratio:', aspectRatio);
    console.log('Canvas dimensions:', canvasDimensions);
    console.log('Canvas width x height:', `${canvasDimensions.width}x${canvasDimensions.height}`);
    // Increase top bar height to 18% for multi-line titles
    const topBarHeight = Math.floor(canvasDimensions.height * 0.37); // 33% for title  35   
    const bottomBarHeight = Math.floor(canvasDimensions.height * 0.16); // 19% for credit  0.19  0.18 
    const availableHeight = canvasDimensions.height - topBarHeight - bottomBarHeight;
    const availableWidth = canvasDimensions.width;
    // Maintain 16:9 aspect ratio for the video
    let videoWidth = Math.floor(availableWidth * 0.9);
    let videoHeight = Math.floor(videoWidth * 16 / 9);
    if (videoHeight > availableHeight) {
      videoHeight = availableHeight;
      videoWidth = Math.floor(videoHeight * 16 / 9);
    }
    // Center the video in the available area
    let videoX = Math.floor((availableWidth - videoWidth) / 2);
    let videoY = topBarHeight + Math.floor((availableHeight - videoHeight) / 2);


    // Title: center-aligned, placed just above the video, dynamically positioned so all lines are above the video
    let titleImageBuffer: Buffer | undefined = undefined;
    let titleImageActualHeight = titleFontSize * 1.2;
    let titlePosition: { x: number; y: number; width: number; height: number };
    // Ensure title width fits within video boundaries with proper margins
    const titleImageWidth = Math.min(videoWidth, Math.floor(canvasDimensions.width * 0.85)); // Max 85% of canvas width
    if (template === '101xfounders' || template === '101xbusiness' || template === '101xmarketing' || template === 'bizzindia' || template === 'bestindianpodcasts') {
      const boldText = boldTitleText || bold_text || '';
      const regularText = regularTitleText || thin_text || '';
      if (!boldText && !regularText) {
        titleImageBuffer = await createTextImage({
          text: ' ',
          width: titleImageWidth,
          fontSize: titleFontSize,
          fontColor: 'transparent',
          fontFamily: templateConfig.titleFontFamily,
          fontWeight: templateConfig.titleFontWeight,
          fontStyle: titleItalic ? 'italic' : 'normal',
        });
      } else {
        // Use dynamic colors based on template
        let boldColor, regularColor;
        if (template === '101xfounders') {
          boldColor = '#F9A21B';      // Orange
          regularColor = '#FFFFFF';    // White
        } else if (template === '101xbusiness') {
          boldColor = '#1D6CF2';      // Blue
          regularColor = '#FEFFFF';    // Light blue/white
        } else if (template === '101xmarketing') {
          boldColor = '#3AA946';      // Green
          regularColor = '#FEFFFF';    // Light blue/white
        } else if (template === 'bizzindia') {
          boldColor = '#0095FA';      // Blue
          regularColor = '#FEFFFF';    // Light blue/white
        } else if (template === 'bestindianpodcasts') {
          boldColor = '#FFF200';      // Bright yellow
          regularColor = '#FEFFFF';    // Light blue/white
        }
        // When swapped, we need to swap both colors AND font weights
        // The createDualColorText function now handles font weight swapping internally
        // But we still need to swap the colors when the swap is enabled
        let finalBoldColor = boldColor;
        let finalRegularColor = regularColor;

        if (titleFontWeightsSwapped) {
          // Swap colors: first text gets second color, second text gets first color
          finalBoldColor = regularColor;
          finalRegularColor = boldColor;
        }

        titleImageBuffer = await createDualColorText({
          boldText,
          regularText,
          width: titleImageWidth,
          fontSize: titleFontSize,
          boldColor: finalBoldColor,
          regularColor: finalRegularColor,
          fontFamily: templateConfig.titleFontFamily,
          padding: 0,
          swapFontWeights: titleFontWeightsSwapped
        });
      }
    } else {
      const effectiveTitle = title || '';
      if (!effectiveTitle || effectiveTitle.trim() === '') {
        titleImageBuffer = await createTextImage({
          text: ' ',
          width: titleImageWidth,
          fontSize: titleFontSize,
          fontColor: 'transparent',
          fontFamily: templateConfig.titleFontFamily,
          fontWeight: titleBold ? 'bold' : templateConfig.titleFontWeight,
          fontStyle: titleItalic ? 'italic' : 'normal',
        });
      } else {
        titleImageBuffer = await createTextImage({
          text: effectiveTitle,
          width: titleImageWidth,
          fontSize: titleFontSize,
          fontColor: titleColor,
          fontFamily: templateConfig.titleFontFamily,
          fontWeight: titleBold ? 'bold' : templateConfig.titleFontWeight,
          fontStyle: titleItalic ? 'italic' : 'normal',
        });
      }
    }
    // Write the title image to disk and get its actual height
    const titleImagePath = path.join(tempDir, 'title.png');
    if (titleImageBuffer) {
      await fs.writeFile(titleImagePath, titleImageBuffer);
      // Get actual height using image-size
      try {
        const sizeOf = require('image-size');
        const { height } = sizeOf(titleImageBuffer);
        if (height && typeof height === 'number') {
          titleImageActualHeight = height;
        }
      } catch (e) {
        // fallback to default
      }
    }
    // Dynamically ensure the entire title block is above the video, even for many lines
    // If the title block is too tall, increase the top bar height so the video is pushed down
    // Calculate dynamic gap based on actual text height for optimal spacing
    // Much larger gap to ensure text stays completely above video with no overlap
    const minGap = 180; // Increased from 150px to 180px to ensure no overlap even with longer text
    const dynamicGap = Math.max(minGap, Math.floor(titleImageActualHeight * 0.7)); // Increased from 60% to 70% for much better separation
    // Ensure much larger top bar to give text plenty of space above video
    let newTopBarHeight = Math.max(Math.floor(canvasDimensions.height * 0.28), titleImageActualHeight + dynamicGap + 80);
    const availHeightForVideo = canvasDimensions.height - newTopBarHeight - bottomBarHeight;
    let adjustedVideoWidth = videoWidth;
    let adjustedVideoHeight = Math.floor(adjustedVideoWidth * 9 / 16);
    if (adjustedVideoHeight > availHeightForVideo) {
      adjustedVideoHeight = availHeightForVideo;
      adjustedVideoWidth = Math.floor(adjustedVideoHeight * 16 / 9);
    }
    const adjustedVideoX = Math.floor((canvasDimensions.width - adjustedVideoWidth) / 2);
    const adjustedVideoY = newTopBarHeight + Math.floor((availHeightForVideo - adjustedVideoHeight) / 2);
    // Place the title block with dynamic positioning based on actual text height
    // The gap is now proportional to text height, ensuring proper spacing regardless of content length
    // Center the title within the available width and ensure it doesn't extend beyond boundaries
    // Add extra safety margin to ensure text is completely above video
    const titleX = Math.floor((canvasDimensions.width - titleImageWidth) / 2);
    const safetyMargin = 30; // Additional safety margin to prevent any overlap
    titlePosition = {
      x: titleX,
      y: adjustedVideoY - titleImageActualHeight - dynamicGap - safetyMargin,
      width: titleImageWidth,
      height: titleImageActualHeight
    };

    // Debug text positioning to ensure proper spacing
    console.log('=== TEXT POSITIONING DEBUG ===');
    console.log('Title positioning:', {
      dynamicGap,
      safetyMargin,
      titleImageActualHeight,
      adjustedVideoY,
      titleY: titlePosition.y,
      videoTopEdge: adjustedVideoY,
      spaceBetween: adjustedVideoY - (titlePosition.y + titleImageActualHeight),
      gapPercentage: Math.round((dynamicGap / titleImageActualHeight) * 100) + '%',
      totalSeparation: dynamicGap + safetyMargin
    });
    console.log('Text should be fully visible with NO OVERLAP - Dynamic gap:', dynamicGap, 'px + Safety margin:', safetyMargin, 'px = Total separation:', dynamicGap + safetyMargin, 'px');
    console.log('Font size reduced to 35px + aggressive reduction for longer text to prevent overlap');
    // Use adjustedVideoX, adjustedVideoY, adjustedVideoWidth, adjustedVideoHeight for overlays below
    videoWidth = adjustedVideoWidth;
    videoHeight = adjustedVideoHeight;
    videoX = adjustedVideoX;
    videoY = adjustedVideoY;

    // Credit: left-aligned, font size 30, positioned right below the video frame
    const creditFontSizeFinal = creditFontSize;
    const creditHeight = creditFontSizeFinal * 1.2;
    const creditPosition = {
      x: 0,
      y: videoY + videoHeight + 5, // <-- reduced to 5px for "just right below" positioning
      width: canvasDimensions.width,
      height: creditHeight
    };

    // Captions: STRICTLY constrained to video frame only
    // Use video dimensions as the absolute maximum for captions
    const captionWidth = Math.min(
      Math.floor(videoWidth * 0.8), // 80% of video width max (reduced from 90%)
      Math.floor(canvasDimensions.width * 0.7) // But not more than 70% of canvas (reduced from 80%)
    );

    // Dynamically set font size based on video height (not canvas)
    const captionFontSize = Math.max(28, Math.floor(videoHeight * 0.05)); // Reduced font size
    const captionStrokeWidth = 2.0;

    // Strict height constraint - never exceed video boundaries
    const captionHeight = Math.min(
      Math.floor(videoHeight * 0.2), // Max 20% of video height (reduced from 25%)
      Math.floor(canvasDimensions.height * 0.1) // And not more than 10% of canvas (reduced from 12%)
    );

    // Ensure captions are positioned within the video frame boundaries
    // Captions should ONLY appear within the video frame, not in the black background areas
    const captionX = Math.floor((canvasDimensions.width - captionWidth) / 2);

    // Position captions at the bottom of the video frame with proper spacing
    // Ensure captions don't overlap with title by checking minimum distance
    const minCaptionDistance = 40; // Minimum distance from video bottom edge
    const captionY = videoY + videoHeight - captionHeight - minCaptionDistance; // Ensure proper spacing from video bottom

    // Ensure captions don't extend beyond video boundaries
    const finalCaptionX = Math.max(videoX, Math.min(captionX, videoX + videoWidth - captionWidth));
    const finalCaptionY = Math.max(videoY, Math.min(captionY, videoY + videoHeight - captionHeight));

    const captionPosition = {
      // Ensure caption stays within video frame horizontally
      x: finalCaptionX,
      // Ensure caption stays within video frame vertically
      y: finalCaptionY,
      // Limit width to fit within video frame
      width: Math.min(captionWidth, videoWidth),
      // Limit height to fit within video frame
      height: Math.min(captionHeight, videoHeight - 30) // Leave 30px margin from video edges
    };
    console.log('=== CAPTION POSITIONING DEBUG ===');
    console.log('Caption positioning:', {
      videoX, videoY, videoWidth, videoHeight,
      adjustedVideoX, adjustedVideoY, adjustedVideoWidth, adjustedVideoHeight,
      captionWidth, captionHeight,
      captionPosition,
      canvasDimensions
    });
    console.log('Caption will be placed at:', {
      x: captionPosition.x,
      y: captionPosition.y,
      'relative to canvas': `${captionPosition.x}/${canvasDimensions.width} x ${captionPosition.y}/${canvasDimensions.height}`,
      'percentage': `${Math.round((captionPosition.x / canvasDimensions.width) * 100)}% x ${Math.round((captionPosition.y / canvasDimensions.height) * 100)}%`
    });
    console.log('Caption boundary checks:', {
      'caption bottom edge': captionPosition.y + captionHeight,
      'video bottom edge': videoY + videoHeight,
      'caption right edge': captionPosition.x + captionWidth,
      'video right edge': videoX + videoWidth,
      'caption left edge': captionPosition.x,
      'video left edge': videoX,
      'caption top edge': captionPosition.y,
      'video top edge': videoY,
      'caption fits within video': (captionPosition.y + captionHeight <= videoY + videoHeight) &&
        (captionPosition.x + captionWidth <= videoX + videoWidth) &&
        (captionPosition.x >= videoX) &&
        (captionPosition.y >= videoY)
    });

    // Final safety check: if captions still extend beyond video, force them inside
    if (captionPosition.x < videoX || captionPosition.y < videoY ||
      captionPosition.x + captionPosition.width > videoX + videoWidth ||
      captionPosition.y + captionPosition.height > videoY + videoHeight) {
      console.warn('Caption positioning corrected to stay within video boundaries');
      captionPosition.x = Math.max(videoX, Math.min(captionPosition.x, videoX + videoWidth - captionPosition.width));
      captionPosition.y = Math.max(videoY, Math.min(captionPosition.y, videoY + videoHeight - captionPosition.height));
    }

    // HARD BOUNDARY ENFORCEMENT - Ensure captions NEVER extend beyond video frame
    const maxCaptionX = videoX + videoWidth - captionPosition.width;
    const maxCaptionY = videoY + videoHeight - captionPosition.height;

    captionPosition.x = Math.max(videoX, Math.min(captionPosition.x, maxCaptionX));
    captionPosition.y = Math.max(videoY, Math.min(captionPosition.y, maxCaptionY));

    // Additional safety: if caption is still too wide/tall, shrink it
    if (captionPosition.width > videoWidth) {
      captionPosition.width = videoWidth - 40; // Leave 40px margin (increased from 20px)
      captionPosition.x = videoX + 20; // Center with 20px margin (increased from 10px)
    }
    if (captionPosition.height > videoHeight) {
      captionPosition.height = videoHeight - 60; // Leave 60px margin (increased from 40px)
      captionPosition.y = videoY + 30; // Center with 30px margin (increased from 20px)
    }

    // FINAL HARD CONSTRAINT: Ensure captions are NEVER larger than video frame
    captionPosition.width = Math.min(captionPosition.width, videoWidth - 40);
    captionPosition.height = Math.min(captionPosition.height, videoHeight - 60);

    // Ensure positioning is always within safe boundaries
    captionPosition.x = Math.max(videoX + 20, Math.min(captionPosition.x, videoX + videoWidth - captionPosition.width - 20));
    captionPosition.y = Math.max(videoY + 30, Math.min(captionPosition.y, videoY + videoHeight - captionPosition.height - 30));
    // --- END MATCH INSTAGRAM REFERENCE LAYOUT ---

    // Output paths
    const finalVideoName = `final-${uuidv4()}.mp4`;
    const outputPath = path.join(process.cwd(), 'public', 'videos', finalVideoName);
    const downloadedVideoPath = path.join(tempDir, 'downloaded.mp4');

    // Download video
    const downloadResult = await downloadVideoWithPytubefix(youtubeUrl, startTime, endTime, downloadedVideoPath);
    if (!downloadResult.success) {
      throw new Error(downloadResult.error || 'Failed to download video');
    }

    // Analyze video (optional, can add ffprobe logic here if needed)

    // Prepare captions
    let validatedCaptions: Caption[] = [];
    console.log('=== CAPTION VALIDATION DEBUG ===');
    console.log('Raw captions received:', captions);
    console.log('Captions type:', typeof captions);
    console.log('Captions length:', captions?.length || 0);

    if (captions && captions.length > 0) {
      const clipDuration = endTime - startTime;
      console.log('Clip timing:', { startTime, endTime, clipDuration });
      console.log('Processing captions:', { captions, clipDuration, startTime, endTime });

      validatedCaptions = captions.filter((caption: Caption) => {
        console.log('=== VALIDATING CAPTION ===');
        console.log('Raw caption:', caption);
        console.log('Caption start string:', caption.start);
        console.log('Caption end string:', caption.end);

        const captionStart = timeToSeconds(caption.start) - startTime;
        const captionEnd = timeToSeconds(caption.end) - startTime;

        console.log('Time conversion results:', {
          'timeToSeconds(caption.start)': timeToSeconds(caption.start),
          'timeToSeconds(caption.end)': timeToSeconds(caption.end),
          'captionStart (relative)': captionStart,
          'clipDuration': clipDuration
        });

        const isValid = captionStart >= 0 && captionEnd <= clipDuration && captionStart < captionEnd;

        console.log('Validation result:', {
          'captionStart >= 0': captionStart >= 0,
          'captionEnd <= clipDuration': captionEnd <= clipDuration,
          'captionStart < captionEnd': captionStart < captionEnd,
          'isValid': isValid
        });

        // TEMPORARILY DISABLE VALIDATION TO TEST
        console.log('TEMPORARILY BYPASSING VALIDATION - ACCEPTING ALL CAPTIONS');

        // TEMPORARILY ADD TEST CAPTIONS TO DEBUG TIMING
        if (captions && captions.length > 0) {
          console.log('=== TEST CAPTION TIMING ===');
          console.log('Original captions:', captions);
          console.log('First caption timing:', captions[0]);
          console.log('timeToSeconds test:', {
            'start': timeToSeconds(captions[0].start),
            'end': timeToSeconds(captions[0].end),
            'start string': captions[0].start,
            'end string': captions[0].end
          });
        }

        console.log(`Caption "${caption.text}" VALIDATED and ACCEPTED`);
        return true; // Accept all captions for testing
      });
      console.log('Validated captions:', validatedCaptions);
    } else {
      console.log('No captions provided or empty array');
    }

    // ...title image is now generated and written above, with dynamic height and position...

    // Generate credit image
    const creditImagePath = path.join(tempDir, 'credit.png');
    if (!credit || credit.trim() === '') {
      const blankCreditBuffer = await createTextImage({
        text: ' ',
        width: creditPosition.width,
        fontSize: creditFontSize,
        fontColor: 'transparent',
        fontFamily: templateConfig.creditFontFamily,
        textAlign: 'left',
        fontWeight: creditBold ? 'bold' : templateConfig.creditFontWeight,
        fontStyle: creditItalic ? 'italic' : 'normal',
      });
      await fs.writeFile(creditImagePath, blankCreditBuffer);
    } else {
      const creditText = credit.startsWith('Credit: ') ? credit : `Credit: ${credit}`;
      const creditImageBuffer = await createTextImage({
        text: creditText,
        width: creditPosition.width,
        fontSize: 24, // <-- small but readable
        fontColor: 'white',
        fontFamily: templateConfig.creditFontFamily, // e.g., 'Arial' or 'Inter'
        textAlign: 'left',
        fontWeight: 'normal', // <-- normal weight
        fontStyle: creditItalic ? 'italic' : 'normal',
      });
      await fs.writeFile(creditImagePath, creditImageBuffer);
    }

    // Generate caption images
    const captionImages: Array<{ path: string; startTime: number; endTime: number; text: string }> = [];
    console.log('=== CAPTION IMAGE GENERATION DEBUG ===');
    console.log('Validated captions count:', validatedCaptions.length);

    if (validatedCaptions.length > 0) {
      console.log('Starting to generate caption images...');
      console.log(`Loop will execute ${validatedCaptions.length} times`);

      for (let i = 0; i < validatedCaptions.length; i++) {
        const caption = validatedCaptions[i];
        console.log(`=== LOOP ITERATION ${i + 1}/${validatedCaptions.length} ===`);
        console.log(`Generating caption ${i + 1}:`, caption);

        const captionImagePath = path.join(tempDir, `caption_${i}.png`);
        console.log(`Caption image path: ${captionImagePath}`);

        try {
          console.log(`Generating caption image for: "${caption.text}"`);
          console.log(`Caption image settings:`, {
            width: captionPosition.width,
            fontSize: captionFontSize,
            fontColor: captionColor,
            fontFamily: captionFontFamily,
            strokeWidth: captionStrokeWidth,
            strokeColor: captionStrokeColor
          });

          const captionImageBuffer = await createTextImage({
            text: caption.text,
            width: captionPosition.width,
            fontSize: captionFontSize,
            fontColor: captionColor,
            fontFamily: captionFontFamily,
            strokeWidth: captionStrokeWidth,
            strokeColor: captionStrokeColor,
            textAlign: 'center',
            fontWeight: 'bold', // <-- force bold subtitles
            fontStyle: captionItalic ? 'italic' : 'normal',
          });

          console.log(`Caption image buffer created: ${captionImageBuffer.length} bytes`);

          // CRITICAL DEBUG: Check if the image buffer is valid
          if (captionImageBuffer.length === 0) {
            console.error(`ERROR: Caption image buffer is empty for caption: ${caption.text}`);
            throw new Error('Empty caption image buffer');
          }

          await fs.writeFile(captionImagePath, captionImageBuffer);
          console.log(`Caption image saved to disk: ${captionImagePath}`);

          // The SRT timestamps are relative times within the clip (0.10s, 1.80s, etc.)
          // These should be used directly as they represent timing within the clip
          console.log(`Processing caption timing for: "${caption.text}"`);
          console.log(`Original SRT times: start="${caption.start}", end="${caption.end}"`);

          const captionStart = timeToSeconds(caption.start);
          const captionEnd = timeToSeconds(caption.end);

          console.log(`Converted to seconds: start=${captionStart}s, end=${captionEnd}s`);

          // Use the caption times directly as they're already relative to clip start
          // Ensure timing is within clip bounds
          const adjustedStart = Math.max(0, captionStart);
          const adjustedEnd = Math.min(endTime - startTime, captionEnd);

          console.log(`Final adjusted timing: start=${adjustedStart}s, end=${adjustedEnd}s`);

          console.log(`Caption timing calculation:`, {
            'SRT start': caption.start,
            'SRT end': caption.end,
            'caption start': captionStart,
            'caption end': captionEnd,
            'clip duration': endTime - startTime,
            'final start': adjustedStart,
            'final end': adjustedEnd
          });

          const captionImageData = {
            path: captionImagePath,
            startTime: adjustedStart,
            endTime: adjustedEnd,
            text: caption.text
          };

          captionImages.push(captionImageData);
          console.log(`Caption ${i + 1} added to array:`, captionImageData);
          console.log(`Current captionImages array length: ${captionImages.length}`);
        } catch (error) {
          console.error(`Error generating caption ${i + 1}:`, error);
          console.error('Error details:', error);
        }
      }
      console.log('Final caption images array:', captionImages);
      console.log('=== CAPTION IMAGES DEBUG ===');
      captionImages.forEach((img, index) => {
        console.log(`Caption ${index + 1}:`, {
          path: img.path,
          startTime: img.startTime,
          endTime: img.endTime,
          text: img.text,
          exists: require('fs').existsSync(img.path)
        });
      });
    } else {
      console.log('No validated captions to process');
      console.log('Validated captions array:', validatedCaptions);
      console.log('Original captions array:', captions);
    }

    // Generate watermark image for ALL presets
    let watermarkImagePath: string | null = null;
    let currentWatermarkText = '';

    // Set watermark text based on template
    switch (template) {
      case '101xfounders':
        currentWatermarkText = '@101xfounders';
        break;
      case '101xbusiness':
        currentWatermarkText = '@101xbusiness';
        break;
      case '101xmarketing':
        currentWatermarkText = '@101xmarketing';
        break;
      case 'bizzindia':
        currentWatermarkText = '@bizzindia';
        break;
      case 'bestindianpodcasts':
        currentWatermarkText = '@bestindianpodcasts';
        break;
      case 'indianfoundersco':
        currentWatermarkText = '@indianfoundersco';
        break;
      case 'bip':
        currentWatermarkText = '@bip';
        break;
      case 'lumenlinks':
        currentWatermarkText = '@lumenlinks';
        break;
      case 'goodclipsmatter':
        currentWatermarkText = '@goodclipsmatter';
        break;
      case 'jabwewatched':
        currentWatermarkText = '@jabwewatched';
        break;
      default:
        currentWatermarkText = '@101xfounders';
    }

    try {
      console.log(`Generating ${currentWatermarkText} watermark image...`);
      const watermarkBuffer = await createTextImage({
        text: currentWatermarkText,
        width: 300,
        fontSize: 24,
        fontColor: '#FFFFFF',
        fontFamily: 'Ebrima',
        fontWeight: 'normal',
        fontStyle: 'normal',
      });

      watermarkImagePath = path.join(tempDir, 'watermark.png');
      await fs.writeFile(watermarkImagePath, watermarkBuffer);
      console.log(`Watermark image saved to disk: ${watermarkImagePath}`);
    } catch (error) {
      console.error('Error generating watermark:', error);
      watermarkImagePath = null;
    }



    // FFmpeg processing
    await new Promise<void>((resolve, reject) => {
      const duration = endTime - startTime;
      const videoProcessing = getVideoProcessing(aspectRatio);

      console.log('=== FFMPEG COMMAND CONSTRUCTION ===');
      console.log('Duration:', duration);
      console.log('Caption images count:', captionImages.length);

      // Build the complete filter chain step by step
      const filters = [];

      // Step 1: Process the main video with ULTRA HIGH QUALITY scaling and processing
      // Use high-quality scaling algorithms and maintain original quality as much as possible
      filters.push(`[0:v]scale=${adjustedVideoWidth}:${adjustedVideoHeight}:force_original_aspect_ratio=increase:flags=lanczos+accurate_rnd+full_chroma_int+full_chroma_inp:param0=1.5:param1=1.5,crop=${adjustedVideoWidth}:${adjustedVideoHeight},setsar=1:1[processed_video]`);

      // Step 2: Create background canvas
      filters.push(`color=c=${canvasBackgroundColor.replace('#', '')}:s=${canvasDimensions.width}x${canvasDimensions.height}:d=${duration}[bg]`);

      // Step 3: Overlay video on background
      filters.push(`[bg][processed_video]overlay=${adjustedVideoX}:${adjustedVideoY}[base]`);

      // Step 4: Overlay title
      filters.push(`[base][1:v]overlay=${titlePosition.x}:${titlePosition.y}[with_title]`);

      // Step 5: Overlay credit
      filters.push(`[with_title][2:v]overlay=${creditPosition.x}:${creditPosition.y}[with_credits]`);

      // Step 6: Chain caption overlays with proper timing
      let currentStream = 'with_credits';

      if (captionImages.length > 0) {
        console.log('Building timed caption overlay chain...');
        console.log('Caption images to overlay:', captionImages.length);
        console.log('Caption position:', captionPosition);

        if (captionImages.length === 1) {
          // Single caption - overlay with timing
          const captionImg = captionImages[0];
          const inputIndex = watermarkImagePath ? 4 : 3; // Account for watermark input

          // Ensure FFmpeg overlay coordinates are within video boundaries
          const overlayX = Math.max(adjustedVideoX, Math.min(captionPosition.x, adjustedVideoX + adjustedVideoWidth - captionPosition.width));
          const overlayY = Math.max(adjustedVideoY, Math.min(captionPosition.y, adjustedVideoY + adjustedVideoHeight - captionPosition.height));

          const overlayFilter = `[${currentStream}][${inputIndex}:v]overlay=${overlayX}:${overlayY}:enable='between(t,${captionImg.startTime},${captionImg.endTime})'[with_captions]`;
          console.log('Single caption overlay with timing:', overlayFilter);
          console.log('Single caption details:', {
            text: captionImg.text,
            startTime: captionImg.startTime,
            endTime: captionImg.endTime,
            position: `${captionPosition.x},${captionPosition.y}`,
            'FFmpeg overlay position': `${overlayX},${overlayY}`,
            'Video boundaries': `${adjustedVideoX},${adjustedVideoY} to ${adjustedVideoX + adjustedVideoWidth},${adjustedVideoY + adjustedVideoHeight}`
          });
          filters.push(overlayFilter);
          currentStream = 'with_captions';
        } else {
          // Multiple captions - overlay them with proper timing using enable parameter
          captionImages.forEach((captionImg, index) => {
            const inputIndex = (watermarkImagePath ? 4 : 3) + index; // Account for watermark input
            const isLastCaption = index === captionImages.length - 1;
            const nextStream = isLastCaption ? 'with_captions' : `with_caption_${index}`;

            // Ensure FFmpeg overlay coordinates are within video boundaries
            const overlayX = Math.max(adjustedVideoX, Math.min(captionPosition.x, adjustedVideoX + adjustedVideoWidth - captionPosition.width));
            const overlayY = Math.max(adjustedVideoY, Math.min(captionPosition.y, adjustedVideoY + adjustedVideoHeight - captionPosition.height));

            // Use enable parameter to show caption only during its specific time range
            const overlayFilter = `[${currentStream}][${inputIndex}:v]overlay=${overlayX}:${overlayY}:enable='between(t,${captionImg.startTime},${captionImg.endTime})'[${nextStream}]`;

            console.log(`Caption ${index + 1} overlay with timing:`, {
              inputIndex,
              currentStream,
              nextStream,
              text: captionImg.text,
              startTime: captionImg.startTime,
              endTime: captionImg.endTime,
              position: `${captionPosition.x},${captionPosition.y}`,
              'FFmpeg overlay position': `${overlayX},${overlayY}`,
              filter: overlayFilter
            });

            filters.push(overlayFilter);
            currentStream = nextStream;
          });
        }
      } else {
        console.log('No captions to overlay, connecting directly to final output');
        console.log('Caption images array is empty or undefined');
        console.log('Validated captions count:', validatedCaptions.length);
        filters.push(`[${currentStream}]null[with_captions]`);
        currentStream = 'with_captions';
      }

      // Add watermark overlay for all presets - SIMPLE!
      if (watermarkImagePath) {
        let watermarkText = '';
        let watermarkColor = '#FFFFFF';

        // Set watermark text and color based on template
        switch (template) {
          case '101xfounders':
            watermarkText = '@101xfounders';
            break;
          case '101xbusiness':
            watermarkText = '@101xbusiness';
            break;
          case '101xmarketing':
            watermarkText = '@101xmarketing';
            break;
          case 'bizzindia':
            watermarkText = '@bizzindia';
            break;
          case 'bestindianpodcasts':
            watermarkText = '@bestindianpodcasts';
            break;
          case 'indianfoundersco':
            watermarkText = '@indianfoundersco';
            break;
          case 'bip':
            watermarkText = '@bip';
            break;
          case 'lumenlinks':
            watermarkText = '@lumenlinks';
            break;
          case 'goodclipsmatter':
            watermarkText = '@goodclipsmatter';
            break;
          case 'jabwewatched':
            watermarkText = '@jabwewatched';
            break;
          default:
            watermarkText = '@101xfounders'; // Default fallback
        }

        console.log(`Adding ${watermarkText} watermark overlay...`);

        // Position watermark 8% above the bottom edge of the video frame
        const watermarkX = Math.floor((canvasDimensions.width - 300) / 2); // Center horizontally
        // Position watermark 8% above the bottom edge of the video frame
        const watermarkY = videoY + videoHeight - Math.floor(videoHeight * 0.08); // 8% above video bottom edge

        // Simple overlay - just like captions!
        filters.push(`[${currentStream}][3:v]overlay=${watermarkX}:${watermarkY}[final_output]`);
        currentStream = 'final_output';
      } else {
        currentStream = 'with_captions';
      }



      // Join all filters into a single chain
      const filterchain = filters.join(';');

      console.log('=== FFMPEG FILTER CHAIN DEBUG ===');
      console.log('Total filters:', filters.length);
      console.log('Filter chain:', filterchain);
      console.log('Filter chain length:', filterchain.length);
      console.log('Filter chain preview (first 500 chars):', filterchain.substring(0, 500));

      // Caption images array verification
      console.log('=== CAPTION IMAGES ARRAY ===');
      captionImages.forEach((captionImg, index) => {
        console.log(`Caption ${index + 1}:`, {
          path: captionImg.path,
          startTime: captionImg.startTime,
          endTime: captionImg.endTime,
          text: captionImg.text
        });
      });

      // Build the FFmpeg command with proper input registration
      console.log('=== BUILDING FFMPEG COMMAND ===');
      console.log('Main video path:', downloadedVideoPath);
      console.log('Title image path:', titleImagePath);
      console.log('Credit image path:', creditImagePath);

      // Check if main video file exists and has content
      try {
        const stats = require('fs').statSync(downloadedVideoPath);
        console.log('Main video file size:', stats.size, 'bytes');
        if (stats.size === 0) {
          throw new Error('Main video file is empty');
        }
      } catch (err) {
        console.error('Error checking main video file:', err);
        throw new Error(`Main video file error: ${err}`);
      }

      // Log the expected input structure for debugging
      console.log('=== EXPECTED INPUT STRUCTURE ===');
      console.log('Input 0 (Main video):', downloadedVideoPath, '- Should contain video + audio');
      console.log('Input 1 (Title):', titleImagePath, '- Image only');
      console.log('Input 2 (Credit):', creditImagePath, '- Image only');
      if (watermarkImagePath) {
        console.log('Input 3 (Watermark):', watermarkImagePath, '- Image only');
      }
      console.log('Input 3+ (Captions):', captionImages.map((_, i) => `Input ${3 + i}: Caption ${i + 1}`));

      // Check if the downloaded video file is actually a valid video file
      console.log('=== VIDEO FILE VALIDATION ===');
      const videoFileExtension = path.extname(downloadedVideoPath).toLowerCase();
      console.log('Video file extension:', videoFileExtension);
      const validVideoExtensions = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv'];
      if (!validVideoExtensions.includes(videoFileExtension)) {
        console.warn('Warning: Downloaded file does not have a standard video extension');
      }

      // Additional validation: Check if file is readable and has content
      try {
        const fileContent = require('fs').readFileSync(downloadedVideoPath, { encoding: null });
        console.log('Video file is readable, first 100 bytes:', fileContent.slice(0, 100));
        console.log('Video file total size:', fileContent.length, 'bytes');

        // Check if file starts with common video file signatures
        const fileHeader = fileContent.slice(0, 12);
        const headerHex = fileHeader.toString('hex');
        console.log('File header (hex):', headerHex);

        // Common video file signatures
        if (headerHex.startsWith('000001b3') || headerHex.startsWith('000001ba')) {
          console.log('File appears to be MPEG video');
        } else if (headerHex.startsWith('66747970')) {
          console.log('File appears to be MP4 video');
        } else if (headerHex.startsWith('52494646')) {
          console.log('File appears to be AVI video');
        } else {
          console.warn('File header does not match common video formats');
        }
      } catch (err) {
        console.error('Error reading video file for validation:', err);
      }

      const command = ffmpeg()
        .input(downloadedVideoPath)  // Input 0: Main video (should contain audio)
        .inputOptions([
          `-ss`, `${startTime}`,
          `-t`, `${duration}`,
          '-avoid_negative_ts', 'make_zero'  // Better timestamp handling
        ])
        .input(titleImagePath)      // Input 1: Title image
        .input(creditImagePath);    // Input 2: Credit image

      // Add watermark as input if available
      if (watermarkImagePath) {
        command.input(watermarkImagePath);
        console.log(`Watermark input added: ${watermarkImagePath}`);
      }



      // Add all caption images as inputs
      console.log('=== ADDING CAPTION INPUTS ===');
      console.log(`Total caption images to add: ${captionImages.length}`);

      captionImages.forEach((captionImg, index) => {
        const inputIndex = 3 + index;
        console.log(`Adding caption input ${inputIndex}: ${captionImg.path}`);
        console.log(`Caption ${index + 1} details:`, {
          text: captionImg.text,
          startTime: captionImg.startTime,
          endTime: captionImg.endTime,
          path: captionImg.path,
          exists: require('fs').existsSync(captionImg.path)
        });
        command.input(captionImg.path);
      });

      console.log(`Total inputs registered: ${watermarkImagePath ? 4 + captionImages.length : 3 + captionImages.length}`);

      // Apply the complex filter and set output options
      command
        .complexFilter(filterchain, [currentStream])
        .outputOptions([
          '-map', '0:a?',           // Include audio from main video (with ? to ignore if no audio)
          '-c:a', 'aac',            // Audio codec
          '-b:a', '192k',           // High audio bitrate for better quality
          '-c:v', 'libx264',        // Video codec
          '-b:v', '12M',            // Increased from 8M to 12M for better quality
          '-crf', '16',             // Reduced from 18 to 16 for even higher quality (lower = better)
          '-preset', 'veryslow',    // Changed from 'slow' to 'veryslow' for maximum quality
          '-maxrate', '15M',        // Increased from 10M to 15M
          '-bufsize', '30M',        // Increased from 20M to 30M
          '-pix_fmt', 'yuv420p',    // Ensure compatibility
          '-profile:v', 'high',     // Use high profile for better quality
          '-level', '4.2',          // High level for better compression
          '-movflags', '+faststart', // Optimize for web playback
          '-sn',                    // No subtitles
          '-shortest',              // Ensure output duration matches shortest input
          '-y',                     // Overwrite output file without asking
          '-ignore_unknown'         // Ignore unknown input streams
        ])
        .toFormat('mp4');

      // CRITICAL DEBUG: Log the complete FFmpeg command
      console.log('=== COMPLETE FFMPEG COMMAND ===');
      console.log('Input files:');
      console.log('- Video:', downloadedVideoPath);
      console.log('- Title:', titleImagePath);
      console.log('- Credit:', creditImagePath);
      console.log('- Captions:', captionImages.map(img => img.path));
      console.log('Filter chain:', filterchain);
      console.log('Output:', outputPath);

      // Set up event handlers
      console.log('=== SETTING UP FFMPEG EVENT HANDLERS ===');

      command
        .on('start', (commandLine) => {
          console.log('FFmpeg command started with:', commandLine);
          console.log('=== FFMPEG COMMAND EXECUTION STARTED ===');
        })
        .on('end', () => {
          console.log('FFmpeg processing completed successfully');
          console.log('=== FFMPEG PROCESSING COMPLETED ===');
          resolve(void 0);
        })
        .on('error', (err) => {
          console.error('FFmpeg processing failed:', err);
          console.error('FFmpeg error details:', err);
          console.error('=== FFMPEG ERROR ANALYSIS ===');
          console.error('Error message:', err.message);
          console.error('Error stack:', err.stack);
          reject(new Error(`FFmpeg error: ${err.message}`));
        })
        .on('progress', (progress) => {
          console.log('FFmpeg progress:', progress);
        })
        .on('stderr', (stderrLine) => {
          console.log('FFmpeg stderr:', stderrLine);
          // Log any error-like messages from stderr
          if (stderrLine.toLowerCase().includes('error') || stderrLine.toLowerCase().includes('failed')) {
            console.error('FFmpeg stderr error:', stderrLine);
          }
        })
        .save(outputPath);

      console.log('=== FFMPEG COMMAND EXECUTION STARTED ===');

      // Additional debugging: Log the complete command structure
      console.log('=== COMMAND STRUCTURE DEBUG ===');
      console.log('Main video input index: 0');
      console.log('Title image input index: 1');
      console.log('Credit image input index: 2');
      console.log('Watermark input index: 3 (if exists)');
      console.log('Caption inputs start at index: 3 (or 4 if watermark exists)');
      console.log('Audio mapping: 0:a? (from input 0, ignore if no audio)');
      console.log('Video mapping: from complex filter output');
    });

    cleanupDone = true;
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (err) {
      console.error(`Failed to clean up temp directory ${tempDir}:`, err);
    }

    return NextResponse.json({
      success: true,
      videoUrl: `/videos/${finalVideoName}`
    });
  } catch (error) {
    console.error('Error generating video:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { error: 'Failed to generate video', details: errorMessage },
      { status: 500 }
    );
  } finally {
    if (!cleanupDone && tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (err) {
        console.error(`Failed to clean up temp directory ${tempDir}:`, err);
      }
    }
  }
}