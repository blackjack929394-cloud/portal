import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import AdminApp from './admin/AdminApp.jsx';
import './styles.css';

// Простой роутинг: /admin -> админка, иначе портал.
const path = window.location.pathname.replace(/\/+$/, '') || '/';
const isAdmin = path === '/admin';
const Root = isAdmin ? AdminApp : App;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
