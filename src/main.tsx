import { render } from 'preact';
import { App } from './app';
import { registerServiceWorker } from './lib/sw';
import './styles.css';

render(<App />, document.getElementById('app')!);

void registerServiceWorker();
