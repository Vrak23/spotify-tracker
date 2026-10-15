const CLIENT_ID = '78c1217f07404df7b95cceb3e7cc6657';
const REDIRECT_URI = window.location.origin + '/callback';

let accessToken = null;
let currentRange = 'short_term';
let currentType = 'tracks';
let currentLimit = 50;
let rawRecentItems = [];
let currentDateFilter = 'all';
let currentTracksCache = [];
let currentArtistsCache = [];
let userProfileData = null;

let dnaChartInstance = null;
let genresChartInstance = null;

// PWA: Registrar Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => {
            console.log('SW registration error:', err);
        });
    });
}

// Elementos DOM
const loginView = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');
const userProfile = document.getElementById('user-profile');
const userName = document.getElementById('user-name');
const userImg = document.getElementById('user-img');
const userFollowers = document.getElementById('user-followers');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const statsList = document.getElementById('stats-list');
const loader = document.getElementById('loader');
const currentlyPlayingContainer = document.getElementById('currently-playing-container');
const timeRangeContainer = document.getElementById('time-range-container');
const limitContainer = document.getElementById('limit-container');
const recentDateFilter = document.getElementById('recent-date-filter');
const recentDatePicker = document.getElementById('recent-date-picker');
const dnaContainer = document.getElementById('dna-container');
const genresContainer = document.getElementById('genres-container');

// Botones de acciones
const btnSavePlaylist = document.getElementById('btn-save-playlist');
const btnOpenShareModal = document.getElementById('btn-open-share-modal');
const btnDownloadCard = document.getElementById('btn-download-card');
const shareCardModal = document.getElementById('shareCardModal');

function generateRandomString(length) {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

async function generateCodeChallenge(codeVerifier) {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

async function redirectToSpotifyLogin() {
    const verifier = generateRandomString(128);
    const challenge = await generateCodeChallenge(verifier);
    localStorage.setItem('code_verifier', verifier);

    const scope = 'user-read-private user-read-email user-top-read user-read-currently-playing user-read-recently-played playlist-modify-public playlist-modify-private';
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        scope: scope,
        code_challenge_method: 'S256',
        code_challenge: challenge
    });

    document.location = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function fetchAccessToken(code) {
    const verifier = localStorage.getItem('code_verifier');

    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier
    });

    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params
        });

        const data = await response.json();
        if (data.access_token) {
            accessToken = data.access_token;
            localStorage.setItem('spotify_access_token', accessToken);
            window.history.replaceState({}, document.title, "/");
            showDashboard();
        } else {
            console.error('Error al obtener token PKCE:', data);
            showLogin();
        }
    } catch (err) {
        console.error('Error:', err);
        showLogin();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');

    if (error) {
        console.error('Error de autorización de Spotify:', error);
        window.history.replaceState({}, document.title, "/");
        showLogin();
    } else if (code) {
        await fetchAccessToken(code);
    } else {
        accessToken = localStorage.getItem('spotify_access_token');
        if (accessToken) {
            showDashboard();
        } else {
            showLogin();
        }
    }

    setupEventListeners();
});

function formatDuration(ms) {
    if (!ms) return '0:00';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

function formatDate(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Hoy, ${time}`;
    if (isYesterday) return `Ayer, ${time}`;
    return `${date.toLocaleDateString([], { day: '2-digit', month: 'short' })}, ${time}`;
}

function formatNumber(num) {
    if (!num) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
}

function getRangeLabel(range) {
    if (range === 'short_term') return 'Últimas 4 Semanas';
    if (range === 'medium_term') return 'Últimos 6 Meses';
    return 'Histórico Total';
}

function setupEventListeners() {
    if (btnLogin) {
        btnLogin.addEventListener('click', redirectToSpotifyLogin);
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            localStorage.removeItem('spotify_access_token');
            localStorage.removeItem('code_verifier');
            accessToken = null;
            showLogin();
        });
    }

    document.querySelectorAll('#time-range-tabs .nav-link').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#time-range-tabs .nav-link').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentRange = e.target.getAttribute('data-range');
            loadStats();
        });
    });

    document.querySelectorAll('input[name="contentType"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentType = e.target.value;
            switchContentTypeView();
            loadStats();
        });
    });

    document.querySelectorAll('input[name="limitCount"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentLimit = parseInt(e.target.value, 10);
            if (currentType === 'tracks' || currentType === 'artists') {
                loadStats();
            }
        });
    });

    document.querySelectorAll('.date-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.date-filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            if (recentDatePicker) recentDatePicker.value = '';
            currentDateFilter = e.target.getAttribute('data-filter');
            applyRecentFilter();
        });
    });

    if (recentDatePicker) {
        recentDatePicker.addEventListener('change', (e) => {
            if (e.target.value) {
                document.querySelectorAll('.date-filter-btn').forEach(b => b.classList.remove('active'));
                currentDateFilter = e.target.value;
                applyRecentFilter();
            }
        });
    }

    // Guardar Playlist
    if (btnSavePlaylist) {
        btnSavePlaylist.addEventListener('click', handleSavePlaylist);
    }

    // Modal Tarjeta
    if (btnOpenShareModal) {
        btnOpenShareModal.addEventListener('click', prepareShareCard);
    }

    // Descargar Tarjeta PNG
    if (btnDownloadCard) {
        btnDownloadCard.addEventListener('click', handleDownloadCard);
    }
}

function switchContentTypeView() {
    statsList.classList.remove('d-none');
    dnaContainer.classList.add('d-none');
    genresContainer.classList.add('d-none');
    recentDateFilter.classList.add('d-none');
    timeRangeContainer.classList.remove('d-none');
    limitContainer.classList.remove('d-none');

    if (currentType === 'recent') {
        timeRangeContainer.classList.add('d-none');
        limitContainer.classList.add('d-none');
        recentDateFilter.classList.remove('d-none');
    } else if (currentType === 'dna') {
        statsList.classList.add('d-none');
        limitContainer.classList.add('d-none');
        dnaContainer.classList.remove('d-none');
    } else if (currentType === 'genres') {
        statsList.classList.add('d-none');
        limitContainer.classList.add('d-none');
        genresContainer.classList.remove('d-none');
    }
}

function showLogin() {
    loginView.classList.remove('d-none');
    dashboardView.classList.add('d-none');
    userProfile.classList.add('d-none');
}

async function showDashboard() {
    loginView.classList.add('d-none');
    dashboardView.classList.remove('d-none');
    userProfile.classList.remove('d-none');

    await fetchUserProfile();
    fetchCurrentlyPlaying();
    switchContentTypeView();
    loadStats();
}

async function spotifyFetch(endpoint, options = {}) {
    try {
        const res = await fetch(`https://api.spotify.com/v1/${endpoint}`, {
            ...options,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });

        if (res.status === 401) {
            localStorage.removeItem('spotify_access_token');
            showLogin();
            return null;
        }

        if (res.status === 204) return null;
        return await res.json();
    } catch (err) {
        console.error('Error en llamada API:', err);
        return null;
    }
}

async function fetchUserProfile() {
    const data = await spotifyFetch('me');
    if (!data) return;
    userProfileData = data;

    userName.textContent = data.display_name || 'Usuario';
    userFollowers.textContent = `${data.followers ? data.followers.total : 0} seguidores`;
    
    if (data.images && data.images.length > 0) {
        userImg.src = data.images[0].url;
    } else {
        userImg.src = 'https://via.placeholder.com/36?text=U';
    }
}

async function fetchCurrentlyPlaying() {
    const data = await spotifyFetch('me/player/currently-playing');
    
    if (data && data.is_playing && data.item) {
        const track = data.item;
        currentlyPlayingContainer.innerHTML = `
            <div class="now-playing-bar d-flex align-items-center gap-3">
                <img src="${track.album.images[0]?.url || 'https://via.placeholder.com/48'}" class="img-thumb" style="width: 44px; height: 44px;" alt="Cover">
                <div class="flex-grow-1 overflow-hidden">
                    <div class="d-flex align-items-center gap-2">
                        <small class="fw-bold text-uppercase tracking-wider" style="font-size: 0.68rem; color: var(--brand-primary);">
                            <i class="fa-solid fa-volume-high me-1 animate-pulse"></i> Escuchando ahora
                        </small>
                    </div>
                    <div class="fw-bold text-truncate" style="font-size: 0.9rem;">${track.name}</div>
                    <small class="text-secondary text-truncate d-block" style="font-size: 0.78rem;">${track.artists.map(a => a.name).join(', ')}</small>
                </div>
                <a href="${track.external_urls?.spotify || '#'}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-brand rounded-pill py-1 px-3 d-none d-sm-inline-block" style="font-size: 0.75rem;">
                    <i class="fa-brands fa-spotify me-1"></i> Abrir
                </a>
            </div>
        `;
    } else {
        currentlyPlayingContainer.innerHTML = '';
    }
}

async function loadStats() {
    statsList.innerHTML = '';
    loader.classList.remove('d-none');

    // 1. Historial Reciente
    if (currentType === 'recent') {
        const data = await spotifyFetch('me/player/recently-played?limit=50');
        loader.classList.add('d-none');
        if (!data || !data.items || data.items.length === 0) {
            statsList.innerHTML = '<div class="col-12 text-center text-secondary py-5">No se encontraron reproducciones recientes.</div>';
            return;
        }
        rawRecentItems = data.items;
        applyRecentFilter();
        return;
    }

    // 2. ADN Musical
    if (currentType === 'dna') {
        await loadDNAStats();
        loader.classList.add('d-none');
        return;
    }

    // 3. Géneros
    if (currentType === 'genres') {
        await loadGenresStats();
        loader.classList.add('d-none');
        return;
    }

    // 4. Canciones o Artistas
    const endpoint = `me/top/${currentType}?time_range=${currentRange}&limit=${currentLimit}`;
    const data = await spotifyFetch(endpoint);

    loader.classList.add('d-none');
    if (!data || !data.items || data.items.length === 0) {
        statsList.innerHTML = '<div class="col-12 text-center text-secondary py-5">No se encontraron datos para este rango de fechas.</div>';
        return;
    }

    if (currentType === 'tracks') {
        currentTracksCache = data.items;
        renderTracks(data.items);
    } else {
        currentArtistsCache = data.items;
        renderArtists(data.items);
    }
}

function applyRecentFilter() {
    if (!rawRecentItems || rawRecentItems.length === 0) {
        statsList.innerHTML = '<div class="col-12 text-center text-secondary py-5">No hay canciones recientes.</div>';
        return;
    }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    let filtered = rawRecentItems;
    if (currentDateFilter === 'today') {
        filtered = rawRecentItems.filter(item => item.played_at.startsWith(todayStr));
    } else if (currentDateFilter === 'yesterday') {
        filtered = rawRecentItems.filter(item => item.played_at.startsWith(yesterdayStr));
    } else if (currentDateFilter !== 'all') {
        filtered = rawRecentItems.filter(item => item.played_at.startsWith(currentDateFilter));
    }

    renderRecent(filtered);
}

function renderTracks(tracks) {
    statsList.innerHTML = '';
    tracks.forEach((track, index) => {
        const item = document.createElement('div');
        item.className = 'card-uniform';
        const duration = formatDuration(track.duration_ms);
        const popularity = track.popularity !== undefined ? track.popularity : null;
        const spotifyUrl = track.external_urls?.spotify || '#';
        const albumYear = track.album?.release_date ? track.album.release_date.substring(0, 4) : '';

        item.innerHTML = `
            <span class="fw-bold text-secondary text-center me-2" style="width: 26px; font-size: 0.85rem;">#${index + 1}</span>
            <img src="${track.album.images[0]?.url || 'https://via.placeholder.com/52'}" class="img-thumb me-3" alt="Cover">
            <div class="overflow-hidden flex-grow-1 me-2">
                <div class="fw-bold text-truncate" style="font-size: 0.88rem;" title="${track.name}">${track.name}</div>
                <small class="text-secondary text-truncate d-block" style="font-size: 0.76rem;">${track.artists.map(a => a.name).join(', ')}</small>
                <div class="d-flex align-items-center gap-2 mt-1 text-secondary" style="font-size: 0.7rem;">
                    <span><i class="fa-regular fa-clock me-1"></i>${duration}</span>
                    ${popularity !== null ? `<span>•</span><span style="color: var(--brand-primary);"><i class="fa-solid fa-fire me-1"></i>${popularity}%</span>` : ''}
                    ${albumYear ? `<span>•</span><span>${albumYear}</span>` : ''}
                </div>
            </div>
            <a href="${spotifyUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline-brand btn-sm py-1 px-2 rounded-circle flex-shrink-0" title="Escuchar en Spotify">
                <i class="fa-brands fa-spotify" style="color: #1ed760;"></i>
            </a>
        `;
        statsList.appendChild(item);
    });
}

function renderArtists(artists) {
    statsList.innerHTML = '';
    artists.forEach((artist, index) => {
        const item = document.createElement('div');
        item.className = 'card-uniform';
        const followers = artist.followers ? formatNumber(artist.followers.total) : '0';
        const popularity = artist.popularity !== undefined ? artist.popularity : null;
        const genres = artist.genres?.slice(0, 2).join(', ') || 'Artista';
        const spotifyUrl = artist.external_urls?.spotify || '#';

        item.innerHTML = `
            <span class="fw-bold text-secondary text-center me-2" style="width: 26px; font-size: 0.85rem;">#${index + 1}</span>
            <img src="${artist.images[0]?.url || 'https://via.placeholder.com/52'}" class="img-thumb rounded-circle me-3" alt="Artist">
            <div class="overflow-hidden flex-grow-1 me-2">
                <div class="fw-bold text-truncate" style="font-size: 0.88rem;" title="${artist.name}">${artist.name}</div>
                <small class="text-secondary text-capitalize text-truncate d-block" style="font-size: 0.76rem;">${genres}</small>
                <div class="d-flex align-items-center gap-2 mt-1 text-secondary" style="font-size: 0.7rem;">
                    <span><i class="fa-solid fa-users me-1"></i>${followers}</span>
                    ${popularity !== null ? `<span>•</span><span style="color: var(--brand-primary);"><i class="fa-solid fa-fire me-1"></i>${popularity}%</span>` : ''}
                </div>
            </div>
            <a href="${spotifyUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline-brand btn-sm py-1 px-2 rounded-circle flex-shrink-0" title="Ver en Spotify">
                <i class="fa-brands fa-spotify" style="color: #1ed760;"></i>
            </a>
        `;
        statsList.appendChild(item);
    });
}

function renderRecent(items) {
    statsList.innerHTML = '';
    if (!items || items.length === 0) {
        statsList.innerHTML = '<div class="col-12 text-center text-secondary py-5">No se encontraron reproducciones para la fecha seleccionada.</div>';
        return;
    }

    items.forEach((item, index) => {
        const track = item.track;
        const playedAt = formatDate(item.played_at);
        const duration = formatDuration(track.duration_ms);
        const spotifyUrl = track.external_urls?.spotify || '#';

        const card = document.createElement('div');
        card.className = 'card-uniform';
        card.innerHTML = `
            <span class="fw-bold text-secondary text-center me-2" style="width: 26px; font-size: 0.85rem;">#${index + 1}</span>
            <img src="${track.album.images[0]?.url || 'https://via.placeholder.com/52'}" class="img-thumb me-3" alt="Cover">
            <div class="overflow-hidden flex-grow-1 me-2">
                <div class="fw-bold text-truncate" style="font-size: 0.88rem;" title="${track.name}">${track.name}</div>
                <small class="text-secondary text-truncate d-block" style="font-size: 0.76rem;">${track.artists.map(a => a.name).join(', ')}</small>
                <div class="d-flex align-items-center gap-2 mt-1 text-secondary" style="font-size: 0.7rem;">
                    <span style="color: var(--brand-primary);"><i class="fa-regular fa-clock me-1"></i>${playedAt}</span>
                    <span>•</span>
                    <span>${duration}</span>
                </div>
            </div>
            <a href="${spotifyUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline-brand btn-sm py-1 px-2 rounded-circle flex-shrink-0">
                <i class="fa-brands fa-spotify" style="color: #1ed760;"></i>
            </a>
        `;
        statsList.appendChild(card);
    });
}

// ----------------------------------------------------
// FEATURE 1: ADN MUSICAL (Audio Features)
// ----------------------------------------------------
async function loadDNAStats() {
    const tracksData = await spotifyFetch(`me/top/tracks?time_range=${currentRange}&limit=50`);
    if (!tracksData || !tracksData.items || tracksData.items.length === 0) {
        return;
    }

    const ids = tracksData.items.map(t => t.id).filter(Boolean).join(',');
    const featuresData = await spotifyFetch(`audio-features?ids=${ids}`);
    if (!featuresData || !featuresData.audio_features) return;

    const validFeatures = featuresData.audio_features.filter(Boolean);
    if (validFeatures.length === 0) return;

    // Calcular promedios
    let totalDance = 0, totalEnergy = 0, totalValence = 0, totalAcoustic = 0, totalTempo = 0;
    validFeatures.forEach(f => {
        totalDance += f.danceability;
        totalEnergy += f.energy;
        totalValence += f.valence;
        totalAcoustic += f.acousticness;
        totalTempo += f.tempo;
    });

    const count = validFeatures.length;
    const avgDance = Math.round((totalDance / count) * 100);
    const avgEnergy = Math.round((totalEnergy / count) * 100);
    const avgValence = Math.round((totalValence / count) * 100);
    const avgAcoustic = Math.round((totalAcoustic / count) * 100);
    const avgTempo = Math.round(totalTempo / count);

    // Renderizar gráfico Radar
    const ctx = document.getElementById('dnaRadarChart').getContext('2d');
    if (dnaChartInstance) dnaChartInstance.destroy();

    dnaChartInstance = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Bailabilidad', 'Energía', 'Positividad (Ánimo)', 'Acústica'],
            datasets: [{
                label: 'Tu ADN (%)',
                data: [avgDance, avgEnergy, avgValence, avgAcoustic],
                backgroundColor: 'rgba(168, 85, 247, 0.25)',
                borderColor: '#a855f7',
                borderWidth: 2,
                pointBackgroundColor: '#c084fc',
                pointBorderColor: '#ffffff',
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: { color: 'rgba(255, 255, 255, 0.08)' },
                    grid: { color: 'rgba(255, 255, 255, 0.08)' },
                    pointLabels: { color: '#cbd5e1', font: { size: 12, weight: 600 } },
                    suggestedMin: 0,
                    suggestedMax: 100,
                    ticks: { display: false }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });

    // Renderizar barras de métricas
    const barsContainer = document.getElementById('dna-bars');
    barsContainer.innerHTML = `
        <div>
            <div class="d-flex justify-content-between small mb-1">
                <span><i class="fa-solid fa-bolt text-warning me-1"></i> Energía</span>
                <span class="fw-bold">${avgEnergy}%</span>
            </div>
            <div class="progress bg-black" style="height: 6px;">
                <div class="progress-bar" style="width: ${avgEnergy}%; background: linear-gradient(90deg, #a855f7, #f59e0b);"></div>
            </div>
        </div>
        <div>
            <div class="d-flex justify-content-between small mb-1">
                <span><i class="fa-solid fa-music text-info me-1"></i> Bailabilidad</span>
                <span class="fw-bold">${avgDance}%</span>
            </div>
            <div class="progress bg-black" style="height: 6px;">
                <div class="progress-bar" style="width: ${avgDance}%; background: linear-gradient(90deg, #a855f7, #06b6d4);"></div>
            </div>
        </div>
        <div>
            <div class="d-flex justify-content-between small mb-1">
                <span><i class="fa-solid fa-face-smile text-success me-1"></i> Positividad (Valence)</span>
                <span class="fw-bold">${avgValence}%</span>
            </div>
            <div class="progress bg-black" style="height: 6px;">
                <div class="progress-bar" style="width: ${avgValence}%; background: linear-gradient(90deg, #a855f7, #10b981);"></div>
            </div>
        </div>
        <div>
            <div class="d-flex justify-content-between small mb-1">
                <span><i class="fa-solid fa-guitar text-danger me-1"></i> Acústica</span>
                <span class="fw-bold">${avgAcoustic}%</span>
            </div>
            <div class="progress bg-black" style="height: 6px;">
                <div class="progress-bar" style="width: ${avgAcoustic}%; background: linear-gradient(90deg, #a855f7, #ef4444);"></div>
            </div>
        </div>
    `;

    document.getElementById('dna-summary').innerHTML = `
        <div class="d-flex align-items-center justify-content-between">
            <span><i class="fa-solid fa-gauge-high me-1" style="color: var(--brand-primary);"></i> Tempo promedio:</span>
            <span class="fw-bold text-white">${avgTempo} BPM</span>
        </div>
        <div class="mt-1">
            Tu música en este periodo es <strong>${avgEnergy > 60 ? 'altamente enérgica' : 'relajada y tranquila'}</strong> y se inclina a ritmos <strong>${avgDance > 50 ? 'muy bailables' : 'experimentales / melódicos'}</strong>.
        </div>
    `;
}

// ----------------------------------------------------
// FEATURE 2: DISTRIBUCIÓN DE GÉNEROS
// ----------------------------------------------------
async function loadGenresStats() {
    const artistsData = await spotifyFetch(`me/top/artists?time_range=${currentRange}&limit=50`);
    if (!artistsData || !artistsData.items || artistsData.items.length === 0) return;

    const genreCounts = {};
    let totalGenreHits = 0;

    artistsData.items.forEach(artist => {
        if (artist.genres && artist.genres.length > 0) {
            artist.genres.forEach(g => {
                const clean = g.toLowerCase();
                genreCounts[clean] = (genreCounts[clean] || 0) + 1;
                totalGenreHits++;
            });
        }
    });

    const sortedGenres = Object.entries(genreCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);

    if (sortedGenres.length === 0) {
        document.getElementById('genres-list').innerHTML = '<div class="text-secondary py-3">No hay géneros suficientes.</div>';
        return;
    }

    const labels = sortedGenres.map(g => g[0]);
    const values = sortedGenres.map(g => g[1]);
    const palette = ['#a855f7', '#8b5cf6', '#6366f1', '#ec4899', '#f43f5e', '#3b82f6'];

    // Render Doughnut Chart
    const ctx = document.getElementById('genresDoughnutChart').getContext('2d');
    if (genresChartInstance) genresChartInstance.destroy();

    genresChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: palette,
                borderColor: '#14101e',
                borderWidth: 2,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#cbd5e1', font: { size: 11 }, boxWidth: 12 }
                }
            },
            cutout: '68%'
        }
    });

    // Render Genres List
    const genresList = document.getElementById('genres-list');
    genresList.innerHTML = '';
    sortedGenres.forEach(([genre, count], idx) => {
        const percent = Math.round((count / totalGenreHits) * 100);
        const div = document.createElement('div');
        div.className = 'd-flex align-items-center justify-content-between p-2 rounded';
        div.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
        div.innerHTML = `
            <div class="d-flex align-items-center gap-2 text-truncate">
                <span class="rounded-circle" style="width: 10px; height: 10px; background-color: ${palette[idx] || '#a855f7'};"></span>
                <span class="text-capitalize small fw-semibold text-truncate">${genre}</span>
            </div>
            <span class="badge text-secondary border border-secondary border-opacity-25" style="font-size: 0.72rem;">${percent}%</span>
        `;
        genresList.appendChild(div);
    });
}

// ----------------------------------------------------
// FEATURE 3: GUARDAR TOP COMO PLAYLIST
// ----------------------------------------------------
async function handleSavePlaylist() {
    btnSavePlaylist.disabled = true;
    btnSavePlaylist.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Creando...';

    try {
        if (!userProfileData) {
            await fetchUserProfile();
        }

        const tracksData = await spotifyFetch(`me/top/tracks?time_range=${currentRange}&limit=50`);
        if (!tracksData || !tracksData.items || tracksData.items.length === 0) {
            alert('No se encontraron canciones para crear la playlist.');
            btnSavePlaylist.disabled = false;
            btnSavePlaylist.innerHTML = '<i class="fa-solid fa-plus me-1"></i> Guardar Playlist';
            return;
        }

        const periodName = getRangeLabel(currentRange);
        const payload = {
            name: `Mi Top (${periodName}) - SpotiTracker`,
            description: `Playlist creada con mis canciones más escuchadas en SpotiTracker. Fecha: ${new Date().toLocaleDateString()}`,
            public: false
        };

        const createRes = await spotifyFetch(`users/${userProfileData.id}/playlists`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (!createRes || !createRes.id) {
            alert('Error al crear la playlist en Spotify. Asegúrate de haber otorgado los permisos necesarios.');
            btnSavePlaylist.disabled = false;
            btnSavePlaylist.innerHTML = '<i class="fa-solid fa-plus me-1"></i> Guardar Playlist';
            return;
        }

        const uris = tracksData.items.map(t => t.uri).filter(Boolean);
        await spotifyFetch(`playlists/${createRes.id}/tracks`, {
            method: 'POST',
            body: JSON.stringify({ uris: uris })
        });

        btnSavePlaylist.innerHTML = '<i class="fa-solid fa-check text-success me-1"></i> ¡Guardada!';
        setTimeout(() => {
            btnSavePlaylist.disabled = false;
            btnSavePlaylist.innerHTML = '<i class="fa-solid fa-plus me-1"></i> Guardar Playlist';
        }, 3000);

        // Abrir playlist creada
        if (confirm(`¡Playlist "${payload.name}" guardada con éxito en tu Spotify!\n\n¿Deseas abrirla ahora?`)) {
            window.open(createRes.external_urls?.spotify, '_blank');
        }
    } catch (err) {
        console.error(err);
        alert('Ocurrió un error al guardar la playlist.');
        btnSavePlaylist.disabled = false;
        btnSavePlaylist.innerHTML = '<i class="fa-solid fa-plus me-1"></i> Guardar Playlist';
    }
}

// ----------------------------------------------------
// FEATURE 4: TARJETA PARA COMPARTIR (Receiptify / Story Card)
// ----------------------------------------------------
async function prepareShareCard() {
    const modalEl = new bootstrap.Modal(shareCardModal);
    modalEl.show();

    document.getElementById('card-user-name').textContent = userProfileData?.display_name || 'Usuario';
    document.getElementById('card-date').textContent = new Date().toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
    document.getElementById('card-period-label').textContent = getRangeLabel(currentRange);

    const listContainer = document.getElementById('card-items-list');
    listContainer.innerHTML = '<div class="text-center py-3 small text-secondary">Cargando tarjeta...</div>';

    let items = [];
    if (currentType === 'artists' && currentArtistsCache.length > 0) {
        items = currentArtistsCache.slice(0, 5);
    } else if (currentTracksCache.length > 0) {
        items = currentTracksCache.slice(0, 5);
    } else {
        const data = await spotifyFetch(`me/top/tracks?time_range=${currentRange}&limit=5`);
        items = data?.items || [];
    }

    listContainer.innerHTML = '';
    items.forEach((item, idx) => {
        const isTrack = !!item.album;
        const name = item.name;
        const sub = isTrack ? item.artists.map(a => a.name).join(', ') : (item.genres?.slice(0, 2).join(', ') || 'Artista');
        const img = isTrack ? item.album.images[0]?.url : item.images[0]?.url;

        const row = document.createElement('div');
        row.className = 'd-flex align-items-center gap-2 py-1';
        row.innerHTML = `
            <span class="fw-bold" style="width: 20px; font-size: 0.8rem; color: var(--brand-primary);">#${idx + 1}</span>
            <img src="${img || 'https://via.placeholder.com/32'}" class="rounded" style="width: 32px; height: 32px; object-fit: cover;" alt="cover">
            <div class="overflow-hidden flex-grow-1 text-start">
                <div class="fw-bold text-truncate" style="font-size: 0.8rem;">${name}</div>
                <small class="text-secondary text-truncate d-block" style="font-size: 0.7rem;">${sub}</small>
            </div>
        `;
        listContainer.appendChild(row);
    });
}

async function handleDownloadCard() {
    const cardWrapper = document.getElementById('share-card-canvas-wrapper');
    btnDownloadCard.disabled = true;
    btnDownloadCard.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Generando...';

    try {
        const canvas = await html2canvas(cardWrapper, {
            backgroundColor: '#0c0a12',
            scale: 2,
            useCORS: true
        });

        const link = document.createElement('a');
        link.download = `SpotiTracker-${currentRange}-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (err) {
        console.error('Error al generar tarjeta:', err);
        alert('No se pudo generar la imagen para descargar.');
    } finally {
        btnDownloadCard.disabled = false;
        btnDownloadCard.innerHTML = '<i class="fa-solid fa-download me-1"></i> Descargar Imagen';
    }
}
