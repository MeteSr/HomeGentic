// Polyfills required by @dfinity/agent in React Native.
// Must be the very first imports before any dfinity package is loaded.
import "react-native-get-random-values"; // crypto.getRandomValues
import "text-encoding";                  // TextEncoder / TextDecoder

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
