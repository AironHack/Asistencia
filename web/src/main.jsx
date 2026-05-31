import React from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './app.css';
import App from './App.jsx';

createRoot(document.getElementById('app')).render(
  <React.StrictMode>
    <MantineProvider
      defaultColorScheme="light"
      theme={{
        primaryColor: 'blue',
        fontFamily: 'Inter, system-ui, Segoe UI, sans-serif',
        headings: { fontFamily: 'Inter, system-ui, Segoe UI, sans-serif' },
        defaultRadius: 'md'
      }}
    >
      <Notifications position="top-right" />
      <App />
    </MantineProvider>
  </React.StrictMode>
);
