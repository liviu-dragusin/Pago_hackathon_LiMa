// Modul separat: harta furnizorilor pe județe.
// Se montează în aplicație dintr-un singur loc (main.jsx + Layout.jsx) și depinde doar de
// components/ui, lib/api și lib/format. Datele vin din GET /api/catalog (api/lib/catalog.php).
export { default as ProviderMapPage } from './ProviderMapPage'
export { default as RomaniaMap } from './RomaniaMap'
