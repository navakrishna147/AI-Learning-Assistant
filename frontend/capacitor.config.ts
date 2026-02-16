import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.navakrishna.ailearning',
  appName: 'AI Learning Assistant',
  webDir: 'dist',
  // Capacitor server configuration for the Android app
  server: {
    // In production APK builds, the app loads from the bundled dist/ assets.
    // During development, you can set androidScheme to http if needed.
    androidScheme: 'https',
  },
  android: {
    // Allow mixed content for API calls during development
    allowMixedContent: true,
    // Build options for Appflow compatibility
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
};

export default config;
