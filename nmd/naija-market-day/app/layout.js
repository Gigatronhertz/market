import '../styles/site.css';
import '../styles/app.css';
import { ToastProvider } from '@/components/Toast';

export const metadata = {
  title: 'Naija Market Day',
  description: 'Markets, vendors, the Market Square and chat with sellers.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" />
      </head>
      <body>
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
