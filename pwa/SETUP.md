# PWA — Setup & Deployment

## Voraussetzungen

- **Node.js** >= 22 (empfohlen: aktuelle LTS)
- **npm** (kommt mit Node.js)

Node.js installieren (falls nicht vorhanden):

```bash
# Option A: nvm (empfohlen)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
nvm install 24
nvm use 24

# Option B: direkt von https://nodejs.org
```

## Lokale Entwicklung

```bash
cd pwa
npm install        # Abhängigkeiten installieren (einmalig)
npm run dev        # Dev-Server starten → http://localhost:4321
npm run proxy      # in einem zweiten Terminal — nötig für PFAF-Anreicherung
```

Der Dev-Server aktualisiert automatisch bei Dateiänderungen (Hot Reload). Ohne `npm run proxy`
funktioniert die App normal, PFAF-Anreicherung (`/api/plant-proxy`) liefert dann aber leere Ergebnisse
statt eines Fehlers — der Dev-Server-Proxy in `astro.config.mjs` findet einfach niemanden auf Port 8787.

### Weitere Befehle

| Befehl              | Beschreibung                          |
|---------------------|---------------------------------------|
| `npm run build`     | Produktions-Build nach `dist/`        |
| `npm run preview`   | Build lokal testen (nach `build`)     |
| `npm run proxy`     | PFAF-Proxy-Server starten (`server/plant-proxy-server.mjs`) |

## Deployment

Zwei unabhängige Teile:

1. **Statischer Build** (`dist/`) — kann von jedem Static-Hosting ausgeliefert werden (eigener Server,
   Netlify, o.ä.). Build-Command `npm run build`, Publish-Verzeichnis `dist`.
2. **PFAF-Proxy** — `server/plant-proxy-server.mjs` muss als eigener, dauerhaft laufender Node-Prozess
   betrieben werden (z.B. via systemd, siehe `plant-proxy.service` auf dem Entwicklungs-VPS). Das Hosting
   davor braucht eine Reverse-Proxy-Regel, die `/api/plant-proxy` an diesen Prozess weiterleitet — lokal
   übernimmt das der `vite.server.proxy`-Eintrag in `astro.config.mjs`, in Produktion z.B. eine
   entsprechende nginx-`location`-Regel.

Ohne den Proxy läuft die App weiter, aber PFAF-Anreicherung liefert keine Daten (siehe oben).

### Automatisches Deployment (GitHub Actions)

`.github/workflows/deploy.yml` baut bei jedem Push auf `main` (oder manuell über *Actions → Deploy →
Run workflow*) und synct `dist/` per rsync über SSH nach `/var/www/permadesignkit.org/` — dasselbe wie
`npm run deploy` auf dem VPS. Den Proxy deployt der Workflow nicht.

Einmalige Einrichtung:

1. Deploy-Key erzeugen (lokal): `ssh-keygen -t ed25519 -f deploy_key -N "" -C github-deploy`
2. `deploy_key.pub` auf dem VPS an `~/.ssh/authorized_keys` des Deploy-Users anhängen.
3. Host-Key holen und mit dem Fingerprint des Servers abgleichen: `ssh-keyscan -t ed25519 <host>`
4. Repository-Secrets anlegen (*Settings → Secrets and variables → Actions*):
   - `VPS_SSH_KEY` — Inhalt von `deploy_key` (privat)
   - `VPS_HOST` — Hostname/IP des VPS
   - `VPS_KNOWN_HOSTS` — Ausgabe von Schritt 3
   - optional `VPS_USER` (Default `root`), `VPS_PORT` (Default `22`)
5. `deploy_key` lokal löschen.

Nicht parallel `npm run deploy` auf dem VPS nutzen — sonst überschreiben sich manueller und
automatischer Deploy gegenseitig.

## Architektur

- **Astro** — Static Site Generator, erzeugt reines HTML/CSS/JS
- **Tailwind CSS** — Utility-first CSS Framework
- **IndexedDB** — Pflanzendaten lokal im Browser (kein Server nötig)
- **Wikidata API** — Pflanzensuche direkt vom Browser (kein Proxy, CORS-frei)
- **PFAF-Proxy** (`server/plant-proxy-server.mjs`) — eigener Node-Prozess, da PFAF keinen direkten
  Browser-Zugriff erlaubt (CORS). NaturaDB-Anreicherung ist aktuell deaktiviert, siehe `ROADMAP.md`
- **jsPDF + svg2pdf.js** — PDF-Export im Browser
- **Service Worker** — Offline-Fähigkeit

Alles bis auf die PFAF-Anreicherung läuft rein im Browser, ohne Server.
