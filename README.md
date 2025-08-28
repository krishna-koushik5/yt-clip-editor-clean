

### Production Deployment

This app is optimized for deployment on Railway:

1. **Connect your GitHub repository**
2. **Railway will auto-detect the Dockerfile**
3. **Automatic builds and deployments**

## Environment Variables

- NODE_ENV: Set to production for deployment
- PORT: Server port (default: 3000)

## Docker

The app includes a Dockerfile that:
- Installs FFmpeg and yt-dlp
- Sets up Python environment
- Builds the Next.js application
- Optimizes for production

## License

MIT License
