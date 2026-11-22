import { config } from '../../config.js';
import { AceStepProvider } from './acestep.js';
import { DeApiProvider } from './deapi.js';
import { MockMusicProvider } from './mock.js';
import type { MusicProvider } from './types.js';

export * from './types.js';

let instance: MusicProvider | undefined;

export function musicProvider(): MusicProvider {
  if (instance) return instance;
  switch (config.musicProvider) {
    case 'mock':
      instance = new MockMusicProvider();
      break;
    case 'acestep':
      instance = new AceStepProvider(config.acestep.url, config.acestep.apiKey || undefined);
      break;
    case 'deapi':
      instance = new DeApiProvider(process.env.DEAPI_API_KEY?.trim() || undefined);
      break;
    default:
      throw new Error(`Unknown MUSIC_PROVIDER "${config.musicProvider}" (use mock, acestep or deapi)`);
  }
  return instance;
}
