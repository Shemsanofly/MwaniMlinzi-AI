import '@fontsource-variable/manrope';
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/fraunces/opsz-italic.css';
import 'leaflet/dist/leaflet.css';
import '../src/client/index.css';
import Providers from './providers.jsx';

export const metadata = {
  title: 'MwaniMlinzi AI',
  description: 'MwaniMlinzi AI — seaweed risk, harvest and decision support for Zanzibar. Know the risk. Know the next action.',
  icons: { icon: { url: '/favicon.svg', type: 'image/svg+xml' } },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#051f29',
};

export default function RootLayout({ children }) {
  return (
    <html lang="sw" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
