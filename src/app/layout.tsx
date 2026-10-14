import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { RegistrarServiceWorker } from "@/components/pwa/registrar-sw";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { AuthProvider } from "@/components/providers/session-provider";
import { obtenerConfiguracion } from "@/lib/configuracion";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  weight: ["500", "600", "700"],
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  weight: ["400", "500"],
});

const TITULO_DEFAULT = "Panel administrativo";

// PWA (issue #39): color de la barra del sistema en el celular / ventana instalada.
export const viewport: Viewport = {
  themeColor: "#132A1F",
};

// Íconos y modo "app" en iPhone. El manifest está en src/app/manifest.ts.
const METADATA_APP: Metadata = {
  applicationName: "Stockea",
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "Stockea", statusBarStyle: "black-translucent" },
};

export async function generateMetadata(): Promise<Metadata> {
  // Si la base no está disponible en el momento del build (ej: build sin
  // DATABASE_URL configurada, o un problema transitorio de conexión), no
  // queremos que se caiga todo el build por un título de pestaña. Usamos un
  // título genérico como fallback.
  try {
    const configuracion = await obtenerConfiguracion();
    return {
      ...METADATA_APP,
      title: `${configuracion.nombreNegocio} · Panel administrativo`,
      description: `Panel de administración para ${configuracion.nombreNegocio}.`,
    };
  } catch {
    return {
      ...METADATA_APP,
      title: TITULO_DEFAULT,
      description: TITULO_DEFAULT,
    };
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <ThemeProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
          <RegistrarServiceWorker />
          <Toaster
            position="top-right"
            toastOptions={{
              classNames: {
                toast:
                  "!bg-surface !text-text !border !border-border !rounded-xl !shadow-2xl",
                title: "!text-sm !font-medium",
                error: "!border-danger/40",
                success: "!border-success/40",
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}