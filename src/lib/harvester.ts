// Live, 100% free Business Harvester — Cloudflare-Workers-native.
// Uses OpenStreetMap Nominatim (geocoding) + Overpass API (live POI search).
// NO fake/demo data is ever generated here — every lead returned exists in the real world right now.

export interface RawLead {
  id: string
  businessName: string
  category: string
  city: string
  country: string
  address: string
  phoneRaw: string
  websiteRaw: string
  rating: number
  reviewsCount: number
  googleMapsUrl: string
  source: string
  scrapedAt: string
  lat: number
  lon: number
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
// Public Overpass mirrors are individually rate-limited/flaky, so we try several
// in order (each with its own short timeout) before giving up. overpass-api.de is
// unreachable from some sandbox/edge networks entirely, kept last as a long-shot.
const OVERPASS_URLS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
  'https://overpass-api.de/api/interpreter'
]
const APP_USER_AGENT = 'LeadEnginePROMAX/1.0 (contact: leads@genspark.local)'

// Bilingual keyword -> OSM tag mapping. Broadens recall beyond exact name matches,
// since Arabic/French business names are inconsistently tagged in OSM.
const KEYWORD_TAG_MAP: { matches: string[]; filters: string[] }[] = [
  { matches: ['plumb', 'سباك', 'صرف', 'تسريب', 'plombier'], filters: ['craft=plumber', 'shop=doityourself'] },
  { matches: ['مكيف', 'تكييف', 'hvac', 'climatisation', 'climatiseur'], filters: ['shop=hvac', 'craft=hvac'] },
  { matches: ['كهرب', 'electric', 'électric', 'électricien'], filters: ['craft=electrician', 'shop=electrical'] },
  { matches: ['تنظيف', 'clean', 'ménage', 'nettoyage'], filters: ['shop=laundry', 'craft=cleaning'] },
  { matches: ['حشرات', 'pest', 'nuisibles'], filters: ['craft=pest_control'] },
  { matches: ['أسنان', 'dental', 'dentist', 'dentiste'], filters: ['amenity=dentist'] },
  { matches: ['أجهزة منزلية', 'appliance', 'electroménager', 'électroménager'], filters: ['shop=appliance', 'craft=electronics_repair'] },
  { matches: ['سيارات', 'auto', 'mécanique', 'mechanic', 'garage'], filters: ['shop=car_repair', 'craft=car_repair'] },
  { matches: ['نجار', 'carpenter', 'menuisier'], filters: ['craft=carpenter'] },
  { matches: ['رخام', 'صباغ', 'painter', 'peintre'], filters: ['craft=painter'] }
]

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function geocodeLocation(location: string): Promise<{ lat: number; lon: number; displayName: string } | null> {
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(location)}&format=json&limit=1`
  const resp = await fetch(url, { headers: { 'User-Agent': APP_USER_AGENT } })
  if (!resp.ok) return null
  const data = (await resp.json()) as any[]
  if (!data.length) return null
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), displayName: data[0].display_name }
}

function buildOverpassQuery(keyword: string, lat: number, lon: number, radiusKm: number): string {
  const radiusM = Math.min(Math.max(radiusKm, 1), 50) * 1000
  const kwLower = keyword.toLowerCase()
  const matchedFilters = KEYWORD_TAG_MAP.filter(m => m.matches.some(sub => kwLower.includes(sub)))
    .flatMap(m => m.filters)

  const clauses: string[] = []
  const kwEscaped = escapeRegex(keyword)
  // 1. Direct name/operator regex match on the raw keyword (works well for Arabic business names)
  clauses.push(`nwr(around:${radiusM},${lat},${lon})[~"^(name|name:ar|name:en|name:fr|operator|brand)$"~"${kwEscaped}",i];`)
  // 2. Category tag matches (broadens recall using known trade -> OSM tag dictionary)
  for (const filter of matchedFilters) {
    const [key, value] = filter.split('=')
    clauses.push(`nwr(around:${radiusM},${lat},${lon})["${key}"="${value}"];`)
  }

  return `[out:json][timeout:25];(${clauses.join('')});out center tags 60;`
}

function detectCountry(locFull: string): string {
  const loc = locFull.toLowerCase()
  if (['cairo', 'alexandria', 'giza', 'egypt', 'mansoura', 'مصر', 'القاهرة', 'الإسكندرية', 'الجيزة'].some(c => loc.includes(c))) return 'Egypt'
  if (['riyadh', 'jeddah', 'khobar', 'dammam', 'mecca', 'medina', 'saudi', 'ksa', 'الرياض', 'جدة', 'السعودية'].some(c => loc.includes(c))) return 'Saudi Arabia'
  if (['casablanca', 'rabat', 'marrakech', 'tanger', 'fes', 'agadir', 'maroc', 'morocco', 'المغرب', 'كازا'].some(c => loc.includes(c))) return 'Morocco'
  if (['miami', 'orlando', 'tampa', 'florida', 'usa', 'us', 'texas', 'california', 'new york'].some(c => loc.includes(c))) return 'USA'
  return 'International'
}

export interface HarvestResult {
  leads: RawLead[]
  geocode: { lat: number; lon: number; displayName: string } | null
  radiusKmUsed: number
  overpassElementCount: number
}

export async function harvestLive(
  keyword: string,
  location: string,
  radiusKm: number,
  maxResults: number
): Promise<HarvestResult> {
  const geo = await geocodeLocation(location)
  if (!geo) {
    return { leads: [], geocode: null, radiusKmUsed: radiusKm, overpassElementCount: 0 }
  }

  const query = buildOverpassQuery(keyword, geo.lat, geo.lon, radiusKm)

  // Free public Overpass mirrors are individually flaky/rate-limited, so we race
  // ALL mirrors in parallel and take whichever responds first successfully.
  // This is far faster and more resilient than trying them one at a time.
  async function tryMirror(overpassUrl: string): Promise<any> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      const resp = await fetch(overpassUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'User-Agent': APP_USER_AGENT },
        body: query,
        signal: controller.signal
      })
      if (!resp.ok) throw new Error(`Overpass mirror ${overpassUrl} returned ${resp.status}`)
      return await resp.json()
    } finally {
      clearTimeout(timer)
    }
  }

  let data: any = null
  try {
    data = await Promise.any(OVERPASS_URLS.map(tryMirror))
  } catch {
    data = null // all mirrors failed
  }

  if (!data) {
    return { leads: [], geocode: geo, radiusKmUsed: radiusKm, overpassElementCount: 0 }
  }
  const elements: any[] = data.elements || []
  const locFull = `${keyword} ${location}`.toLowerCase()
  const country = detectCountry(locFull)

  const leads: RawLead[] = []
  for (const el of elements) {
    const tags = el.tags || {}
    const name = tags.name || tags['name:ar'] || tags['name:en'] || tags['name:fr'] || ''
    if (!name) continue

    const lat = el.lat ?? el.center?.lat
    const lon = el.lon ?? el.center?.lon
    if (lat == null || lon == null) continue

    const addrParts = [tags['addr:street'], tags['addr:city'] || location].filter(Boolean)
    const address = tags['addr:full'] || addrParts.join(', ') || location
    const city = tags['addr:city'] || location.split(',')[0].trim()
    const phone = tags.phone || tags['contact:phone'] || ''
    const website = tags.website || tags['contact:website'] || tags['contact:facebook'] || tags['contact:instagram'] || ''

    leads.push({
      id: `osm_${el.type}_${el.id}`,
      businessName: name,
      category: keyword,
      city,
      country,
      address,
      phoneRaw: phone,
      websiteRaw: website,
      rating: 0,
      reviewsCount: 0,
      googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + city)}`,
      source: 'osm_overpass_live',
      scrapedAt: new Date().toISOString(),
      lat,
      lon
    })

    if (leads.length >= maxResults * 3) break // gather extra for dedup filtering downstream
  }

  return { leads, geocode: geo, radiusKmUsed: radiusKm, overpassElementCount: elements.length }
}
