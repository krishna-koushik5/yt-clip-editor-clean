#!/usr/bin/env python3
"""
Simple YouTube Video Downloader using yt-dlp
Downloads the highest quality progressive MP4 stream without any processing
"""

import subprocess
import sys
import os
import json
import tempfile
import urllib.request
import socket


def test_network_connectivity():
    """
    Test basic network connectivity to help diagnose issues
    """
    print("Testing network connectivity...", file=sys.stderr)

    # Test DNS resolution
    try:
        socket.gethostbyname("youtube.com")
        print("✓ DNS resolution working", file=sys.stderr)
    except socket.gaierror as e:
        print(f"✗ DNS resolution failed: {e}", file=sys.stderr)
        return False

    # Test basic HTTP connection
    try:
        response = urllib.request.urlopen("https://www.google.com", timeout=10)
        print("✓ Basic HTTP connectivity working", file=sys.stderr)
        response.close()
    except Exception as e:
        print(f"✗ HTTP connectivity failed: {e}", file=sys.stderr)
        return False

    return True


def download_with_ytdlp(url, output_path):
    """
    Download the highest quality available from YouTube URL
    Strategy: Try high-res DASH streams first, fallback to progressive if needed
    Returns True on success, False on failure
    """
    # Use local yt-dlp.exe for Windows
    YTDLP_PATH = (
        os.path.join(os.path.dirname(__file__), "..", "yt-dlp.exe")
        if sys.platform == "win32"
        else "yt-dlp"
    )

    # Always delete the temp file before running yt-dlp
    if os.path.exists(output_path):
        os.remove(output_path)

    # Try multiple download strategies for best quality
    strategies = [
        # Strategy 1: High-res DASH streams (720p+)
        [
            YTDLP_PATH,
            "-f",
            "bestvideo[ext=mp4][height>=720]+bestaudio[ext=m4a]/bestvideo[ext=mp4][height>=480]+bestaudio[ext=m4a]",
            "--merge-output-format",
            "mp4",
            "--no-check-certificates",
            "--user-agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "-o",
            output_path,
            url,
        ],
        # Strategy 2: Best available MP4 with height preference
        [
            YTDLP_PATH,
            "-f",
            "best[ext=mp4][height>=720]/best[ext=mp4][height>=480]/best[ext=mp4]",
            "--no-check-certificates",
            "--user-agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "-o",
            output_path,
            url,
        ],
        # Strategy 3: Fallback to any available format
        [
            YTDLP_PATH,
            "-f",
            "best",
            "--no-check-certificates",
            "--user-agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "-o",
            output_path,
            url,
        ],
    ]

    # Only add --cookies if cookies.txt exists and is a valid Netscape format file
    cookies_path = os.path.join(os.path.dirname(__file__), "..", "cookie.txt")
    cookies_available = False
    if os.path.exists(cookies_path):
        with open(cookies_path, "r", encoding="utf-8", errors="ignore") as f:
            first_line = f.readline().strip()
            if first_line.startswith("# Netscape HTTP Cookie File"):
                cookies_available = True
            else:
                print(
                    "cookies.txt exists but is not a valid Netscape format file, ignoring.",
                    file=sys.stderr,
                )

    # Try each strategy until one works
    for i, strategy in enumerate(strategies):
        print(f"Trying download strategy {i+1}...", file=sys.stderr)

        # Add cookies if available
        if cookies_available:
            strategy.insert(-1, "--cookies")
            strategy.insert(-1, cookies_path)

        # All debug output to stderr
        print("Running command:", " ".join(strategy), file=sys.stderr)
        result = subprocess.run(strategy, capture_output=True, text=True)
        print("yt-dlp stdout:", result.stdout, file=sys.stderr)
        print("yt-dlp stderr:", result.stderr, file=sys.stderr)

        # Check if download was successful
        if (
            result.returncode == 0
            and os.path.exists(output_path)
            and os.path.getsize(output_path) > 1000
        ):
            print(f"Strategy {i+1} succeeded!", file=sys.stderr)
            return True

        print(f"Strategy {i+1} failed, trying next...", file=sys.stderr)
        # Clean up failed attempt
        if os.path.exists(output_path):
            os.remove(output_path)

    print("All download strategies failed", file=sys.stderr)
    return False


def download_with_alternative_method(url, output_path):
    """
    Alternative download method using pytube if yt-dlp fails
    """
    try:
        print("Trying alternative download method with pytube...", file=sys.stderr)

        # Try to import pytube
        try:
            from pytube import YouTube
        except ImportError:
            print("pytube not available, skipping alternative method", file=sys.stderr)
            return False

        # Download video
        yt = YouTube(url)
        stream = (
            yt.streams.filter(progressive=True, file_extension="mp4")
            .order_by("resolution")
            .desc()
            .first()
        )

        if stream:
            print(f"Downloading with pytube: {stream.resolution}", file=sys.stderr)
            stream.download(filename=output_path)

            if os.path.exists(output_path) and os.path.getsize(output_path) > 1000:
                print("Alternative download method succeeded!", file=sys.stderr)
                return True

        return False

    except Exception as e:
        print(f"Alternative download method failed: {e}", file=sys.stderr)
        return False


def get_video_resolution(output_path):
    """
    Get the resolution of the downloaded video using ffprobe
    Returns resolution string like "1080p" or "720p"
    """
    try:
        cmd = [
            "ffprobe",
            "-v",
            "quiet",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=height",
            "-of",
            "csv=s=x:p=0",
            output_path,
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            height = int(result.stdout.strip())
            if height >= 1080:
                return "1080p"
            elif height >= 720:
                return "720p"
            elif height >= 480:
                return "480p"
            else:
                return f"{height}p"
        else:
            return "unknown"
    except:
        return "unknown"


def main():
    if len(sys.argv) < 5:
        print(
            json.dumps(
                {
                    "success": False,
                    "error": "Usage: python download_video.py <url> <start_time> <end_time> <output_path>",
                }
            )
        )
        sys.exit(1)

    url, start_time, end_time, output_path = sys.argv[1:5]

    # Note: start_time and end_time are ignored - Node.js will handle trimming

    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # Test network connectivity
    if not test_network_connectivity():
        print(
            json.dumps(
                {
                    "success": False,
                    "error": "Network connectivity issues detected. Please check your internet connection.",
                }
            )
        )
        sys.exit(1)

    try:
        success = download_with_ytdlp(url, output_path)

        # If yt-dlp failed, try alternative method
        if not success:
            print(
                "yt-dlp failed, trying alternative download method...", file=sys.stderr
            )
            success = download_with_alternative_method(url, output_path)

        # Check if file exists and is at least 1000 bytes
        if (
            not success
            or not os.path.exists(output_path)
            or os.path.getsize(output_path) < 1000
        ):
            print(
                json.dumps(
                    {
                        "success": False,
                        "error": "All download methods failed. See logs above for details.",
                    }
                )
            )
            if os.path.exists(output_path):
                os.remove(output_path)
            sys.exit(1)

        # Get video resolution for reporting
        resolution = get_video_resolution(output_path)

        print(
            json.dumps(
                {"success": True, "resolution": resolution, "output_path": output_path}
            )
        )

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        if os.path.exists(output_path):
            os.remove(output_path)
        sys.exit(1)


if __name__ == "__main__":
    main()
