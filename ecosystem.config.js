  module.exports = {
    apps: [{
      name: 'gg-lms-server',
      script: './app.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
        PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: 'true',
        PUPPETEER_EXECUTABLE_PATH: '/home/epladmin/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome',
        PUPPETEER_ARGS: '--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage'
      },
      error_file: '../logs/err.log',
      out_file: '../logs/out.log',
      log_file: '../logs/combined.log',
      time: true,
      merge_logs: true
    }]
  };
