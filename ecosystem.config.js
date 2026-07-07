// PM2 process manager config — keeps the site running & auto-restarts on the VPS.
// Usage on the server:  pm2 start ecosystem.config.js  &&  pm2 save
module.exports = {
  apps: [
    {
      name: "myglord-portfolio",
      script: "server.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
