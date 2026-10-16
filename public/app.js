const CLIENT_ID = '78c1217f07404df7b95cceb3e7cc6657';
const REDIRECT_URI = window.location.origin + '/callback';

// Credenciales por defecto de Last.fm (cuenta del usuario)
const DEFAULT_LASTFM_USER = 'Vrak_23';
const DEFAULT_LASTFM_KEY = '82a251af624ca33e3d59215313af74c2';

function getLastFmCredentials() {
    const user = localStorage.getItem('lastfm_user') || DEFAULT_LASTFM_USER;
    const key = localStorage.getItem('lastfm_key') || DEFAULT_LASTFM_KEY;
    return { user, key };
}

let accessToken = localStorage.getItem('spotify_access_token') || null;
let currentSource = 'unified'; // 'unified' (Historial Unificado Spotify + Last.fm) | 'spotify' | 'lastfm'
let unifiedDb = null;
let isUnifiedDbLoading = false;
let spotifyDb = null;
let isSpotifyDbLoading = false;
let lastFmRecentDelta = [];
let hasFetchedLastFmDelta = false;
let currentRange = 'overall'; // 'overall', 'year-YYYY', 'month-YYYY-M' o Last.fm periods
let currentType = 'tracks';  // tracks, artists, albums, recent
let currentLimit = 50;
let userProfileData = null;
let currentLoadedItems = []; // Para compartir en tarjeta

// PWA: Registrar Service Worker con detección de actualizaciones
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then((registration) => {
            registration.onupdatefound = () => {
                const installingWorker = registration.installing;
                if (installingWorker) {
                    installingWorker.onstatechange = () => {
                        if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            const toast = document.getElementById('update-toast');
                            if (toast) {
                                toast.classList.remove('d-none');
                                toast.classList.add('d-flex');
                            }
                        }
                    };
                }
            };
        }).catch(err => {
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

// Toolbar Desplegables DOM
const selectDataSource = document.getElementById('select-data-source');
const selectTimePeriod = document.getElementById('select-time-period');
const selectMonth = document.getElementById('select-month');
const selectLimit = document.getElementById('select-limit');

// Stat Strip DOM
const statStrip = document.getElementById('stat-strip');
const stripPlaycount = document.getElementById('strip-playcount');
const stripHoursWrapper = document.getElementById('strip-hours-wrapper');
const stripHoursDot = document.getElementById('strip-hours-dot');
const stripHours = document.getElementById('strip-hours');
const stripArtists = document.getElementById('strip-artists');
const stripAlbums = document.getElementById('strip-albums');

// PWA Update DOM
const updateToast = document.getElementById('update-toast');
const btnApplyUpdate = document.getElementById('btn-apply-update');
const menuForceUpdate = document.getElementById('menu-force-update');

// Last.fm Modal & Drawer DOM
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

// ----------------------------------------------------
// UTILIDADES
// ----------------------------------------------------
function formatNumber(num) {
    if (!num) return '0';
    const n = parseInt(num, 10);
    if (isNaN(n)) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toLocaleString();
}

function normalizeKey(str) {
    return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function formatDate(timestampUTS) {
    if (!timestampUTS) return '';
    const date = new Date(parseInt(timestampUTS, 10) * 1000);
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

const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];
const MONTH_SHORT_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function getRangeLabel(range) {
    if (range && range.startsWith('month-')) {
        const parts = range.split('-'); // ['month', '2026', '9']
        const year = parts[1];
        const monthNum = parseInt(parts[2], 10);
        return `${MONTH_NAMES[monthNum - 1]} ${year}`;
    }
    if (range && range.startsWith('year-')) return `Año ${range.replace('year-', '')}`;
    if (range === '7day') return 'Últimos 7 Días';
    if (range === '1month') return 'Último Mes';
    if (range === '3month') return 'Últimos 3 Meses';
    if (range === '6month') return 'Últimos 6 Meses';
    if (range === '12month') return 'Último Año';
    if (range === 'overall') return 'Histórico Total';
    return range;
}

// ----------------------------------------------------
// EVENT LISTENERS & INICIALIZACIÓN
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();

    // Procesar posible retorno de Spotify OAuth PKCE
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
        await fetchAccessToken(code);
    } else {
        // La app se basa en Last.fm: Mostrar dashboard directamente
        showDashboard();
    }
});

function setupEventListeners() {
    if (btnLogin) {
        btnLogin.addEventListener('click', redirectToSpotifyLogin);
    }

    // Segmented Content Tabs (Canciones, Artistas, Álbumes, Recientes)
    document.querySelectorAll('#content-type-tabs .segmented-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#content-type-tabs .segmented-tab').forEach(b => b.classList.remove('active'));
            const target = e.currentTarget;
            target.classList.add('active');
            currentType = target.getAttribute('data-type');
            loadStats();
        });
    });

    // Toolbar Desplegables
    if (selectDataSource) {
        selectDataSource.addEventListener('change', (e) => {
            switchDataSource(e.target.value);
        });
    }

    if (selectTimePeriod) {
        selectTimePeriod.addEventListener('change', (e) => {
            handleTimePeriodChange(e.target.value);
        });
    }

    if (selectMonth) {
        selectMonth.addEventListener('change', (e) => {
            handleMonthChange(e.target.value);
        });
    }

    if (selectLimit) {
        selectLimit.addEventListener('change', (e) => {
            currentLimit = parseInt(e.target.value, 10);
            loadStats();
        });
    }

    // Modal: Bloquear scroll de la parte de atrás completamente
    document.addEventListener('show.bs.modal', () => {
        document.documentElement.classList.add('modal-open');
        document.body.classList.add('modal-open');
        document.body.style.overflow = 'hidden';
    });
    document.addEventListener('hidden.bs.modal', () => {
        document.documentElement.classList.remove('modal-open');
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
    });
    // Prevenir touchmove detrás del modal en dispositivos táctiles
    document.addEventListener('touchmove', function(e) {
        if (document.body.classList.contains('modal-open')) {
            if (!e.target.closest('.modal-body') && !e.target.closest('.modal-dialog')) {
                e.preventDefault();
            }
        }
    }, { passive: false });

    // Acciones de Actualización PWA / Forzar Limpieza
    if (menuForceUpdate) {
        menuForceUpdate.addEventListener('click', forceAppUpdate);
    }
    if (btnApplyUpdate) {
        btnApplyUpdate.addEventListener('click', forceAppUpdate);
    }

    // Acciones del Menú Hamburguesa
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

    // Modal Descargar Tarjeta PNG
    if (btnDownloadCard) {
        btnDownloadCard.addEventListener('click', handleDownloadCard);
    }

    // Instalación PWA botones
    if (btnInstallLogin) {
        btnInstallLogin.addEventListener('click', triggerInstallFlow);
    }
    if (btnInstallFab) {
        btnInstallFab.addEventListener('click', triggerInstallFlow);
    }
}

// ----------------------------------------------------
// GESTIÓN DE FUENTES DE DATOS: UNIFICADO / SPOTIFY / LAST.FM
// ----------------------------------------------------
async function loadUnifiedDatabase() {
    if (unifiedDb) return unifiedDb;
    if (isUnifiedDbLoading) {
        while (isUnifiedDbLoading) {
            await new Promise(r => setTimeout(r, 100));
        }
        return unifiedDb;
    }
    isUnifiedDbLoading = true;
    try {
        const res = await fetch('/data/unified_history.json');
        if (res.ok) {
            unifiedDb = await res.json();
            console.log('Base de datos Unificada (Spotify + Last.fm) cargada:', unifiedDb.summary);
        }
    } catch (e) {
        console.warn('Error al cargar unified_history.json:', e);
    } finally {
        isUnifiedDbLoading = false;
    }
    return unifiedDb;
}

async function loadSpotifyDatabase() {
    if (spotifyDb) return spotifyDb;
    if (isSpotifyDbLoading) {
        while (isSpotifyDbLoading) {
            await new Promise(r => setTimeout(r, 100));
        }
        return spotifyDb;
    }
    isSpotifyDbLoading = true;
    try {
        const res = await fetch('/data/spotify_history.json');
        if (res.ok) {
            spotifyDb = await res.json();
            console.log('Base de datos Spotify extendida cargada:', spotifyDb.summary);
        }
    } catch (e) {
        console.warn('Error al cargar spotify_history.json:', e);
    } finally {
        isSpotifyDbLoading = false;
    }
    return spotifyDb;
}

async function getActiveDatabase() {
    if (currentSource === 'unified') {
        const u = await loadUnifiedDatabase();
        if (u) return u;
    }
    return await loadSpotifyDatabase();
}

async function fetchLastFmDelta() {
    if (hasFetchedLastFmDelta) return lastFmRecentDelta;
    const { user, key } = getLastFmCredentials();
    if (!user || !key) return [];
    try {
        const cutoffUTS = Math.floor(new Date('2026-10-14T21:59:34Z').getTime() / 1000);
        const res = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(user)}&from=${cutoffUTS}&api_key=${encodeURIComponent(key)}&limit=200&format=json`);
        if (res.ok) {
            const data = await res.json();
            const tracks = data?.recenttracks?.track || [];
            lastFmRecentDelta = Array.isArray(tracks) ? tracks : (tracks ? [tracks] : []);
            hasFetchedLastFmDelta = true;
        }
    } catch (e) {
        console.warn('Error al consultar delta de Last.fm:', e);
    }
    return lastFmRecentDelta;
}

async function switchDataSource(source) {
    if (currentSource === source) return;
    currentSource = source;

    if (source === 'lastfm') {
        if (stripHoursWrapper) stripHoursWrapper.classList.add('d-none');
        if (stripHoursDot) stripHoursDot.classList.add('d-none');

        if (selectTimePeriod) {
            selectTimePeriod.innerHTML = `
                <option value="overall" selected>Histórico Total</option>
                <option value="7day">Últimos 7 Días</option>
                <option value="1month">Último Mes</option>
                <option value="3month">Últimos 3 Meses</option>
                <option value="6month">Últimos 6 Meses</option>
                <option value="12month">Último Año</option>
                <option value="year-2026">Año 2026</option>
                <option value="year-2025">Año 2025</option>
            `;
            selectTimePeriod.value = 'overall';
        }
        if (selectMonth) {
            selectMonth.disabled = true;
            selectMonth.innerHTML = '<option value="all" selected>Todo el año</option>';
        }
        currentRange = 'overall';
        fetchLastFmGlobalStats();
    } else {
        // 'unified' o 'spotify'
        if (stripHoursWrapper) stripHoursWrapper.classList.remove('d-none');
        if (stripHoursDot) stripHoursDot.classList.remove('d-none');

        if (selectTimePeriod) {
            selectTimePeriod.innerHTML = `
                <option value="overall" selected>Histórico Total</option>
                <option value="year-2026">Año 2026</option>
                <option value="year-2025">Año 2025</option>
                <option value="year-2024">Año 2024</option>
                <option value="year-2023">Año 2023</option>
                <option value="year-2022">Año 2022</option>
                <option value="year-2021">Año 2021</option>
                <option value="year-2020">Año 2020</option>
                <option value="year-2019">Año 2019</option>
            `;
            selectTimePeriod.value = 'overall';
        }
        if (selectMonth) {
            selectMonth.disabled = true;
            selectMonth.innerHTML = '<option value="all" selected>Todo el año</option>';
        }
        currentRange = 'overall';
        updateStatStrip();
    }

    loadStats();
}

function handleTimePeriodChange(val) {
    if (val.startsWith('year-')) {
        const year = val.replace('year-', '');
        updateMonthDropdown(year);
        if (selectMonth) {
            selectMonth.disabled = false;
            selectMonth.value = 'all';
        }
        currentRange = val;
    } else {
        if (selectMonth) {
            selectMonth.disabled = true;
            selectMonth.innerHTML = '<option value="all" selected>Todo el año</option>';
        }
        currentRange = val;
    }
    updateStatStrip();
    loadStats();
}

function handleMonthChange(val) {
    if (val === 'all') {
        currentRange = selectTimePeriod?.value || 'overall';
    } else {
        const year = (selectTimePeriod?.value || 'year-2026').replace('year-', '');
        currentRange = `month-${year}-${val}`;
    }
    updateStatStrip();
    loadStats();
}

function updateMonthDropdown(year) {
    if (!selectMonth) return;
    const activeDb = (currentSource === 'unified') ? (unifiedDb || spotifyDb) : spotifyDb;
    const availableMonths = (activeDb?.yearlyTops?.[year]?.months) ?
        Object.keys(activeDb.yearlyTops[year].months).map(m => parseInt(m, 10)).sort((a, b) => a - b) :
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

    selectMonth.innerHTML = '<option value="all" selected>Todo el año</option>';
    availableMonths.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = MONTH_NAMES[m - 1];
        selectMonth.appendChild(opt);
    });
}

function updateStatStrip() {
    if (!statStrip) return;
    statStrip.classList.remove('d-none');
    statStrip.classList.add('d-flex');

    if (currentSource === 'lastfm') {
        if (stripHoursWrapper) stripHoursWrapper.classList.add('d-none');
        if (stripHoursDot) stripHoursDot.classList.add('d-none');
        return;
    }

    if (stripHoursWrapper) stripHoursWrapper.classList.remove('d-none');
    if (stripHoursDot) stripHoursDot.classList.remove('d-none');

    const activeDb = (currentSource === 'unified') ? (unifiedDb || spotifyDb) : spotifyDb;

    if (!activeDb) {
        if (currentSource === 'unified') {
            if (stripPlaycount) stripPlaycount.textContent = '71.7K';
            if (stripHours) stripHours.textContent = '3,691';
            if (stripArtists) stripArtists.textContent = '1,676';
            if (stripAlbums) stripAlbums.textContent = '3,500+';
        } else {
            if (stripPlaycount) stripPlaycount.textContent = '63.1K';
            if (stripHours) stripHours.textContent = '3,192';
            if (stripArtists) stripArtists.textContent = '1,654';
            if (stripAlbums) stripAlbums.textContent = '3,465';
        }
        return;
    }

    const deltaCount = (currentSource === 'unified') ? lastFmRecentDelta.length : 0;
    const deltaHours = deltaCount * (3.5 / 60);

    // Periodo: Año específico
    if (currentRange.startsWith('year-')) {
        const y = currentRange.replace('year-', '');
        const yData = activeDb.yearlyTops?.[y];
        if (yData) {
            const extra = (y === '2026') ? deltaCount : 0;
            const extraH = (y === '2026') ? deltaHours : 0;
            if (stripPlaycount) stripPlaycount.textContent = formatNumber(yData.plays + extra);
            if (stripHours) stripHours.textContent = Math.round(parseFloat(yData.hours || 0) + extraH).toLocaleString();
            if (stripArtists) stripArtists.textContent = formatNumber(yData.artists?.length || 0);
            if (stripAlbums) stripAlbums.textContent = formatNumber(yData.albums?.length || 0);
            return;
        }
    }

    // Periodo: Mes específico (month-YYYY-M)
    if (currentRange.startsWith('month-')) {
        const parts = currentRange.split('-');
        const y = parts[1];
        const m = parts[2];
        const mData = activeDb.yearlyTops?.[y]?.months?.[m];
        if (mData) {
            const extra = (y === '2026' && m === '10') ? deltaCount : 0;
            const extraH = (y === '2026' && m === '10') ? deltaHours : 0;
            if (stripPlaycount) stripPlaycount.textContent = formatNumber(mData.plays + extra);
            if (stripHours) stripHours.textContent = (parseFloat(mData.hours || 0) + extraH).toFixed(1);
            if (stripArtists) stripArtists.textContent = formatNumber(mData.artists?.length || 0);
            if (stripAlbums) stripAlbums.textContent = formatNumber(mData.albums?.length || 0);
            return;
        }
    }

    // Apartado General / Histórico Total Unificado o Spotify
    const s = activeDb.summary;
    const totalStreams = s.validStreams + deltaCount;
    const totalH = Math.round(parseFloat(s.totalHours) + deltaHours);

    if (stripPlaycount) stripPlaycount.textContent = formatNumber(totalStreams);
    if (stripHours) stripHours.textContent = totalH.toLocaleString();
    if (stripArtists) stripArtists.textContent = formatNumber(activeDb.yearlyTops?.overall?.artists?.length || s.totalArtists || 1654);
    if (stripAlbums) stripAlbums.textContent = formatNumber(activeDb.yearlyTops?.overall?.albums?.length || s.totalAlbums || 3465);
}

async function forceAppUpdate() {
    if (menuForceUpdate) {
        menuForceUpdate.innerHTML = '<span class="spinner-border spinner-border-sm me-2 text-info"></span><span class="text-info">Actualizando...</span>';
    }
    try {
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
        }
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (let r of regs) {
                await r.unregister();
            }
        }
    } catch (e) {
        console.error('Error al limpiar caché:', e);
    }
    window.location.href = window.location.origin + '/?v=' + Date.now();
}

function handleLogout() {
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('code_verifier');
    localStorage.removeItem('lastfm_user');
    localStorage.removeItem('lastfm_key');
    accessToken = null;
    window.location.reload();
}

// ----------------------------------------------------
// MOSTRAR VISTAS
// ----------------------------------------------------
function showLogin() {
    loginView.classList.remove('d-none');
    dashboardView.classList.add('d-none');
    navActions.classList.add('d-none');
    if (btnInstallFab) btnInstallFab.classList.add('d-none');
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

    initLastFmState();
    startCurrentlyPlayingPolling();

    if (accessToken) {
        fetchUserProfile();
    }

    // Inicializar selects de la barra de herramientas
    if (selectDataSource) selectDataSource.value = currentSource;
    if (selectLimit) selectLimit.value = String(currentLimit);

    updateStatStrip();

    if (currentSource === 'unified') {
        loadUnifiedDatabase().then(() => {
            fetchLastFmDelta().then(() => {
                updateStatStrip();
                loadStats();
            });
        });
    } else if (currentSource === 'spotify') {
        loadSpotifyDatabase().then(() => {
            updateStatStrip();
            loadStats();
        });
    } else {
        fetchLastFmGlobalStats();
        loadStats();
    }
}

// ----------------------------------------------------
// SPOTIFY AUTH (OPCIONAL / PARA GUARDAR PLAYLISTS)
// ----------------------------------------------------
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
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        });
        const data = await response.json();
        if (data.access_token) {
            accessToken = data.access_token;
            localStorage.setItem('spotify_access_token', accessToken);
            window.history.replaceState({}, document.title, "/");
            showDashboard();
        } else {
            showDashboard();
        }
    } catch (err) {
        showDashboard();
    }
}

async function spotifyFetch(endpoint, options = {}) {
    if (!accessToken) return null;
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
            accessToken = null;
            return null;
        }
        if (res.status === 204) return null;
        return await res.json();
    } catch (err) {
        return null;
    }
}

async function fetchUserProfile() {
    const data = await spotifyFetch('me');
    if (!data) return;
    userProfileData = data;
    if (drawerUserName) drawerUserName.textContent = data.display_name || 'Usuario';
    if (drawerUserFollowers) drawerUserFollowers.textContent = `${data.followers ? data.followers.total : 0} seguidores en Spotify`;
    const avatarUrl = data.images && data.images.length > 0 ? data.images[0].url : null;
    if (avatarUrl) {
        if (userImg) userImg.src = avatarUrl;
        if (drawerUserImg) drawerUserImg.src = avatarUrl;
    }
}

// ----------------------------------------------------
// EN VIVO: DETECCIÓN DE REPRODUCCIÓN ACTUAL
// ----------------------------------------------------
let currentlyPlayingTimer = null;
let lastPlayingTrackKey = null;

async function fetchCurrentlyPlaying() {
    const { user, key } = getLastFmCredentials();
    if (user && key) {
        try {
            const lfRes = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getRecentTracks&user=${encodeURIComponent(user)}&api_key=${encodeURIComponent(key)}&limit=1&format=json`);
            const lfData = await lfRes.json();
            const firstTrack = lfData?.recenttracks?.track?.[0];
            const isPlaying = firstTrack && firstTrack['@attr']?.nowplaying === 'true';

            if (isPlaying) {
                const trackName = firstTrack.name || '';
                const artistName = firstTrack.artist ? (firstTrack.artist['#text'] || firstTrack.artist.name) : '';
                const trackKey = `${trackName}:::${artistName}`;

                if (trackKey === lastPlayingTrackKey && currentlyPlayingContainer && currentlyPlayingContainer.innerHTML.trim() !== '') {
                    return;
                }
                lastPlayingTrackKey = trackKey;

                const cover = firstTrack.image?.[1]?.['#text'] || 'https://via.placeholder.com/42';
                const spotifySearch = `https://open.spotify.com/search/${encodeURIComponent(trackName + ' ' + artistName)}`;

                if (currentlyPlayingContainer) {
                    currentlyPlayingContainer.innerHTML = `
                        <div class="card-uniform border-primary border-opacity-40" style="background: linear-gradient(90deg, rgba(20, 16, 30, 0.95) 0%, rgba(38, 22, 60, 0.85) 100%);">
                            <img src="${cover}" class="img-thumb" alt="Cover" onerror="this.src='/logo.png'">
                            <div class="overflow-hidden flex-grow-1" style="min-width: 0;">
                                <div class="d-flex align-items-center gap-1.5">
                                    <span class="badge bg-primary bg-opacity-25 text-white border border-primary border-opacity-30" style="font-size: 0.65rem;">
                                        <i class="fa-solid fa-volume-high me-1 text-primary"></i> En vivo
                                    </span>
                                </div>
                                <div class="fw-bold text-truncate text-white" style="font-size: 0.84rem;">${trackName}</div>
                                <small class="text-secondary text-truncate d-block" style="font-size: 0.72rem;">${artistName}</small>
                            </div>
                            <a href="${spotifySearch}" target="_blank" rel="noopener noreferrer" class="btn-card-action" title="Escuchar en Spotify">
                                <i class="fa-brands fa-spotify" style="color: #1ed760; font-size: 0.85rem;"></i>
                            </a>
                        </div>
                    `;
                }
                return;
            }
        } catch (e) {
            // Ignorar errores temporales
        }
    }

    if (lastPlayingTrackKey !== null) {
        lastPlayingTrackKey = null;
        if (currentlyPlayingContainer) currentlyPlayingContainer.innerHTML = '';
    }
}

function startCurrentlyPlayingPolling() {
    if (currentlyPlayingTimer) clearInterval(currentlyPlayingTimer);
    fetchCurrentlyPlaying();
    currentlyPlayingTimer = setInterval(fetchCurrentlyPlaying, 7000);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            fetchCurrentlyPlaying();
        }
    });

    window.addEventListener('focus', () => {
        fetchCurrentlyPlaying();
    });
}

// ----------------------------------------------------
// MOTOR PRINCIPAL DE DATOS: LAST.FM
// ----------------------------------------------------
function initLastFmState() {
    const { user, key } = getLastFmCredentials();

    if (user && key) {
        if (drawerLastFmStatus) {
            drawerLastFmStatus.textContent = `@${user}`;
            drawerLastFmStatus.className = 'badge bg-danger bg-opacity-25 text-danger border border-danger border-opacity-25';
        }
        if (btnLastFmDisconnect) btnLastFmDisconnect.classList.remove('d-none');
    } else {
        if (drawerLastFmStatus) {
            drawerLastFmStatus.textContent = 'Opcional';
            drawerLastFmStatus.className = 'badge bg-secondary bg-opacity-25';
        }
        if (btnLastFmDisconnect) btnLastFmDisconnect.classList.add('d-none');
    }
}

async function fetchLastFmGlobalStats() {
    const { user, key } = getLastFmCredentials();
    if (!user || !key) return;

    try {
        const res = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getinfo&user=${encodeURIComponent(user)}&api_key=${encodeURIComponent(key)}&format=json`);
        const data = await res.json();
        if (data && data.user) {
            if (statStrip) {
                statStrip.classList.remove('d-none');
                statStrip.classList.add('d-flex');
            }
            if (stripPlaycount) stripPlaycount.textContent = formatNumber(data.user.playcount);
            if (stripArtists) stripArtists.textContent = formatNumber(data.user.artist_count);
            if (stripAlbums) stripAlbums.textContent = formatNumber(data.user.album_count);

            const lfImg = data.user.image && data.user.image[1] && data.user.image[1]['#text'];
            if (lfImg && !accessToken) {
                if (userImg) userImg.src = lfImg;
                if (drawerUserImg) drawerUserImg.src = lfImg;
            }
            if (drawerUserName && !accessToken) {
                drawerUserName.textContent = data.user.name;
            }
            if (drawerUserFollowers && !accessToken) {
                drawerUserFollowers.textContent = `${formatNumber(data.user.playcount)} scrobbles en Last.fm`;
            }

            const regUTS = parseInt(data.user.registered?.unixtime || data.user.registered?.['#text'] || 0, 10);
            if (regUTS) {
                const regDate = new Date(regUTS * 1000);
                const regYear = regDate.getFullYear();
                const regMonth = regDate.getMonth() + 1;
                renderYearsFilter(regYear, regMonth);
            }
        }
    } catch (e) {
        console.warn(e);
    }
}

async function loadStats() {
    statsList.innerHTML = '';
    loader.classList.remove('d-none');

    // ====================================================
    // MODO HISTORIAL EXTENDIDO SPOTIFY (2019 - 2026) / UNIFICADO
    // ====================================================
    if (currentSource === 'spotify' || currentSource === 'unified') {
        const activeDb = await getActiveDatabase();
        if (currentSource === 'unified' && !hasFetchedLastFmDelta) {
            await fetchLastFmDelta();
        }
        loader.classList.add('d-none');

        if (!activeDb) {
            statsList.innerHTML = '<div class="text-center text-danger py-5">Error al cargar la base de datos de música.</div>';
            return;
        }

        updateStatStrip();

        let topData = activeDb.yearlyTops?.overall;
        if (currentRange.startsWith('year-')) {
            const y = currentRange.replace('year-', '');
            topData = activeDb.yearlyTops?.[y] || activeDb.yearlyTops?.overall;
        } else if (currentRange.startsWith('month-')) {
            const parts = currentRange.split('-');
            const y = parts[1];
            const m = parts[2];
            topData = activeDb.yearlyTops?.[y]?.months?.[m] || activeDb.yearlyTops?.overall;
        }

        const appliesDelta = (currentSource === 'unified' && lastFmRecentDelta.length > 0 &&
            (currentRange === 'overall' || currentRange === 'year-2026' || currentRange === 'month-2026-10'));

        if (currentType === 'tracks') {
            const rawTracks = topData?.tracks || [];
            if (rawTracks.length === 0 && (!appliesDelta || lastFmRecentDelta.length === 0)) {
                statsList.innerHTML = '<div class="text-center text-secondary py-5">No se encontraron canciones registradas para este periodo.</div>';
                return;
            }

            let combinedTracks = rawTracks.map(t => ({
                name: t.name,
                artist: t.artist,
                album: t.album,
                plays: t.plays,
                uri: t.uri
            }));

            if (appliesDelta) {
                const trackMap = new Map();
                combinedTracks.forEach(t => {
                    const key = `${normalizeKey(t.name)}:::${normalizeKey(t.artist || '')}`;
                    trackMap.set(key, t);
                });

                lastFmRecentDelta.forEach(dt => {
                    const dtName = dt.name;
                    const dtArtist = dt.artist ? (dt.artist['#text'] || dt.artist.name || '') : '';
                    const dtAlbum = dt.album ? (dt.album['#text'] || dt.album.name || '') : '';
                    const key = `${normalizeKey(dtName)}:::${normalizeKey(dtArtist)}`;
                    if (trackMap.has(key)) {
                        trackMap.get(key).plays += 1;
                    } else {
                        const newEntry = {
                            name: dtName,
                            artist: dtArtist,
                            album: dtAlbum,
                            plays: 1,
                            uri: null
                        };
                        trackMap.set(key, newEntry);
                        combinedTracks.push(newEntry);
                    }
                });

                combinedTracks.sort((a, b) => b.plays - a.plays);
            }

            const tracks = combinedTracks.slice(0, currentLimit).map(t => ({
                name: t.name,
                artist: { name: t.artist },
                album: { name: t.album },
                playcount: t.plays,
                uri: t.uri
            }));
            currentLoadedItems = tracks;
            renderTracks(tracks);
            return;
        }

        if (currentType === 'artists') {
            const rawArtists = topData?.artists || [];
            if (rawArtists.length === 0 && (!appliesDelta || lastFmRecentDelta.length === 0)) {
                statsList.innerHTML = '<div class="text-center text-secondary py-5">No se encontraron artistas registrados para este periodo.</div>';
                return;
            }

            let combinedArtists = rawArtists.map(a => ({
                name: a.name,
                plays: a.plays
            }));

            if (appliesDelta) {
                const artistMap = new Map();
                combinedArtists.forEach(a => {
                    artistMap.set(normalizeKey(a.name), a);
                });

                lastFmRecentDelta.forEach(dt => {
                    const dtArtist = dt.artist ? (dt.artist['#text'] || dt.artist.name || '') : '';
                    if (!dtArtist) return;
                    const key = normalizeKey(dtArtist);
                    if (artistMap.has(key)) {
                        artistMap.get(key).plays += 1;
                    } else {
                        const newEntry = { name: dtArtist, plays: 1 };
                        artistMap.set(key, newEntry);
                        combinedArtists.push(newEntry);
                    }
                });

                combinedArtists.sort((a, b) => b.plays - a.plays);
            }

            const artists = combinedArtists.slice(0, currentLimit).map(a => ({
                name: a.name,
                playcount: a.plays
            }));
            currentLoadedItems = artists;
            renderArtists(artists);
            return;
        }

        if (currentType === 'albums') {
            const rawAlbums = topData?.albums || [];
            if (rawAlbums.length === 0 && (!appliesDelta || lastFmRecentDelta.length === 0)) {
                statsList.innerHTML = '<div class="text-center text-secondary py-5">No se encontraron álbumes registrados para este periodo.</div>';
                return;
            }

            let combinedAlbums = rawAlbums.map(al => ({
                name: al.name,
                artist: al.artist,
                plays: al.plays
            }));

            if (appliesDelta) {
                const albumMap = new Map();
                combinedAlbums.forEach(al => {
                    const key = `${normalizeKey(al.name)}:::${normalizeKey(al.artist || '')}`;
                    albumMap.set(key, al);
                });

                lastFmRecentDelta.forEach(dt => {
                    const dtAlbum = dt.album ? (dt.album['#text'] || dt.album.name || '') : '';
                    const dtArtist = dt.artist ? (dt.artist['#text'] || dt.artist.name || '') : '';
                    if (!dtAlbum) return;
                    const key = `${normalizeKey(dtAlbum)}:::${normalizeKey(dtArtist)}`;
                    if (albumMap.has(key)) {
                        albumMap.get(key).plays += 1;
                    } else {
                        const newEntry = { name: dtAlbum, artist: dtArtist, plays: 1 };
                        albumMap.set(key, newEntry);
                        combinedAlbums.push(newEntry);
                    }
                });

                combinedAlbums.sort((a, b) => b.plays - a.plays);
            }

            const albums = combinedAlbums.slice(0, currentLimit).map(al => ({
                name: al.name,
                artist: { name: al.artist },
                playcount: al.plays
            }));
            currentLoadedItems = albums;
            renderAlbums(albums);
            return;
        }

        if (currentType === 'recent') {
            const rawRecent = activeDb.recent || [];

            let deltaFormatted = [];
            if (currentSource === 'unified' && lastFmRecentDelta.length > 0) {
                deltaFormatted = lastFmRecentDelta.map(dt => ({
                    name: dt.name,
                    artist: { name: dt.artist ? (dt.artist['#text'] || dt.artist.name || '') : '' },
                    album: { name: dt.album ? (dt.album['#text'] || dt.album.name || '') : '' },
                    date: dt.date?.uts ? { uts: parseInt(dt.date.uts, 10) } : { uts: Math.floor(Date.now() / 1000) },
                    uri: null,
                    '@attr': dt['@attr']
                }));
            }

            const spotifyFormatted = rawRecent.map(r => ({
                name: r.name,
                artist: { name: r.artist },
                album: { name: r.album },
                date: { uts: Math.floor(new Date(r.ts).getTime() / 1000) },
                uri: r.uri
            }));

            const combinedRecent = [...deltaFormatted, ...spotifyFormatted];
            if (combinedRecent.length === 0) {
                statsList.innerHTML = '<div class="text-center text-secondary py-5">No se encontraron reproducciones registradas.</div>';
                return;
            }

            const recent = combinedRecent.slice(0, currentLimit);
            currentLoadedItems = recent;
            renderRecent(recent);
            return;
        }
        return;
    }

    // ====================================================
    // MODO EN VIVO LAST.FM
    // ====================================================
    const { user, key } = getLastFmCredentials();

    if (!user || !key) {
        loader.classList.add('d-none');
        statsList.innerHTML = `
            <div class="text-center py-5 p-4 rounded border border-danger border-opacity-25 my-3" style="background-color: var(--bg-surface);">
                <i class="fa-brands fa-lastfm text-danger mb-3" style="font-size: 2.8rem;"></i>
                <h5 class="fw-bold mb-2">Conecta tu cuenta de Last.fm</h5>
                <p class="text-secondary small mx-auto mb-3" style="max-width: 420px;">
                    Para ver tus datos en vivo de Last.fm, ingresa tus credenciales.
                </p>
                <button class="btn btn-sm btn-danger px-3 py-2 rounded-pill fw-semibold" onclick="openLastFmModal()">
                    <i class="fa-brands fa-lastfm me-1"></i> Conectar con Last.fm
                </button>
            </div>
        `;
        return;
    }

    try {
        // Filtro por mes específico (ej: month-2026-9)
        if (currentRange.startsWith('month-')) {
            const parts = currentRange.split('-');
            const year = parseInt(parts[1], 10);
            const month = parseInt(parts[2], 10);
            const fromUTS = Math.floor(new Date(Date.UTC(year, month - 1, 1, 0, 0, 0)).getTime() / 1000);
            const toUTS = Math.floor(new Date(Date.UTC(year, month, 0, 23, 59, 59)).getTime() / 1000);
            await loadTimestampRangeStats(user, key, fromUTS, toUTS, `${MONTH_NAMES[month - 1]} de ${year}`);
            return;
        }

        // Filtro por año específico (ej: year-2026, year-2025)
        if (currentRange.startsWith('year-')) {
            const year = parseInt(currentRange.replace('year-', ''), 10);
            const fromUTS = Math.floor(new Date(Date.UTC(year, 0, 1, 0, 0, 0)).getTime() / 1000);
            const toUTS = Math.floor(new Date(Date.UTC(year, 11, 31, 23, 59, 59)).getTime() / 1000);
            await loadTimestampRangeStats(user, key, fromUTS, toUTS, `el año ${year}`);
            return;
        }

        // 1. TOP CANCIONES (Ordenado por scrobbles)
        if (currentType === 'tracks') {
            const res = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getTopTracks&user=${encodeURIComponent(user)}&period=${currentRange}&limit=${currentLimit}&api_key=${encodeURIComponent(key)}&format=json`);
            const data = await res.json();
            loader.classList.add('d-none');
            const tracks = data?.toptracks?.track || [];
            if (tracks.length === 0) {
                statsList.innerHTML = '<div class="text-center text-secondary py-5">No se encontraron canciones registradas para este periodo.</div>';
                return;
            }
            currentLoadedItems = tracks;
            renderTracks(tracks);
            return;
        }

        // 2. TOP ARTISTAS (Ordenado por scrobbles)
        if (currentType === 'artists') {
            const res = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getTopArtists&user=${encodeURIComponent(user)}&period=${currentRange}&limit=${currentLimit}&api_key=${encodeURIComponent(key)}&format=json`);
            const data = await res.json();
            loader.classList.add('d-none');
            const artists = data?.topartists?.artist || [];
            if (artists.length === 0) {
                statsList.innerHTML = '<div class="text-center text-secondary py-5">No se encontraron artistas registrados para este periodo.</div>';
                return;
            }
            currentLoadedItems = artists;
            renderArtists(artists);
            return;
        }

        // 3. TOP ÁLBUMES (Ordenado por scrobbles)
        if (currentType === 'albums') {
            const res = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getTopAlbums&user=${encodeURIComponent(user)}&period=${currentRange}&limit=${currentLimit}&api_key=${encodeURIComponent(key)}&format=json`);
            const data = await res.json();
            loader.classList.add('d-none');
            const albums = data?.topalbums?.album || [];
            if (albums.length === 0) {
                statsList.innerHTML = '<div class="text-center text-secondary py-5">No se encontraron álbumes registrados para este periodo.</div>';
                return;
            }
            currentLoadedItems = albums;
            renderAlbums(albums);
            return;
        }

        // 4. RECIENTES (Historial cronológico)
        if (currentType === 'recent') {
            const res = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getRecentTracks&user=${encodeURIComponent(user)}&limit=${currentLimit}&api_key=${encodeURIComponent(key)}&format=json`);
            const data = await res.json();
            loader.classList.add('d-none');
            const tracks = data?.recenttracks?.track || [];
            if (tracks.length === 0) {
                statsList.innerHTML = '<div class="text-center text-secondary py-5">No se encontraron reproducciones recientes.</div>';
                return;
            }
            currentLoadedItems = tracks;
            renderRecent(tracks);
            return;
        }
    } catch (err) {
        console.error('Error al cargar stats:', err);
        loader.classList.add('d-none');
        statsList.innerHTML = '<div class="text-center text-danger py-5">Error al cargar datos desde Last.fm.</div>';
    }
}

// ----------------------------------------------------
// FILTRO POR AÑOS Y MESES ESPECÍFICOS DE USO DE LAST.FM
// ----------------------------------------------------
let userRegYear = null;
let userRegMonth = null;

function renderYearsFilter(regYear, regMonth) {
    userRegYear = regYear;
    userRegMonth = regMonth;
    if (!yearsFilterContainer || !yearsPillList) return;
    const currentYear = new Date().getFullYear();
    yearsPillList.innerHTML = '';

    const years = [];
    for (let y = currentYear; y >= regYear; y--) {
        years.push(y);
    }

    if (years.length === 0) {
        yearsFilterContainer.classList.add('d-none');
        yearsFilterContainer.classList.remove('d-flex');
        return;
    }

    yearsFilterContainer.classList.remove('d-none');
    yearsFilterContainer.classList.add('d-flex');

    years.forEach(year => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isYearActive = currentRange.startsWith(`year-${year}`) || currentRange.startsWith(`month-${year}-`);
        btn.className = `pill-btn year-pill-btn ${isYearActive ? 'active' : ''}`;
        btn.setAttribute('data-year', year);
        btn.textContent = year;

        btn.addEventListener('click', () => {
            // Deseleccionar botones de periodos relativos
            document.querySelectorAll('#time-range-tabs .pill-btn').forEach(b => b.classList.remove('active'));
            // Activar este botón de año
            document.querySelectorAll('.year-pill-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Renderizar los meses para este año
            currentRange = `year-${year}`;
            renderMonthsFilter(year, userRegYear, userRegMonth);
            loadStats();
        });

        yearsPillList.appendChild(btn);
    });
}

function renderMonthsFilter(year, regYear, regMonth) {
    if (!monthsFilterContainer || !monthsPillList) return;
    monthsPillList.innerHTML = '';

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1; // 1-12

    const startMonth = (year === regYear) ? (regMonth || 1) : 1;
    const endMonth = (year === currentYear) ? currentMonth : 12;

    monthsFilterContainer.classList.remove('d-none');
    monthsFilterContainer.classList.add('d-flex');

    // Botón "Todo el año"
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = `pill-btn month-pill-btn ${currentRange === `year-${year}` ? 'active' : ''}`;
    allBtn.textContent = 'Todo el año';
    allBtn.addEventListener('click', () => {
        document.querySelectorAll('.month-pill-btn').forEach(b => b.classList.remove('active'));
        allBtn.classList.add('active');
        currentRange = `year-${year}`;
        loadStats();
    });
    monthsPillList.appendChild(allBtn);

    // Botones de cada mes disponible para ese año
    for (let m = startMonth; m <= endMonth; m++) {
        const mBtn = document.createElement('button');
        mBtn.type = 'button';
        mBtn.className = `pill-btn month-pill-btn ${currentRange === `month-${year}-${m}` ? 'active' : ''}`;
        mBtn.textContent = MONTH_SHORT_NAMES[m - 1];
        mBtn.setAttribute('title', `${MONTH_NAMES[m - 1]} ${year}`);

        mBtn.addEventListener('click', () => {
            document.querySelectorAll('#time-range-tabs .pill-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.month-pill-btn').forEach(b => b.classList.remove('active'));
            mBtn.classList.add('active');

            currentRange = `month-${year}-${m}`;
            loadStats();
        });

        monthsPillList.appendChild(mBtn);
    }
}

async function loadTimestampRangeStats(user, key, fromUTS, toUTS, emptyLabel) {
    try {
        // 1. TOP CANCIONES (user.getweeklytrackchart)
        if (currentType === 'tracks') {
            const res = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getweeklytrackchart&user=${encodeURIComponent(user)}&from=${fromUTS}&to=${toUTS}&api_key=${encodeURIComponent(key)}&format=json`);
            const data = await res.json();
            loader.classList.add('d-none');
            const tracks = data?.weeklytrackchart?.track || [];
            if (tracks.length === 0) {
                statsList.innerHTML = `<div class="text-center text-secondary py-5">No se encontraron canciones registradas para ${emptyLabel}.</div>`;
                return;
            }
            const sliced = tracks.slice(0, currentLimit);
            currentLoadedItems = sliced;
            renderTracks(sliced);
            return;
        }

        // 2. TOP ARTISTAS (user.getweeklyartistchart)
        if (currentType === 'artists') {
            const res = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getweeklyartistchart&user=${encodeURIComponent(user)}&from=${fromUTS}&to=${toUTS}&api_key=${encodeURIComponent(key)}&format=json`);
            const data = await res.json();
            loader.classList.add('d-none');
            const artists = data?.weeklyartistchart?.artist || [];
            if (artists.length === 0) {
                statsList.innerHTML = `<div class="text-center text-secondary py-5">No se encontraron artistas registrados para ${emptyLabel}.</div>`;
                return;
            }
            const sliced = artists.slice(0, currentLimit);
            currentLoadedItems = sliced;
            renderArtists(sliced);
            return;
        }

        // 3. TOP ÁLBUMES (user.getweeklyalbumchart)
        if (currentType === 'albums') {
            const res = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getweeklyalbumchart&user=${encodeURIComponent(user)}&from=${fromUTS}&to=${toUTS}&api_key=${encodeURIComponent(key)}&format=json`);
            const data = await res.json();
            loader.classList.add('d-none');
            const albums = data?.weeklyalbumchart?.album || [];
            if (albums.length === 0) {
                statsList.innerHTML = `<div class="text-center text-secondary py-5">No se encontraron álbumes registrados para ${emptyLabel}.</div>`;
                return;
            }
            const sliced = albums.slice(0, currentLimit);
            currentLoadedItems = sliced;
            renderAlbums(sliced);
            return;
        }

        // 4. HISTORIAL RECIENTE (user.getrecenttracks con from y to)
        if (currentType === 'recent') {
            const res = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(user)}&from=${fromUTS}&to=${toUTS}&limit=${currentLimit}&api_key=${encodeURIComponent(key)}&format=json`);
            const data = await res.json();
            loader.classList.add('d-none');
            const tracks = data?.recenttracks?.track || [];
            if (tracks.length === 0) {
                statsList.innerHTML = `<div class="text-center text-secondary py-5">No se encontraron reproducciones registradas en ${emptyLabel}.</div>`;
                return;
            }
            currentLoadedItems = tracks;
            renderRecent(tracks);
            return;
        }
    } catch (err) {
        console.error('Error al cargar stats por rango:', err);
        loader.classList.add('d-none');
        statsList.innerHTML = `<div class="text-center text-danger py-5">Error al consultar datos de ${emptyLabel} en Last.fm.</div>`;
    }
}

// ----------------------------------------------------
// RESOLUCIÓN DE IMÁGENES DESDE SPOTIFY / ITUNES CON CACHÉ
// ----------------------------------------------------
const artCache = JSON.parse(localStorage.getItem('spoti_art_cache') || '{}');

function saveArtCache() {
    try {
        localStorage.setItem('spoti_art_cache', JSON.stringify(artCache));
    } catch (e) {}
}

async function resolveSpotifyArtwork(name, artist, type = 'track', elementId) {
    const key = `${type}::${normalizeKey(name)}::${normalizeKey(artist || '')}`;

    if (artCache[key]) {
        const el = document.getElementById(elementId);
        if (el) el.src = artCache[key];
        return artCache[key];
    }

    // 1. Si hay accessToken de Spotify, buscar directo en Spotify API
    if (accessToken) {
        try {
            let q = type === 'artist' ? `artist:${name}` : `track:${name} artist:${artist}`;
            if (type === 'album') q = `album:${name} artist:${artist}`;
            const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=${type}&limit=1`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (res.ok) {
                const data = await res.json();
                let img = null;
                if (type === 'track') img = data.tracks?.items?.[0]?.album?.images?.[1]?.url || data.tracks?.items?.[0]?.album?.images?.[0]?.url;
                if (type === 'artist') img = data.artists?.items?.[0]?.images?.[1]?.url || data.artists?.items?.[0]?.images?.[0]?.url;
                if (type === 'album') img = data.albums?.items?.[0]?.images?.[1]?.url || data.albums?.items?.[0]?.images?.[0]?.url;

                if (img) {
                    artCache[key] = img;
                    saveArtCache();
                    const el = document.getElementById(elementId);
                    if (el) el.src = img;
                    return img;
                }
            }
        } catch (e) {}
    }

    // 2. Fallback público instantáneo usando búsqueda de Apple / iTunes (sin necesidad de token)
    try {
        const queryTerm = `${name} ${artist || ''}`.trim();
        const itunesEntity = type === 'artist' ? 'musicArtist' : (type === 'album' ? 'album' : 'song');
        const itRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(queryTerm)}&entity=${itunesEntity}&limit=1`);
        if (itRes.ok) {
            const itData = await itRes.json();
            const rawUrl = itData.results?.[0]?.artworkUrl100;
            if (rawUrl) {
                const hdUrl = rawUrl.replace('100x100bb', '300x300bb');
                artCache[key] = hdUrl;
                saveArtCache();
                const el = document.getElementById(elementId);
                if (el) el.src = hdUrl;
                return hdUrl;
            }
        }
    } catch (e) {}
}

function getInitialImage(item, name, artist, type) {
    const key = `${type}::${normalizeKey(name)}::${normalizeKey(artist || '')}`;
    if (artCache[key]) {
        return artCache[key];
    }
    if (item && item.image && Array.isArray(item.image)) {
        const candidate = item.image[2]?.['#text'] || item.image[1]?.['#text'] || item.image[0]?.['#text'];
        if (candidate && !candidate.includes('2a96cbd8b46e442fc41c2b86b821562f.png') && candidate.startsWith('http')) {
            return candidate;
        }
    }
    return '/logo.png';
}

function getImageFromItem(item) {
    if (!item) return '/logo.png';
    const artistName = item.artist ? (item.artist.name || item.artist['#text'] || item.artist) : '';
    const itemType = currentType === 'artists' ? 'artist' : (currentType === 'albums' ? 'album' : 'track');
    const key = `${itemType}::${normalizeKey(item.name)}::${normalizeKey(artistName)}`;
    if (artCache[key]) return artCache[key];
    return getInitialImage(item, item.name, artistName, itemType);
}

function renderTracks(tracks) {
    statsList.innerHTML = '';
    tracks.forEach((track, index) => {
        const item = document.createElement('div');
        item.className = 'card-uniform';
        const artistName = track.artist ? (track.artist.name || track.artist['#text'] || track.artist) : '';
        const playcount = formatNumber(track.playcount);
        const imgId = `art-track-${index}`;
        const initialImg = getInitialImage(track, track.name, artistName, 'track');
        const spotifySearch = `https://open.spotify.com/search/${encodeURIComponent(track.name + ' ' + artistName)}`;

        item.innerHTML = `
            <span class="card-rank ${index < 3 ? 'top-3' : ''}">#${index + 1}</span>
            <img id="${imgId}" src="${initialImg}" class="img-thumb" alt="Cover" onerror="this.src='/logo.png'">
            <div class="overflow-hidden flex-grow-1" style="min-width: 0;">
                <div class="fw-bold text-truncate text-white" style="font-size: 0.84rem;" title="${track.name}">${track.name}</div>
                <small class="text-secondary text-truncate d-block" style="font-size: 0.72rem;">${artistName}</small>
            </div>
            <span class="badge-scrobble"><i class="fa-solid fa-headphones"></i>${playcount}</span>
            <a href="${spotifySearch}" target="_blank" rel="noopener noreferrer" class="btn-card-action" title="Escuchar en Spotify">
                <i class="fa-brands fa-spotify" style="color: #1ed760; font-size: 0.85rem;"></i>
            </a>
        `;

        // Click en la tarjeta para ver el apartado de estadísticas
        item.addEventListener('click', () => {
            showItemStats('track', track.name, artistName);
        });

        // Prevenir que el click en el enlace de Spotify abra el modal
        const spLink = item.querySelector('.btn-card-action');
        if (spLink) {
            spLink.addEventListener('click', (e) => e.stopPropagation());
        }

        statsList.appendChild(item);

        const key = `track::${normalizeKey(track.name)}::${normalizeKey(artistName)}`;
        if (!artCache[key]) {
            resolveSpotifyArtwork(track.name, artistName, 'track', imgId);
        }
    });
}

function renderArtists(artists) {
    statsList.innerHTML = '';
    artists.forEach((artist, index) => {
        const item = document.createElement('div');
        item.className = 'card-uniform';
        const artistName = artist.name || '';
        const playcount = formatNumber(artist.playcount);
        const imgId = `art-artist-${index}`;
        const initialImg = getInitialImage(artist, artistName, '', 'artist');
        const spotifySearch = `https://open.spotify.com/search/${encodeURIComponent(artistName)}`;

        item.innerHTML = `
            <span class="card-rank ${index < 3 ? 'top-3' : ''}">#${index + 1}</span>
            <img id="${imgId}" src="${initialImg}" class="img-thumb rounded-circle" alt="Artist" onerror="this.src='/logo.png'">
            <div class="overflow-hidden flex-grow-1" style="min-width: 0;">
                <div class="fw-bold text-truncate text-white" style="font-size: 0.84rem;" title="${artistName}">${artistName}</div>
                <small class="text-secondary text-truncate d-block" style="font-size: 0.72rem;">Artista</small>
            </div>
            <span class="badge-scrobble"><i class="fa-solid fa-headphones"></i>${playcount}</span>
            <a href="${spotifySearch}" target="_blank" rel="noopener noreferrer" class="btn-card-action" title="Ver en Spotify">
                <i class="fa-brands fa-spotify" style="color: #1ed760; font-size: 0.85rem;"></i>
            </a>
        `;

        // Click en la tarjeta para ver estadísticas
        item.addEventListener('click', () => {
            showItemStats('artist', artistName, '');
        });

        const spLink = item.querySelector('.btn-card-action');
        if (spLink) {
            spLink.addEventListener('click', (e) => e.stopPropagation());
        }

        statsList.appendChild(item);

        const key = `artist::${normalizeKey(artistName)}::`;
        if (!artCache[key]) {
            resolveSpotifyArtwork(artistName, '', 'artist', imgId);
        }
    });
}

function renderAlbums(albums) {
    statsList.innerHTML = '';
    albums.forEach((album, index) => {
        const item = document.createElement('div');
        item.className = 'card-uniform';
        const artistName = album.artist ? (album.artist.name || album.artist['#text'] || album.artist) : '';
        const playcount = formatNumber(album.playcount);
        const imgId = `art-album-${index}`;
        const initialImg = getInitialImage(album, album.name, artistName, 'album');
        const spotifySearch = `https://open.spotify.com/search/${encodeURIComponent(album.name + ' ' + artistName)}`;

        item.innerHTML = `
            <span class="card-rank ${index < 3 ? 'top-3' : ''}">#${index + 1}</span>
            <img id="${imgId}" src="${initialImg}" class="img-thumb" alt="Album" onerror="this.src='/logo.png'">
            <div class="overflow-hidden flex-grow-1" style="min-width: 0;">
                <div class="fw-bold text-truncate text-white" style="font-size: 0.84rem;" title="${album.name}">${album.name}</div>
                <small class="text-secondary text-truncate d-block" style="font-size: 0.72rem;">${artistName}</small>
            </div>
            <span class="badge-scrobble"><i class="fa-solid fa-headphones"></i>${playcount}</span>
            <a href="${spotifySearch}" target="_blank" rel="noopener noreferrer" class="btn-card-action" title="Escuchar en Spotify">
                <i class="fa-brands fa-spotify" style="color: #1ed760; font-size: 0.85rem;"></i>
            </a>
        `;

        // Click en la tarjeta para ver estadísticas del álbum
        item.addEventListener('click', () => {
            showItemStats('album', album.name, artistName);
        });

        const spLink = item.querySelector('.btn-card-action');
        if (spLink) {
            spLink.addEventListener('click', (e) => e.stopPropagation());
        }

        statsList.appendChild(item);

        const key = `album::${normalizeKey(album.name)}::${normalizeKey(artistName)}`;
        if (!artCache[key]) {
            resolveSpotifyArtwork(album.name, artistName, 'album', imgId);
        }
    });
}

function renderRecent(tracks) {
    statsList.innerHTML = '';
    tracks.forEach((track, index) => {
        const item = document.createElement('div');
        item.className = 'card-uniform';
        const artistName = track.artist ? (track.artist['#text'] || track.artist.name || track.artist) : '';
        const isNowPlaying = track['@attr']?.nowplaying === 'true';
        const playedAtStr = isNowPlaying ? 'En vivo' : formatDate(track.date?.uts);
        const imgId = `art-recent-${index}`;
        const initialImg = getInitialImage(track, track.name, artistName, 'track');
        const spotifySearch = `https://open.spotify.com/search/${encodeURIComponent(track.name + ' ' + artistName)}`;

        item.innerHTML = `
            <span class="card-rank">#${index + 1}</span>
            <img id="${imgId}" src="${initialImg}" class="img-thumb" alt="Cover" onerror="this.src='/logo.png'">
            <div class="overflow-hidden flex-grow-1" style="min-width: 0;">
                <div class="fw-bold text-truncate text-white" style="font-size: 0.84rem;" title="${track.name}">${track.name}</div>
                <small class="text-secondary text-truncate d-block" style="font-size: 0.72rem;">${artistName}</small>
            </div>
            <span class="${isNowPlaying ? 'badge bg-primary bg-opacity-25 text-white border border-primary border-opacity-30' : 'badge-scrobble'}" style="${isNowPlaying ? 'font-size: 0.65rem;' : ''}">
                ${isNowPlaying ? '<i class="fa-solid fa-volume-high me-1 text-primary"></i>En vivo' : `<i class="fa-regular fa-clock me-1"></i>${playedAtStr}`}
            </span>
            <a href="${spotifySearch}" target="_blank" rel="noopener noreferrer" class="btn-card-action" title="Escuchar en Spotify">
                <i class="fa-brands fa-spotify" style="color: #1ed760; font-size: 0.85rem;"></i>
            </a>
        `;

        item.addEventListener('click', () => {
            showItemStats('track', track.name, artistName);
        });

        const spLink = item.querySelector('.btn-card-action');
        if (spLink) {
            spLink.addEventListener('click', (e) => e.stopPropagation());
        }

        statsList.appendChild(item);

        const key = `track::${normalizeKey(track.name)}::${normalizeKey(artistName)}`;
        if (!artCache[key]) {
            resolveSpotifyArtwork(track.name, artistName, 'track', imgId);
        }
    });
}

// ----------------------------------------------------
// MODAL: APARTADO DE ESTADÍSTICAS DE MIS ESCUCHAS
// ----------------------------------------------------
async function showItemStats(type, name, artist) {
    const activeDb = await getActiveDatabase();

    const modalTitle = document.getElementById('item-stats-type-title');
    const modalBody = document.getElementById('item-stats-body');
    const spotifyBtn = document.getElementById('item-stats-spotify-btn');

    if (!modalBody) return;

    const normName = (name || '').trim().toLowerCase();
    const normArt = (artist || '').trim().toLowerCase();

    let data = null;

    if (type === 'track') {
        if (modalTitle) modalTitle.innerHTML = '<i class="fa-solid fa-music text-primary me-2"></i>Estadísticas de Canción';
        const key = `${normName}:::${normArt}`;
        data = activeDb?.tracksLookup?.[key];
        if (!data && activeDb?.tracksLookup) {
            const foundKey = Object.keys(activeDb.tracksLookup).find(k => k.startsWith(normName + ':::') || k.includes(normName));
            if (foundKey) data = activeDb.tracksLookup[foundKey];
        }
    } else if (type === 'album') {
        if (modalTitle) modalTitle.innerHTML = '<i class="fa-solid fa-compact-disc text-info me-2"></i>Estadísticas de Álbum';
        const key = `${normName}:::${normArt}`;
        data = activeDb?.albumsLookup?.[key];
        if (!data && activeDb?.albumsLookup) {
            const foundKey = Object.keys(activeDb.albumsLookup).find(k => k.startsWith(normName + ':::') || k.includes(normName));
            if (foundKey) data = activeDb.albumsLookup[foundKey];
        }
    } else if (type === 'artist') {
        if (modalTitle) modalTitle.innerHTML = '<i class="fa-solid fa-user-group text-warning me-2"></i>Estadísticas de Artista';
        data = activeDb?.artistsLookup?.[normName] || activeDb?.artistsLookup?.[normArt];
        if (!data && activeDb?.artistsLookup) {
            const foundKey = Object.keys(activeDb.artistsLookup).find(k => k.includes(normName) || k.includes(normArt));
            if (foundKey) data = activeDb.artistsLookup[foundKey];
        }
    }

    // Integración de escuchas en vivo de Last.fm en modo unificado
    let deltaItemPlays = 0;
    let lastDeltaIso = null;
    if (currentSource === 'unified' && lastFmRecentDelta.length > 0) {
        const normN = normalizeKey(name);
        const normA = normalizeKey(artist || '');
        lastFmRecentDelta.forEach(t => {
            const tName = normalizeKey(t.name);
            const tArtist = normalizeKey(t.artist ? (t.artist['#text'] || t.artist.name || '') : '');
            const tAlbum = normalizeKey(t.album ? (t.album['#text'] || t.album.name || '') : '');
            let match = false;
            if (type === 'track') {
                if (tName === normN && (!normA || !tArtist || tArtist.includes(normA) || normA.includes(tArtist))) match = true;
            } else if (type === 'artist') {
                if (tArtist && (tArtist === normN || tArtist.includes(normN) || normN.includes(tArtist))) match = true;
            } else if (type === 'album') {
                if (tAlbum === normN && (!normA || !tArtist || tArtist.includes(normA) || normA.includes(tArtist))) match = true;
            }
            if (match) {
                deltaItemPlays++;
                if (!lastDeltaIso && t.date?.uts) {
                    lastDeltaIso = new Date(parseInt(t.date.uts, 10) * 1000).toISOString();
                }
            }
        });
    }

    if (!data && deltaItemPlays > 0) {
        data = {
            name: name,
            artist: artist,
            plays: 0,
            ms: deltaItemPlays * 210000,
            skips: 0,
            first: lastDeltaIso,
            last: lastDeltaIso,
            years: { '2026': deltaItemPlays },
            months: { '2026-10': deltaItemPlays }
        };
    }

    // Cover artwork resolution
    const artKey = `${type}::${normalizeKey(name)}::${normalizeKey(artist || '')}`;
    const coverImg = artCache[artKey] || '/logo.png';

    // Spotify Link
    const spotifyQuery = encodeURIComponent(`${name} ${artist || ''}`.trim());
    let spotifyUrl = `https://open.spotify.com/search/${spotifyQuery}`;
    if (data?.uri) {
        const parts = data.uri.split(':');
        if (parts.length === 3) {
            spotifyUrl = `https://open.spotify.com/${parts[1]}/${parts[2]}`;
        }
    }
    if (spotifyBtn) {
        spotifyBtn.href = spotifyUrl;
    }

    function formatSimpleDate(isoStr) {
        if (!isoStr) return 'N/A';
        try {
            const d = new Date(isoStr);
            return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
        } catch (e) {
            return (isoStr || '').split('T')[0] || 'N/A';
        }
    }

    if (!data) {
        modalBody.innerHTML = `
            <div class="d-flex align-items-center gap-3 mb-3 p-2 rounded" style="background-color: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06);">
                <img src="${coverImg}" class="rounded ${type === 'artist' ? 'rounded-circle' : ''}" style="width: 56px; height: 56px; object-fit: cover;" onerror="this.src='/logo.png'">
                <div class="overflow-hidden flex-grow-1">
                    <h6 class="fw-bold mb-0 text-white text-truncate">${name}</h6>
                    <small class="text-secondary text-truncate d-block">${artist || 'Artista'}</small>
                </div>
            </div>
            <div class="p-3 rounded border border-secondary border-opacity-20 text-center" style="background-color: rgba(255, 255, 255, 0.02);">
                <i class="fa-solid fa-clock-rotate-left text-secondary mb-2" style="font-size: 1.8rem;"></i>
                <p class="mb-1 text-white fw-semibold">Sin registro en el historial exportado</p>
                <small class="text-secondary d-block">Esta pista fue registrada recientemente o con ortografía distinta en Last.fm. Las estadísticas detalladas de 2019 a 2026 corresponden a tu archivo oficial de Spotify.</small>
            </div>
        `;
        const modal = new bootstrap.Modal(document.getElementById('itemStatsModal'));
        modal.show();
        return;
    }

    // Métricas principales unificadas
    const totalPlays = (data.plays || 0) + deltaItemPlays;
    const totalMs = (data.ms || 0) + (deltaItemPlays * 210000);
    const hours = (totalMs / (1000 * 60 * 60));
    const timeFormatted = hours >= 1 ? `${hours.toFixed(1)} hrs` : `${Math.max(1, Math.round(totalMs / 60000))} mins`;
    const skips = data.skips || 0;
    const firstDate = formatSimpleDate(data.first || lastDeltaIso);
    const lastDate = lastDeltaIso ? `${formatSimpleDate(lastDeltaIso)} (En vivo)` : formatSimpleDate(data.last);

    // Barras de evolución anual (2019-2026) con suma en vivo
    const yearsObj = { ...(data.years || {}) };
    if (deltaItemPlays > 0) {
        yearsObj['2026'] = (yearsObj['2026'] || 0) + deltaItemPlays;
    }
    const yearsList = ['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026'];
    const maxYearPlays = Math.max(1, ...Object.values(yearsObj));

    const annualBarsHtml = yearsList.map(y => {
        const yPlays = yearsObj[y] || 0;
        const pct = Math.round((yPlays / maxYearPlays) * 100);
        const barColor = yPlays > 0 ? 'linear-gradient(90deg, #a855f7 0%, #c084fc 100%)' : 'rgba(255, 255, 255, 0.05)';
        return `
            <div class="d-flex align-items-center gap-2 mb-1.5" style="font-size: 0.74rem;">
                <span class="text-secondary fw-semibold" style="width: 34px;">${y}</span>
                <div class="progress flex-grow-1" style="height: 7px; background-color: rgba(255, 255, 255, 0.06); border-radius: 4px;">
                    <div class="progress-bar" style="width: ${pct}%; background: ${barColor}; border-radius: 4px;"></div>
                </div>
                <span class="text-end fw-semibold ${yPlays > 0 ? 'text-white' : 'text-muted'}" style="width: 48px; font-size: 0.72rem;">${yPlays}</span>
            </div>
        `;
    }).join('');

    // Meses con mayor actividad (Top 3)
    let peakMonthsHtml = '';
    if (data.months && Object.keys(data.months).length > 0) {
        const sortedMonths = Object.entries(data.months).sort((a, b) => b[1] - a[1]).slice(0, 3);
        peakMonthsHtml = `
            <div class="mt-2.5 p-2 rounded" style="background-color: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05);">
                <div class="fw-semibold text-secondary mb-1.5" style="font-size: 0.72rem;"><i class="fa-solid fa-fire text-warning me-1"></i> Meses pico de más escuchas</div>
                <div class="d-flex flex-wrap gap-1.5">
                    ${sortedMonths.map(([mKey, count]) => {
                        const [y, m] = mKey.split('-');
                        const mLabel = `${MONTH_SHORT_NAMES[parseInt(m, 10) - 1]} ${y}`;
                        return `<span class="badge border border-secondary border-opacity-20 text-white" style="background-color: rgba(168, 85, 247, 0.15); font-size: 0.72rem;"><strong class="text-info">${mLabel}:</strong> ${count} reps</span>`;
                    }).join('')}
                </div>
            </div>
        `;
    }

    // Plataformas (para track)
    let platformsHtml = '';
    if (data.platforms && Object.keys(data.platforms).length > 0) {
        const sortedPlatforms = Object.entries(data.platforms).sort((a, b) => b[1] - a[1]);
        platformsHtml = `
            <div class="mt-2.5 p-2 rounded" style="background-color: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05);">
                <div class="fw-semibold text-secondary mb-1.5" style="font-size: 0.72rem;"><i class="fa-solid fa-mobile-screen-button text-success me-1"></i> Dispositivos y Plataformas</div>
                <div class="d-flex flex-wrap gap-1">
                    ${sortedPlatforms.map(([plat, count]) => {
                        const cleanPlat = plat.includes('Android') ? 'Android' : (plat.includes('Windows') ? 'Windows' : plat);
                        return `<span class="badge bg-dark border border-secondary border-opacity-25 text-secondary" style="font-size: 0.68rem;">${cleanPlat}: <strong class="text-white">${count}</strong></span>`;
                    }).join('')}
                </div>
            </div>
        `;
    }

    // Canciones de este Álbum (para álbum)
    let albumTracksHtml = '';
    if (type === 'album' && data.tracks && data.tracks.length > 0) {
        albumTracksHtml = `
            <div class="mt-3 pt-2.5 border-top border-secondary border-opacity-15">
                <div class="d-flex align-items-center justify-content-between mb-2">
                    <span class="fw-bold text-white" style="font-size: 0.78rem;"><i class="fa-solid fa-list-ol text-info me-1.5"></i> Canciones de este Álbum</span>
                    <small class="text-secondary">${data.tracks.length} canciones</small>
                </div>
                <div class="d-flex flex-column gap-1.5" style="max-height: 200px; overflow-y: auto;">
                    ${data.tracks.map((t, idx) => `
                        <div class="d-flex align-items-center justify-content-between py-1.5 px-2 rounded cursor-pointer" onclick="showItemStats('track', '${(t.name || '').replace(/'/g, "\\'")}', '${(data.artist || artist || '').replace(/'/g, "\\'")}')" style="background-color: rgba(255, 255, 255, 0.03); font-size: 0.72rem; cursor: pointer; transition: background 0.15s ease;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.08)'" onmouseout="this.style.backgroundColor='rgba(255,255,255,0.03)'">
                            <span class="text-truncate me-2">
                                <strong class="text-secondary me-1.5">#${idx + 1}</strong>
                                <span class="text-white">${t.name}</span>
                                ${(currentSource === 'unified' && t.gap > 0) ? `<span class="badge border border-info border-opacity-30 text-info ms-1" style="font-size: 0.58rem; padding: 1px 4px;">+${formatNumber(t.gap)}</span>` : ''}
                            </span>
                            <span class="badge bg-secondary bg-opacity-25 text-white flex-shrink-0">${formatNumber(t.plays)} reps</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Top Canciones de este Artista (para artista)
    let artistTracksHtml = '';
    if (type === 'artist' && data.tracks && data.tracks.length > 0) {
        artistTracksHtml = `
            <div class="mt-3 pt-2.5 border-top border-secondary border-opacity-15">
                <div class="d-flex align-items-center justify-content-between mb-2">
                    <span class="fw-bold text-white" style="font-size: 0.78rem;"><i class="fa-solid fa-fire text-warning me-1.5"></i> Canciones Top de este Artista</span>
                    <small class="text-secondary">${data.tracks.length} destacadas</small>
                </div>
                <div class="d-flex flex-column gap-1.5" style="max-height: 200px; overflow-y: auto;">
                    ${data.tracks.map((t, idx) => `
                        <div class="d-flex align-items-center justify-content-between py-1.5 px-2 rounded cursor-pointer" onclick="showItemStats('track', '${(t.name || '').replace(/'/g, "\\'")}', '${name.replace(/'/g, "\\'")}')" style="background-color: rgba(255, 255, 255, 0.03); font-size: 0.72rem; cursor: pointer; transition: background 0.15s ease;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.08)'" onmouseout="this.style.backgroundColor='rgba(255,255,255,0.03)'">
                            <span class="text-truncate me-2">
                                <strong class="text-secondary me-1.5">#${idx + 1}</strong>
                                <span class="text-white">${t.name}</span>
                                ${(currentSource === 'unified' && t.gap > 0) ? `<span class="badge border border-info border-opacity-30 text-info ms-1" style="font-size: 0.58rem; padding: 1px 4px;">+${formatNumber(t.gap)}</span>` : ''}
                            </span>
                            <span class="badge bg-secondary bg-opacity-25 text-white flex-shrink-0">${formatNumber(t.plays)} reps</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    modalBody.innerHTML = `
        <!-- Hero Header -->
        <div class="d-flex align-items-center gap-3 mb-3 p-2 rounded" style="background-color: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06);">
            <img src="${coverImg}" class="rounded ${type === 'artist' ? 'rounded-circle' : ''}" style="width: 58px; height: 58px; object-fit: cover; flex-shrink: 0;" alt="Cover" onerror="this.src='/logo.png'">
            <div class="overflow-hidden flex-grow-1" style="min-width: 0;">
                <div class="d-flex align-items-center gap-1.5 mb-0.5">
                    <h6 class="fw-bold mb-0 text-white text-truncate" style="font-size: 0.95rem;" title="${name}">${name}</h6>
                    ${currentSource === 'unified' ? `<span class="badge border border-success border-opacity-30 text-success flex-shrink-0" style="background-color: rgba(34, 197, 94, 0.12); font-size: 0.62rem; padding: 2px 6px;"><i class="fa-solid fa-sparkles me-1"></i>Unificado</span>` : ''}
                </div>
                <small class="text-secondary text-truncate d-block" style="font-size: 0.76rem;">${artist || (type === 'artist' ? 'Artista' : '')}</small>
                ${data.album && data.album !== name ? `<small class="text-muted text-truncate d-block" style="font-size: 0.68rem;"><i class="fa-solid fa-compact-disc me-1"></i>${data.album}</small>` : ''}
            </div>
        </div>

        ${(currentSource === 'unified' && data.gap > 0) ? `
            <div class="d-flex align-items-center gap-2 p-2 px-2.5 mb-2.5 rounded border border-info border-opacity-25" style="background-color: rgba(6, 182, 212, 0.08); font-size: 0.74rem;">
                <i class="fa-solid fa-sparkles text-info fs-6 flex-shrink-0"></i>
                <div class="overflow-hidden">
                    <strong class="text-white">+${formatNumber(data.gap)} reproducciones unificadas</strong>
                    <span class="text-secondary d-block" style="font-size: 0.68rem;">Escuchadas en YouTube / otras plataformas (vía Last.fm) y sumadas al historial.</span>
                </div>
            </div>
        ` : ''}

        <!-- Metrics Grid -->
        <div class="row g-2 mb-3">
            <div class="col-6 col-sm-3">
                <div class="p-2 rounded text-center" style="background-color: rgba(168, 85, 247, 0.1); border: 1px solid rgba(168, 85, 247, 0.25);">
                    <small class="text-secondary d-block" style="font-size: 0.66rem;">Reproducciones</small>
                    <strong class="text-white fs-6">${formatNumber(totalPlays)}</strong>
                </div>
            </div>
            <div class="col-6 col-sm-3">
                <div class="p-2 rounded text-center" style="background-color: rgba(6, 182, 212, 0.1); border: 1px solid rgba(6, 182, 212, 0.25);">
                    <small class="text-secondary d-block" style="font-size: 0.66rem;">Tiempo Total</small>
                    <strong class="text-white fs-6">${timeFormatted}</strong>
                </div>
            </div>
            <div class="col-6 col-sm-3">
                <div class="p-2 rounded text-center" style="background-color: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.25);">
                    <small class="text-secondary d-block" style="font-size: 0.66rem;">Primera Escucha</small>
                    <strong class="text-white" style="font-size: 0.74rem;">${firstDate}</strong>
                </div>
            </div>
            <div class="col-6 col-sm-3">
                <div class="p-2 rounded text-center" style="background-color: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.25);">
                    <small class="text-secondary d-block" style="font-size: 0.66rem;">Última Escucha</small>
                    <strong class="text-white" style="font-size: 0.74rem;">${lastDate}</strong>
                </div>
            </div>
        </div>

        ${type === 'track' && skips > 0 ? `
            <div class="d-flex align-items-center justify-content-between p-1.5 px-2.5 mb-2.5 rounded border border-secondary border-opacity-15" style="background-color: rgba(255, 255, 255, 0.02); font-size: 0.72rem;">
                <span class="text-secondary"><i class="fa-solid fa-forward me-1 text-muted"></i> Veces salteada antes de tiempo:</span>
                <span class="badge bg-secondary bg-opacity-25 text-white">${skips} skips</span>
            </div>
        ` : ''}

        <!-- Annual Evolution Bars -->
        <div class="p-2.5 rounded border border-secondary border-opacity-15" style="background-color: rgba(255, 255, 255, 0.02);">
            <div class="d-flex align-items-center justify-content-between mb-2">
                <span class="fw-bold text-white" style="font-size: 0.76rem;"><i class="fa-solid fa-chart-column text-primary me-1.5"></i> Evolución por Años (2019-2026)</span>
                <small class="text-secondary" style="font-size: 0.68rem;">streams / año</small>
            </div>
            ${annualBarsHtml}
        </div>

        ${peakMonthsHtml}
        ${platformsHtml}
        ${albumTracksHtml}
        ${artistTracksHtml}
    `;

    const modal = new bootstrap.Modal(document.getElementById('itemStatsModal'));
    modal.show();
}

// ----------------------------------------------------
// MODAL LAST.FM CONFIGURACIÓN
// ----------------------------------------------------
function openLastFmModal() {
    const { user, key } = getLastFmCredentials();
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
        let testRes = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getinfo&user=${encodeURIComponent(user)}&api_key=${encodeURIComponent(key)}&format=json`);
        let testData = await testRes.json();

        if (testData.error === 8) {
            await new Promise(r => setTimeout(r, 1200));
            testRes = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getinfo&user=${encodeURIComponent(user)}&api_key=${encodeURIComponent(key)}&format=json`);
            testData = await testRes.json();
        }

        if (testData.error) {
            if (lastFmError) {
                lastFmError.textContent = `Error de Last.fm: ${testData.message || 'API Key o usuario inválido'}`;
                lastFmError.classList.remove('d-none');
            }
            btnLastFmSave.disabled = false;
            btnLastFmSave.textContent = 'Guardar y Sincronizar';
            return;
        }

        localStorage.setItem('lastfm_user', user);
        localStorage.setItem('lastfm_key', key);
        initLastFmState();
        fetchLastFmGlobalStats();

        const modal = bootstrap.Modal.getInstance(lastFmModalEl);
        if (modal) modal.hide();

        loadStats();
    } catch (e) {
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
    if (statStrip) statStrip.classList.add('d-none');
    if (yearsFilterContainer) yearsFilterContainer.classList.add('d-none');
    if (monthsFilterContainer) monthsFilterContainer.classList.add('d-none');
    initLastFmState();

    const modal = bootstrap.Modal.getInstance(lastFmModalEl);
    if (modal) modal.hide();

    loadStats();
}

// ----------------------------------------------------
// ACCIÓN: GUARDAR PLAYLIST EN SPOTIFY (OPCIONAL)
// ----------------------------------------------------
async function handleSavePlaylist() {
    if (!accessToken) {
        if (confirm('Para guardar una playlist en tu Spotify necesitas iniciar sesión con tu cuenta de Spotify.\n\n¿Deseas iniciar sesión ahora?')) {
            redirectToSpotifyLogin();
        }
        return;
    }

    try {
        if (!userProfileData) {
            await fetchUserProfile();
        }

        if (!currentLoadedItems || currentLoadedItems.length === 0) {
            alert('No hay canciones cargadas en este momento.');
            return;
        }

        const periodName = getRangeLabel(currentRange);
        const payload = {
            name: `Mi Top (${periodName}) - SpotiTracker`,
            description: `Playlist creada con mis canciones más escuchadas según Last.fm. Fecha: ${new Date().toLocaleDateString()}`,
            public: false
        };

        const createRes = await spotifyFetch(`users/${userProfileData.id}/playlists`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (!createRes || !createRes.id) {
            alert('Error al crear la playlist en Spotify.');
            return;
        }

        alert(`¡Playlist "${payload.name}" creada con éxito en tu Spotify!`);
        if (createRes.external_urls?.spotify) {
            window.open(createRes.external_urls.spotify, '_blank');
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

    const { user } = getLastFmCredentials();
    document.getElementById('card-user-name').textContent = userProfileData?.display_name || user || 'Usuario';
    document.getElementById('card-date').textContent = new Date().toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
    document.getElementById('card-period-label').textContent = getRangeLabel(currentRange);

    const listContainer = document.getElementById('card-items-list');
    listContainer.innerHTML = '';

    const items = (currentLoadedItems || []).slice(0, 5);
    items.forEach((item, idx) => {
        const name = item.name;
        const sub = item.artist ? (item.artist.name || item.artist['#text']) : (item.playcount ? `${formatNumber(item.playcount)} scrobbles` : '');
        const img = getImageFromItem(item);

        const row = document.createElement('div');
        row.className = 'd-flex align-items-center gap-2 py-1';
        row.innerHTML = `
            <span class="fw-bold" style="width: 20px; font-size: 0.8rem; color: var(--brand-primary);">#${idx + 1}</span>
            <img src="${img}" class="rounded" style="width: 32px; height: 32px; object-fit: cover;" alt="cover" onerror="this.src='https://via.placeholder.com/32'">
            <div class="overflow-hidden flex-grow-1 text-start">
                <div class="fw-bold text-truncate" style="font-size: 0.8rem;">${name}</div>
                <small class="text-secondary text-truncate d-block" style="font-size: 0.7rem;">${sub}</small>
            </div>
            <span class="badge-scrobble" style="font-size: 0.65rem;">${formatNumber(item.playcount)}</span>
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
