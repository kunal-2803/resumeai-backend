import app from './app';

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0'; // Explicitly bind to all interfaces

const port = typeof PORT === "string" ? parseInt(PORT, 10) : PORT;
const server = app.listen(port, HOST, () => {
  console.log(`Server is running on http://${HOST}:${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});
