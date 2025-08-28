import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

// Tell Next.js this route must run in a full Node.js runtime
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let tempDir = '';

  try {
    const body = await request.json();
    const { youtubeUrl, startTime, endTime } = body;

    console.log('Received audio extraction request:', { youtubeUrl, startTime, endTime });

    if (!youtubeUrl || startTime === undefined || endTime === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: youtubeUrl, startTime, endTime' },
        { status: 400 }
      );
    }

    // Calculate clip duration
    const clipDuration = endTime - startTime;
    console.log(`Extracting audio from ${startTime}s to ${endTime}s (duration: ${clipDuration}s)`);

    // Create temporary directory for processing
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'audio-extract-'));
    console.log('Created temp directory:', tempDir);

    // Extract video ID from YouTube URL for filename
    const videoIdMatch = youtubeUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    const videoId = videoIdMatch ? videoIdMatch[1] : 'unknown';

    // Step 1: Download full audio using yt-dlp with multiple fallback options
    console.log('Downloading audio with yt-dlp...');
    const ytdlpPath = path.join(process.cwd(), 'yt-dlp.exe');
    const tempAudioFile = path.join(tempDir, `audio_${videoId}.mp3`);

    // Try multiple yt-dlp approaches for better compatibility
    let downloadSuccess = false;
    const downloadAttempts = [
      // Attempt 1: Standard approach
      `"${ytdlpPath}" -x --audio-format mp3 --audio-quality 0 --output "${tempAudioFile}" "${youtubeUrl}"`,
      // Attempt 2: With format selection
      `"${ytdlpPath}" -f "bestaudio[ext=m4a]/bestaudio" --audio-format mp3 --audio-quality 0 --output "${tempAudioFile}" "${youtubeUrl}"`,
      // Attempt 3: With different extractor
      `"${ytdlpPath}" -x --audio-format mp3 --audio-quality 0 --extractor-args "youtube:player_client=android" --output "${tempAudioFile}" "${youtubeUrl}"`,
      // Attempt 4: Force older format
      `"${ytdlpPath}" -f "bestaudio[height<=720]" --audio-format mp3 --audio-quality 0 --output "${tempAudioFile}" "${youtubeUrl}"`,
      // Attempt 5: Use cookies and user agent
      `"${ytdlpPath}" -x --audio-format mp3 --audio-quality 0 --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" --output "${tempAudioFile}" "${youtubeUrl}"`
    ];

    for (let i = 0; i < downloadAttempts.length && !downloadSuccess; i++) {
      try {
        console.log(`Download attempt ${i + 1}...`);
        await execAsync(downloadAttempts[i], { timeout: 120000 }); // 2 minutes per attempt

        if (await fs.promises.access(tempAudioFile).then(() => true).catch(() => false)) {
          downloadSuccess = true;
          console.log(`Download successful with attempt ${i + 1}`);
          break;
        }
      } catch (error) {
        console.log(`Download attempt ${i + 1} failed:`, error);
        continue;
      }
    }

    if (!downloadSuccess) {
      throw new Error('All download attempts failed');
    }

    console.log('Downloaded audio file:', tempAudioFile);

    // Step 2: Extract the specific time segment using ffmpeg
    console.log('Extracting time segment with ffmpeg...');
    const ffmpegPath = path.join(process.cwd(), 'ffmpeg.exe');
    const outputMp3Path = path.join(tempDir, `clip_${startTime}s-${endTime}s.mp3`);

    const trimCommand = `"${ffmpegPath}" -i "${tempAudioFile}" -ss ${startTime} -t ${clipDuration} -c:a libmp3lame -b:a 128k "${outputMp3Path}"`;

    console.log('Executing trim command...');
    await execAsync(trimCommand, { timeout: 30000 }); // 30 second timeout

    // Check if the output file exists
    if (!await fs.promises.access(outputMp3Path).then(() => true).catch(() => false)) {
      throw new Error('Audio trimming failed - no output file created');
    }

    // Read the final MP3 file
    const mp3Buffer = await fs.promises.readFile(outputMp3Path);
    console.log(`MP3 file created: ${mp3Buffer.length} bytes`);

    // Generate filename
    const filename = `audio_clip_${startTime}s-${endTime}s.mp3`;

    // Clean up temporary files
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
      console.log('Temporary files cleaned up');
    } catch (cleanupError) {
      console.warn('Failed to clean up temporary files:', cleanupError);
    }

    // Return the MP3 file as a downloadable response
    return new NextResponse(mp3Buffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': mp3Buffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('Audio extraction error:', error);

    // Clean up temporary files on error
    if (tempDir) {
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn('Failed to clean up temporary files:', cleanupError);
      }
    }

    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { error: 'Failed to extract audio', details: errorMessage },
      { status: 500 }
    );
  }
}