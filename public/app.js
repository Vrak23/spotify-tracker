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

// Last.fm Data Cache
let lastFmTracksMap = {}; // key: `${track}::${artist}` -> playcount
let lastFmArtistsMap = {}; // key: `${artist}` -> playcount

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
const navActions = document.getElementById('nav-actions');
const userImg = document.getElementById('user-img');
const drawerUserImg = document.getElementById('drawer-user-img');
const drawerUserName = document.getElementById('drawer-user-name');
const drawerUserFollowers = document.getElementById('drawer-user-followers');
const btnLogin = document.getElementById('btn-login');
const statsList = document.getElementById('stats-list');
const loader = document.getElementById('loader');
const currentlyPlayingContainer = document.getElementById('currently-playing-container');
const timeRangeContainer = document.getElementById('time-range-container');
const recentDateFilter = document.getElementById('recent-date-filter');
const recentDatePicker = document.getElementById('recent-date-picker');

// Last.fm DOM
const lastFmBanner = document.getElementById('lastfm-banner');
const lastFmBannerUser = document.getElementById('lastfm-banner-user');
const drawerLastFmStatus = document.getElementById('drawer-lastfm-status');
const lastFmModalEl = document.getElementById('lastFmModal');
const lastFmUsernameInput = document.getElementById('lastfm-username-input');
const lastFmApiKeyInput = document.getElementById('lastfm-apikey-input');
const btnLastFmSave = document.getElementById('btn-lastfm-save');
const btnLastFmDisconnect = document.getElementById('btn-lastfm-disconnect');
const lastFmError = document.getElementById('lastfm-error');

// Menu Drawer Items
const menuSavePlaylist = document.getElementById('menu-save-playlist');
const menuOpenShare = document.getElementById('menu-open-share');
const menuLastFmConnect = document.getElementById('menu-lastfm-connect');
const menuInstallApp = document.getElementById('menu-install-app');
const menuLogout = document.getElementById('menu-logout');

// Share Modal Elements
const shareCardModal = document.getElementById('shareCardModal');
const btnDownloadCard = document.getElementById('btn-download-card');

// Botones de instalación PWA
let deferredPrompt = null;
const btnInstallLogin = document.getElementById('btn-install-login');
const btnInstallFab = document.getElementById('btn-install-fab');
const installModalEl = document.getElementById('installModal');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

async function triggerInstallFlow() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            if (btnInstallLogin) btnInstallLogin.classList.add('d-none');
            if (btnInstallFab) btnInstallFab.classList.add('d-none');
        }
        deferredPrompt = null;
    } else {
        const modal = new bootstrap.Modal(installModalEl);
        modal.show();
    }
}

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
    initLastFmState();
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

    // Segmented Content Tabs (Canciones, Artistas, Recientes)
    document.querySelectorAll('#content-type-tabs .segmented-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#content-type-tabs .segmented-tab').forEach(b => b.classList.remove('active'));
            const target = e.currentTarget;
            target.classList.add('active');
            currentType = target.getAttribute('data-type');
            switchContentTypeView();
            loadStats();
        });
    });

    // Pestañas de rango de tiempo (.range-btn)
    document.querySelectorAll('#time-range-tabs .range-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#time-range-tabs .range-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            currentRange = e.currentTarget.getAttribute('data-range');
            loadStats();
        });
    });

    // Selector de límite (.limit-btn)
    document.querySelectorAll('#limit-container .limit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#limit-container .limit-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            currentLimit = parseInt(e.currentTarget.getAttribute('data-limit'), 10);
            if (currentType === 'tracks' || currentType === 'artists') {
                loadStats();
            }
        });
    });

    // Filtros de fecha de recientes
    document.querySelectorAll('.date-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.date-filter-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            if (recentDatePicker) recentDatePicker.value = '';
            currentDateFilter = e.currentTarget.getAttribute('data-filter');
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

    // Acciones del Burger Menu
    if (menuSavePlaylist) {
        menuSavePlaylist.addEventListener('click', handleSavePlaylist);
    }
    if (menuOpenShare) {
        menuOpenShare.addEventListener('click', prepareShareCard);
    }
    if (menuLastFmConnect) {
        menuLastFmConnect.addEventListener('click', openLastFmModal);
    }
    if (menuInstallApp) {
        menuInstallApp.addEventListener('click', triggerInstallFlow);
    }
    if (menuLogout) {
        menuLogout.addEventListener('click', handleLogout);
    }

    // Modal Last.fm
    if (btnLastFmSave) {
        btnLastFmSave.addEventListener('click', handleSaveLastFm);
    }
    if (btnLastFmDisconnect) {
        btnLastFmDisconnect.addEventListener('click', handleDisconnectLastFm);
    }

    // Descargar Tarjeta PNG
    if (btnDownloadCard) {
        btnDownloadCard.addEventListener('click', handleDownloadCard);
    }

    // Instalación PWA
    if (btnInstallLogin) {
        btnInstallLogin.addEventListener('click', triggerInstallFlow);
    }
    if (btnInstallFab) {
        btnInstallFab.addEventListener('click', triggerInstallFlow);
    }
}

function handleLogout() {
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('code_verifier');
    accessToken = null;
    showLogin();
}

function switchContentTypeView() {
    statsList.classList.remove('d-none');
    recentDateFilter.classList.add('d-none');
    timeRangeContainer.classList.remove('d-none');

    if (currentType === 'recent') {
        timeRangeContainer.classList.add('d-none');
        recentDateFilter.classList.remove('d-none');
    }
}

function showLogin() {
    loginView.classList.remove('d-none');
    dashboardView.classList.add('d-none');
    navActions.classList.add('d-none');
    if (btnInstallFab) btnInstallFab.classList.add('d-none');

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone && btnInstallLogin) {
        btnInstallLogin.classList.add('d-none');
    }
}

async function showDashboard() {
    loginView.classList.add('d-none');
    dashboardView.classList.remove('d-none');
    navActions.classList.remove('d-none');

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (!isStandalone && btnInstallFab) {
        btnInstallFab.classList.remove('d-none');
    } else if (btnInstallFab) {
        btnInstallFab.classList.add('d-none');
    }

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

    if (drawerUserName) drawerUserName.textContent = data.display_name || 'Usuario';
    if (drawerUserFollowers) drawerUserFollowers.textContent = `${data.followers ? data.followers.total : 0} seguidores`;
    
    const avatarUrl = data.images && data.images.length > 0 ? data.images[0].url : 'https://via.placeholder.com/34?text=U';
    if (userImg) userImg.src = avatarUrl;
    if (drawerUserImg) drawerUserImg.src = avatarUrl;
}

async function fetchCurrentlyPlaying() {
    const data = await spotifyFetch('me/player/currently-playing');
    
    if (data && data.is_playing && data.item) {
        const track = data.item;
        currentlyPlayingContainer.innerHTML = `
            <div class="now-playing-bar d-flex align-items-center gap-3">
                <img src="${track.album.images[0]?.url || 'https://via.placeholder.com/44'}" class="img-thumb" style="width: 40px; height: 40px;" alt="Cover">
                <div class="flex-grow-1 overflow-hidden" style="min-width: 0;">
                    <div class="d-flex align-items-center gap-2">
                        <small class="fw-bold text-uppercase tracking-wider" style="font-size: 0.65rem; color: var(--brand-primary);">
                            <i class="fa-solid fa-volume-high me-1"></i> Escuchando ahora
                        </small>
                    </div>
                    <div class="fw-bold text-truncate" style="font-size: 0.85rem;">${track.name}</div>
                    <small class="text-secondary text-truncate d-block" style="font-size: 0.73rem;">${track.artists.map(a => a.name).join(', ')}</small>
                </div>
                <a href="${track.external_urls?.spotify || '#'}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-brand rounded-pill py-0.5 px-2.5 d-none d-sm-inline-block text-nowrap" style="font-size: 0.72rem;">
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

    // Cargar datos de Last.fm si está configurado para mostrar streams exactos
    await fetchLastFmDataIfNeeded();

    // 1. Historial Reciente
    if (currentType === 'recent') {
        const data = await spotifyFetch('me/player/recently-played?limit=50');
        loader.classList.add('d-none');
        if (!data || !data.items || data.items.length === 0) {
            statsList.innerHTML = '<div class="text-center text-secondary py-5">No se encontraron reproducciones recientes.</div>';
            return;
        }
        rawRecentItems = data.items;
        applyRecentFilter();
        return;
    }

    // 2. Canciones o Artistas
    const endpoint = `me/top/${currentType}?time_range=${currentRange}&limit=${currentLimit}`;
    const data = await spotifyFetch(endpoint);

    loader.classList.add('d-none');
    if (!data || !data.items || data.items.length === 0) {
        statsList.innerHTML = '<div class="text-center text-secondary py-5">No se encontraron datos para este rango de fechas.</div>';
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
        statsList.innerHTML = '<div class="text-center text-secondary py-5">No hay canciones recientes.</div>';
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

function normalizeKey(str) {
    return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
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

        // Buscar playcount en Last.fm
        const mainArtist = track.artists[0]?.name || '';
        const searchKey = `${normalizeKey(track.name)}::${normalizeKey(mainArtist)}`;
        const playcount = lastFmTracksMap[searchKey] || null;

        item.innerHTML = `
            <span class="fw-bold text-secondary text-center me-2 flex-shrink-0" style="width: 22px; font-size: 0.8rem;">#${index + 1}</span>
            <img src="${track.album.images[0]?.url || 'https://via.placeholder.com/48'}" class="img-thumb me-2.5" alt="Cover">
            <div class="overflow-hidden flex-grow-1 me-2" style="min-width: 0;">
                <div class="fw-bold text-truncate" style="font-size: 0.85rem;" title="${track.name}">${track.name}</div>
                <small class="text-secondary text-truncate d-block" style="font-size: 0.72rem;">${track.artists.map(a => a.name).join(', ')}</small>
                <div class="d-flex align-items-center gap-2 mt-0.5 text-secondary" style="font-size: 0.68rem;">
                    <span><i class="fa-regular fa-clock me-1"></i>${duration}</span>
                    ${playcount !== null ? `<span class="badge bg-danger bg-opacity-25 text-danger border border-danger border-opacity-25" style="font-size: 0.65rem;"><i class="fa-solid fa-headphones me-1"></i>${playcount} streams</span>` : (popularity !== null ? `<span>•</span><span style="color: var(--brand-primary);"><i class="fa-solid fa-fire me-1"></i>${popularity}%</span>` : '')}
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

        // Buscar playcount del artista en Last.fm
        const artistKey = normalizeKey(artist.name);
        const playcount = lastFmArtistsMap[artistKey] || null;

        item.innerHTML = `
            <span class="fw-bold text-secondary text-center me-2 flex-shrink-0" style="width: 22px; font-size: 0.8rem;">#${index + 1}</span>
            <img src="${artist.images[0]?.url || 'https://via.placeholder.com/48'}" class="img-thumb rounded-circle me-2.5" alt="Artist">
            <div class="overflow-hidden flex-grow-1 me-2" style="min-width: 0;">
                <div class="fw-bold text-truncate" style="font-size: 0.85rem;" title="${artist.name}">${artist.name}</div>
                <small class="text-secondary text-capitalize text-truncate d-block" style="font-size: 0.72rem;">${genres}</small>
                <div class="d-flex align-items-center gap-2 mt-0.5 text-secondary" style="font-size: 0.68rem;">
                    <span><i class="fa-solid fa-users me-1"></i>${followers}</span>
                    ${playcount !== null ? `<span class="badge bg-danger bg-opacity-25 text-danger border border-danger border-opacity-25" style="font-size: 0.65rem;"><i class="fa-solid fa-headphones me-1"></i>${playcount} scrobbles</span>` : (popularity !== null ? `<span>•</span><span style="color: var(--brand-primary);"><i class="fa-solid fa-fire me-1"></i>${popularity}%</span>` : '')}
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
        statsList.innerHTML = '<div class="text-center text-secondary py-5">No se encontraron reproducciones para la fecha seleccionada.</div>';
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
            <span class="fw-bold text-secondary text-center me-2 flex-shrink-0" style="width: 22px; font-size: 0.8rem;">#${index + 1}</span>
            <img src="${track.album.images[0]?.url || 'https://via.placeholder.com/48'}" class="img-thumb me-2.5" alt="Cover">
            <div class="overflow-hidden flex-grow-1 me-2" style="min-width: 0;">
                <div class="fw-bold text-truncate" style="font-size: 0.85rem;" title="${track.name}">${track.name}</div>
                <small class="text-secondary text-truncate d-block" style="font-size: 0.72rem;">${track.artists.map(a => a.name).join(', ')}</small>
                <div class="d-flex align-items-center gap-2 mt-0.5 text-secondary" style="font-size: 0.68rem;">
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
// LAST.FM INTEGRATION (STREAMS & SCROBBLES REALES)
// ----------------------------------------------------
function initLastFmState() {
    const user = localStorage.getItem('lastfm_user');
    const key = localStorage.getItem('lastfm_key');

    if (user && key) {
        if (lastFmBanner) {
            lastFmBanner.classList.remove('d-none');
            lastFmBanner.classList.add('d-flex');
        }
        if (lastFmBannerUser) lastFmBannerUser.textContent = user;
        if (drawerLastFmStatus) {
            drawerLastFmStatus.textContent = `@${user}`;
            drawerLastFmStatus.className = 'badge bg-danger bg-opacity-25 text-danger border border-danger border-opacity-25';
        }
        if (btnLastFmDisconnect) btnLastFmDisconnect.classList.remove('d-none');
    } else {
        if (lastFmBanner) lastFmBanner.classList.add('d-none');
        if (drawerLastFmStatus) {
            drawerLastFmStatus.textContent = 'Opcional';
            drawerLastFmStatus.className = 'badge bg-secondary bg-opacity-25';
        }
        if (btnLastFmDisconnect) btnLastFmDisconnect.classList.add('d-none');
    }
}

function openLastFmModal() {
    const user = localStorage.getItem('lastfm_user') || 'Vrak_23';
    const key = localStorage.getItem('lastfm_key') || '';
    if (lastFmUsernameInput) lastFmUsernameInput.value = user;
    if (lastFmApiKeyInput) lastFmApiKeyInput.value = key;
    if (lastFmError) lastFmError.classList.add('d-none');

    const modal = new bootstrap.Modal(lastFmModalEl);
    modal.show();
}

async function handleSaveLastFm() {
    const user = lastFmUsernameInput.value.trim();
    const key = lastFmApiKeyInput.value.trim();

    if (!user || !key) {
        if (lastFmError) {
            lastFmError.textContent = 'Por favor ingresa tanto tu usuario como tu API Key de Last.fm.';
            lastFmError.classList.remove('d-none');
        }
        return;
    }

    btnLastFmSave.disabled = true;
    btnLastFmSave.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Verificando...';

    try {
        // Probar llamada a Last.fm
        const testRes = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getTopTracks&user=${encodeURIComponent(user)}&api_key=${encodeURIComponent(key)}&limit=1&format=json`);
        const testData = await testRes.json();

        if (testData.error) {
            if (lastFmError) {
                lastFmError.textContent = `Error de Last.fm: ${testData.message || 'API Key o usuario inválido'}`;
                lastFmError.classList.remove('d-none');
            }
            btnLastFmSave.disabled = false;
            btnLastFmSave.textContent = 'Guardar y Sincronizar';
            return;
        }

        // Guardar credenciales
        localStorage.setItem('lastfm_user', user);
        localStorage.setItem('lastfm_key', key);
        initLastFmState();

        const modal = bootstrap.Modal.getInstance(lastFmModalEl);
        if (modal) modal.hide();

        alert(`¡Conectado exitosamente con Last.fm (@${user})!\nAhora verás tus streams reales sincronizados.`);
        loadStats();
    } catch (e) {
        console.error(e);
        if (lastFmError) {
            lastFmError.textContent = 'Error al conectar con los servidores de Last.fm.';
            lastFmError.classList.remove('d-none');
        }
    } finally {
        btnLastFmSave.disabled = false;
        btnLastFmSave.textContent = 'Guardar y Sincronizar';
    }
}

function handleDisconnectLastFm() {
    localStorage.removeItem('lastfm_user');
    localStorage.removeItem('lastfm_key');
    lastFmTracksMap = {};
    lastFmArtistsMap = {};
    initLastFmState();

    const modal = bootstrap.Modal.getInstance(lastFmModalEl);
    if (modal) modal.hide();

    loadStats();
}

async function fetchLastFmDataIfNeeded() {
    const user = localStorage.getItem('lastfm_user');
    const key = localStorage.getItem('lastfm_key');
    if (!user || !key) return;

    let period = '1month';
    if (currentRange === 'medium_term') period = '6month';
    if (currentRange === 'long_term') period = 'overall';

    try {
        if (currentType === 'tracks') {
            const res = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getTopTracks&user=${encodeURIComponent(user)}&period=${period}&limit=100&api_key=${encodeURIComponent(key)}&format=json`);
            const data = await res.json();
            if (data?.toptracks?.track) {
                lastFmTracksMap = {};
                data.toptracks.track.forEach(t => {
                    const k = `${normalizeKey(t.name)}::${normalizeKey(t.artist?.name)}`;
                    lastFmTracksMap[k] = t.playcount;
                });
            }
        } else if (currentType === 'artists') {
            const res = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getTopArtists&user=${encodeURIComponent(user)}&period=${period}&limit=100&api_key=${encodeURIComponent(key)}&format=json`);
            const data = await res.json();
            if (data?.topartists?.artist) {
                lastFmArtistsMap = {};
                data.topartists.artist.forEach(a => {
                    const k = normalizeKey(a.name);
                    lastFmArtistsMap[k] = a.playcount;
                });
            }
        }
    } catch (e) {
        console.warn('No se pudieron obtener datos de Last.fm:', e);
    }
}

// ----------------------------------------------------
// ACCIÓN: GUARDAR TOP COMO PLAYLIST
// ----------------------------------------------------
async function handleSavePlaylist() {
    try {
        if (!userProfileData) {
            await fetchUserProfile();
        }

        const tracksData = await spotifyFetch(`me/top/tracks?time_range=${currentRange}&limit=50`);
        if (!tracksData || !tracksData.items || tracksData.items.length === 0) {
            alert('No se encontraron canciones para crear la playlist.');
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
            return;
        }

        const uris = tracksData.items.map(t => t.uri).filter(Boolean);
        await spotifyFetch(`playlists/${createRes.id}/tracks`, {
            method: 'POST',
            body: JSON.stringify({ uris: uris })
        });

        if (confirm(`¡Playlist "${payload.name}" guardada con éxito en tu Spotify!\n\n¿Deseas abrirla ahora?`)) {
            window.open(createRes.external_urls?.spotify, '_blank');
        }
    } catch (err) {
        console.error(err);
        alert('Ocurrió un error al guardar la playlist.');
    }
}

// ----------------------------------------------------
// ACCIÓN: TARJETA PARA COMPARTIR
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
