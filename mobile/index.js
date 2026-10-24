import { registerRootComponent } from 'expo';
import App from './App';

// Resolve App from this checkout even when node_modules is shared locally.
registerRootComponent(App);
