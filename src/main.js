/**
 * main.js — Application entry point. Mounts the Svelte App component.
 */
import { mount } from 'svelte';
import App from './lib/components/App.svelte';

mount(App, { target: document.body });
