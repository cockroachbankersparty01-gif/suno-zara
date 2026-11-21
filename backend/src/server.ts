import { createApp } from './app.js';
import { config } from './config.js';

createApp().listen(config.port, () => {
  console.log(`🎶 Suno Zara API on :${config.port} (auth=${config.authMode}, storage=${config.storageDriver}, music=${config.musicProvider})`);
});
