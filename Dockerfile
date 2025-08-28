FROM node:20-alpine

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    curl \
    bash \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    musl-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev \
    pkgconfig \
    make \
    g++

# Install yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Install bun and uv
RUN curl -fsSL https://bun.sh/install | bash
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

ENV PATH="/root/.bun/bin:/root/.local/bin:"

WORKDIR /app

# Copy dependency files
COPY package.json bun.lock* pyproject.toml uv.lock* ./

# Install Python dependencies
RUN uv venv .venv && \
    source .venv/bin/activate && \
    uv pip install pytubefix

# Install Node.js dependencies
RUN bun install

# Copy source code
COPY . .

# Set environment variables for build
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Build the application with verbose output
RUN echo "Starting build process..." && \
    bun run build && \
    echo "Build completed successfully!" && \
    ls -la .next/ && \
    echo "Checking for CSS files..." && \
    find .next/ -name "*.css" -type f

# Expose port
EXPOSE 3000

# Set environment variables
ENV PATH="/app/.venv/bin:"

# Start the application
CMD ["bun", "start"]
