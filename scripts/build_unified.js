const fs = require('fs');
const https = require('https');
const path = require('path');

const SP_DATA_PATH = path.join(__dirname, '..', 'public', 'data', 'spotify_history.json');
const UNIFIED_OUTPUT_PATH = path.join(__dirname, '..', 'public', 'data', 'unified_history.json');

const USER = 'Vrak_23';
const API_KEY = '82a251af624ca33e3d59215313af74c2';

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
            res.on('error', reject);
        });
    });
}

function norm(s) {
    return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function main() {
    console.log('Cargando spotify_history.json...');
    const spRaw = fs.readFileSync(SP_DATA_PATH, 'utf8');
    const spData = JSON.parse(spRaw);

    console.log('Consultando datos de Last.fm (artistas, canciones, álbumes)...');
    const [artistsRes, tracksRes, albumsRes, recentRes] = await Promise.all([
        fetchJson(`https://ws.audioscrobbler.com/2.0/?method=user.gettopartists&user=${USER}&api_key=${API_KEY}&limit=500&format=json`),
        fetchJson(`https://ws.audioscrobbler.com/2.0/?method=user.gettoptracks&user=${USER}&api_key=${API_KEY}&limit=1000&format=json`),
        fetchJson(`https://ws.audioscrobbler.com/2.0/?method=user.gettopalbums&user=${USER}&api_key=${API_KEY}&limit=1000&format=json`),
        fetchJson(`https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${USER}&api_key=${API_KEY}&limit=50&format=json`)
    ]);

    const lfArtists = artistsRes?.topartists?.artist || [];
    const lfTracks = tracksRes?.toptracks?.track || [];
    const lfAlbums = albumsRes?.topalbums?.album || [];
    const lfRecents = recentRes?.recenttracks?.track || [];

    console.log(`Recibidos de Last.fm: ${lfArtists.length} artistas, ${lfTracks.length} canciones, ${lfAlbums.length} álbumes, ${lfRecents.length} recientes.`);

    // Clonar lookups y yearlyTops de Spotify
    const tracksLookup = JSON.parse(JSON.stringify(spData.tracksLookup || {}));
    const artistsLookup = JSON.parse(JSON.stringify(spData.artistsLookup || {}));
    const albumsLookup = JSON.parse(JSON.stringify(spData.albumsLookup || {}));
    const yearlyTops = JSON.parse(JSON.stringify(spData.yearlyTops || {}));

    let totalStreamsAdded = 0;

    // ------------------------------------------------------------------
    // 1. UNIFICACIÓN DE CANCIONES (TRACKS)
    // ------------------------------------------------------------------
    console.log('Unificando canciones...');
    lfTracks.forEach(t => {
        const lfPlays = parseInt(t.playcount, 10);
        if (!lfPlays || lfPlays <= 0) return;

        const tName = t.name;
        const tArtist = t.artist?.name || t.artist?.['#text'] || '';
        const key = `${norm(tName)}:::${norm(tArtist)}`;

        let sp = tracksLookup[key];
        if (!sp) {
            const foundKey = Object.keys(tracksLookup).find(k => k.startsWith(norm(tName) + ':::'));
            if (foundKey) {
                sp = tracksLookup[foundKey];
            }
        }

        if (sp) {
            // Existe en Spotify: comparar escuchas en la época de Last.fm (2026 + Dec 2025)
            const sp2026 = sp.years?.['2026'] || 0;
            const spDec2025 = sp.months?.['2025-12'] || 0;
            const spEra = sp2026 + spDec2025;

            if (lfPlays > spEra) {
                const gap = lfPlays - spEra;
                sp.plays = (sp.plays || 0) + gap;
                sp.gap = (sp.gap || 0) + gap;
                sp.ms = (sp.ms || 0) + (gap * 210000);
                if (!sp.years) sp.years = {};
                sp.years['2026'] = (sp.years['2026'] || 0) + gap;
                totalStreamsAdded += gap;
            }
        } else {
            // No existe en Spotify (escuchado en YouTube u otra plataforma)
            const newEntry = {
                name: tName,
                artist: tArtist,
                album: t.album?.name || t.album?.['#text'] || '',
                plays: lfPlays,
                ms: lfPlays * 210000,
                skips: 0,
                first: '2026-01-01T00:00:00Z',
                last: '2026-10-15T05:00:00Z',
                years: { '2026': lfPlays },
                months: { '2026-10': lfPlays },
                platforms: { 'Last.fm (Otras plataformas)': lfPlays },
                gap: lfPlays,
                uri: null
            };
            tracksLookup[key] = newEntry;
            totalStreamsAdded += lfPlays;
        }
    });

    // ------------------------------------------------------------------
    // 2. UNIFICACIÓN DE ARTISTAS
    // ------------------------------------------------------------------
    console.log('Unificando artistas...');
    lfArtists.forEach(a => {
        const lfPlays = parseInt(a.playcount, 10);
        if (!lfPlays || lfPlays <= 0) return;

        const aName = a.name;
        const key = norm(aName);
        let sp = artistsLookup[key];
        if (!sp) {
            const foundKey = Object.keys(artistsLookup).find(k => k === key || k.includes(key) || key.includes(k));
            if (foundKey) {
                sp = artistsLookup[foundKey];
            }
        }

        if (sp) {
            const sp2026 = sp.years?.['2026'] || 0;
            const spDec2025 = sp.months?.['2025-12'] || 0;
            const spEra = sp2026 + spDec2025;

            if (lfPlays > spEra) {
                const gap = lfPlays - spEra;
                sp.plays = (sp.plays || 0) + gap;
                sp.gap = (sp.gap || 0) + gap;
                sp.ms = (sp.ms || 0) + (gap * 210000);
                if (!sp.years) sp.years = {};
                sp.years['2026'] = (sp.years['2026'] || 0) + gap;
            }
        } else {
            artistsLookup[key] = {
                name: aName,
                plays: lfPlays,
                ms: lfPlays * 210000,
                first: '2026-01-01T00:00:00Z',
                last: '2026-10-15T05:00:00Z',
                years: { '2026': lfPlays },
                months: { '2026-10': lfPlays },
                gap: lfPlays,
                tracks: []
            };
        }
    });

    // ------------------------------------------------------------------
    // 3. UNIFICACIÓN DE ÁLBUMES
    // ------------------------------------------------------------------
    console.log('Unificando álbumes...');
    lfAlbums.forEach(al => {
        const lfPlays = parseInt(al.playcount, 10);
        if (!lfPlays || lfPlays <= 0) return;

        const alName = al.name;
        const alArtist = al.artist?.name || al.artist?.['#text'] || '';
        const key = `${norm(alName)}:::${norm(alArtist)}`;
        let sp = albumsLookup[key];
        if (!sp) {
            const foundKey = Object.keys(albumsLookup).find(k => k.startsWith(norm(alName) + ':::'));
            if (foundKey) sp = albumsLookup[foundKey];
        }

        if (sp) {
            const sp2026 = sp.years?.['2026'] || 0;
            const spDec2025 = sp.months?.['2025-12'] || 0;
            const spEra = sp2026 + spDec2025;

            if (lfPlays > spEra) {
                const gap = lfPlays - spEra;
                sp.plays = (sp.plays || 0) + gap;
                sp.gap = (sp.gap || 0) + gap;
                sp.ms = (sp.ms || 0) + (gap * 210000);
                if (!sp.years) sp.years = {};
                sp.years['2026'] = (sp.years['2026'] || 0) + gap;
            }
        } else {
            albumsLookup[key] = {
                name: alName,
                artist: alArtist,
                plays: lfPlays,
                ms: lfPlays * 210000,
                first: '2026-01-01T00:00:00Z',
                last: '2026-10-15T05:00:00Z',
                years: { '2026': lfPlays },
                months: { '2026-10': lfPlays },
                gap: lfPlays,
                tracks: []
            };
        }
    });

    // ------------------------------------------------------------------
    // 4. RECONSTRUCCIÓN DE TOPS UNIFICADOS (OVERALL Y 2026)
    // ------------------------------------------------------------------
    console.log('Reconstruyendo tops de canciones, artistas y álbumes...');

    // Overall Tracks
    const allTracksList = Object.values(tracksLookup).map(t => ({
        name: t.name,
        artist: t.artist,
        album: t.album,
        plays: t.plays,
        uri: t.uri
    })).sort((a, b) => b.plays - a.plays);

    // 2026 Tracks
    const tracks2026List = Object.values(tracksLookup).filter(t => t.years?.['2026'] > 0).map(t => ({
        name: t.name,
        artist: t.artist,
        album: t.album,
        plays: t.years['2026'],
        uri: t.uri
    })).sort((a, b) => b.plays - a.plays);

    // Overall Artists
    const allArtistsList = Object.values(artistsLookup).map(a => ({
        name: a.name,
        plays: a.plays
    })).sort((a, b) => b.plays - a.plays);

    // 2026 Artists
    const artists2026List = Object.values(artistsLookup).filter(a => a.years?.['2026'] > 0).map(a => ({
        name: a.name,
        plays: a.years['2026']
    })).sort((a, b) => b.plays - a.plays);

    // Overall Albums
    const allAlbumsList = Object.values(albumsLookup).map(al => ({
        name: al.name,
        artist: al.artist,
        plays: al.plays
    })).sort((a, b) => b.plays - a.plays);

    // 2026 Albums
    const albums2026List = Object.values(albumsLookup).filter(al => al.years?.['2026'] > 0).map(al => ({
        name: al.name,
        artist: al.artist,
        plays: al.years['2026']
    })).sort((a, b) => b.plays - a.plays);

    yearlyTops.overall = {
        plays: spData.yearlyTops.overall.plays + totalStreamsAdded,
        hours: (parseFloat(spData.yearlyTops.overall.hours) + (totalStreamsAdded * 3.5 / 60)).toFixed(1),
        tracks: allTracksList.slice(0, 300),
        artists: allArtistsList.slice(0, 300),
        albums: allAlbumsList.slice(0, 300)
    };

    if (yearlyTops['2026']) {
        yearlyTops['2026'].plays = (yearlyTops['2026'].plays || 0) + totalStreamsAdded;
        yearlyTops['2026'].hours = (parseFloat(yearlyTops['2026'].hours || 0) + (totalStreamsAdded * 3.5 / 60)).toFixed(1);
        yearlyTops['2026'].tracks = tracks2026List.slice(0, 300);
        yearlyTops['2026'].artists = artists2026List.slice(0, 300);
        yearlyTops['2026'].albums = albums2026List.slice(0, 300);
    }

    // Recientes combinadas (Top recents de Last.fm + Spotify)
    const formattedLfRecents = lfRecents.map(r => ({
        name: r.name,
        artist: r.artist?.['#text'] || r.artist?.name || '',
        album: r.album?.['#text'] || r.album?.name || '',
        ts: r.date?.uts ? new Date(parseInt(r.date.uts, 10) * 1000).toISOString() : new Date().toISOString(),
        uri: null
    }));
    const combinedRecent = [...formattedLfRecents, ...(spData.recent || [])];

    const unifiedSummary = {
        validStreams: spData.summary.validStreams + totalStreamsAdded,
        totalHours: (parseFloat(spData.summary.totalHours) + (totalStreamsAdded * 3.5 / 60)).toFixed(1),
        totalArtists: Object.keys(artistsLookup).length,
        totalAlbums: Object.keys(albumsLookup).length,
        totalTracks: Object.keys(tracksLookup).length,
        firstStream: spData.summary.firstStream,
        lastStream: new Date().toISOString(),
        gapStreamsFilled: totalStreamsAdded
    };

    const unifiedResult = {
        summary: unifiedSummary,
        yearlyTops: yearlyTops,
        tracksLookup: tracksLookup,
        artistsLookup: artistsLookup,
        albumsLookup: albumsLookup,
        recent: combinedRecent.slice(0, 100)
    };

    console.log(`Guardando unified_history.json (${totalStreamsAdded} reproducciones añadidas de otras plataformas)...`);
    fs.writeFileSync(UNIFIED_OUTPUT_PATH, JSON.stringify(unifiedResult));
    console.log('¡Archivo unified_history.json generado exitosamente!');
    console.log(`Resumen: Streams unificados: ${unifiedSummary.validStreams.toLocaleString()} (${totalStreamsAdded.toLocaleString()} de otras plataformas agregados). Horas: ${unifiedSummary.totalHours}.`);
}

main().catch(err => {
    console.error('Error al generar unified_history:', err);
    process.exit(1);
});
