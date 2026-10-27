import type { Metadata } from "next";
import Script from "next/script";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";


const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  title: "SKG Games",
  description: "A growing collection of quick daily games.",
};

const themeBoot = `
(() => {
  try {
    const saved = localStorage.getItem('skg-theme');
    const dark =
      saved === 'dark' ||
      (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);

    document.documentElement.dataset.theme =
      dark ? 'dark' : 'light';
  } catch {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={spaceGrotesk.variable}>
        {children}

        <Script
          id="skg-theme-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: themeBoot,
          }}
        />
      </body>
    </html>
  );
}
