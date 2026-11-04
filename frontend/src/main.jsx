import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import AdminApp from './admin/AdminApp.jsx';
import DownloadsPage from './DownloadsPage.jsx';
import './styles.css';

// Простой роутинг без роутера: /admin -> админка, /download -> клиенты.
const path = window.location.pathname.replace(/\/+$/, '') || '/';
let Root = App;
if (path === '/admin') Root = AdminApp;
else if (path === '/download' || path === '/clients') Root = DownloadsPage;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
