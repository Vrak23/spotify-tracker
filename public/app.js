const CLIENT_ID = '78c1217f07404df7b95cceb3e7cc6657';
const REDIRECT_URI = window.location.origin + '/callback';

// Credenciales por defecto de Last.fm (cuenta del usuario)
const DEFAULT_LASTFM_USER = 'Vrak_23';
const DEFAULT_LASTFM_KEY = '82a251af624ca33e3d59215313af74c2';

function getLastFmCredentials() {
    if (localStorage.getItem('spoti_logged_out') === 'true') {
        return { user: null, key: null };
    }
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

// Fallback visual inline para carátulas sin internet (0 peticiones de red, previene bucles)
const FALLBACK_ART_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40' width='40' height='40'%3E%3Crect width='40' height='40' fill='%231c1c24' rx='6'/%3E%3Cpath d='M16 14v12l10-6z' fill='%2364748b'/%3E%3C/svg%3e";

function safeImgError(img) {
    if (!img) return;
    img.onerror = null; // Rompe de inmediato cualquier bucle de reintento
    img.src = FALLBACK_ART_SVG;
}
window.safeImgError = safeImgError;

// Fallback visual para avatares de usuario (perfil siempre nítido, sin icono roto)
const DEFAULT_AVATAR_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 44' width='44' height='44'%3E%3Crect width='44' height='44' fill='%2318181c' rx='22'/%3E%3Ccircle cx='22' cy='16' r='6' fill='%23a855f7'/%3E%3Cpath d='M10 34c0-5 5.5-8 12-8s12 3 12 8z' fill='%23a855f7'/%3E%3C/svg%3e";

function safeAvatarError(img) {
    if (!img) return;
    img.onerror = null;
    img.src = DEFAULT_AVATAR_SVG;
}
window.safeAvatarError = safeAvatarError;

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
const customDatePickerContainer = document.getElementById('custom-date-picker-container');
const inputDateFrom = document.getElementById('input-date-from');
const inputDateTo = document.getElementById('input-date-to');
const btnSwapDates = document.getElementById('btn-swap-dates');
const btnApplyCustomDates = document.getElementById('btn-apply-custom-dates');

// Playlist Curator DOM
const playlistCuratorModalEl = document.getElementById('playlistCuratorModal');
const btnOpenCuratorNav = document.getElementById('btn-open-curator-nav');
const menuOpenCurator = document.getElementById('menu-open-curator');
const curatorYear = document.getElementById('curator-year');
const curatorHalf = document.getElementById('curator-half');
const curatorTargetCount = document.getElementById('curator-target-count');
const curatorExcludePast = document.getElementById('curator-exclude-past');
const curatorBtnGenerate = document.getElementById('curator-btn-generate');
const curatorPeriodBadge = document.getElementById('curator-period-badge');
const curatorCounterBadge = document.getElementById('curator-counter-badge');
const curatorTabSelected = document.getElementById('curator-tab-selected');
const curatorTabBench = document.getElementById('curator-tab-bench');
const curatorSelectedNum = document.getElementById('curator-selected-num');
const curatorBenchNum = document.getElementById('curator-bench-num');
const curatorSelectedView = document.getElementById('curator-selected-view');
const curatorBenchView = document.getElementById('curator-bench-view');
const curatorSelectedList = document.getElementById('curator-selected-list');
const curatorBenchList = document.getElementById('curator-bench-list');
const curatorBenchSearch = document.getElementById('curator-bench-search');
const curatorBtnCopy = document.getElementById('curator-btn-copy');
const curatorBtnClear = document.getElementById('curator-btn-clear');
const curatorBtnYtMusic = document.getElementById('curator-btn-ytmusic');
const curatorBtnSpotify = document.getElementById('curator-btn-spotify');

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
const filterSearchInput = document.getElementById('filter-search-input');
const menuOpenHabits = document.getElementById('menu-open-habits');
const menuOpenForgotten = document.getElementById('menu-open-forgotten');
const menuOpenVersus = document.getElementById('menu-open-versus');
const menuOpenRecords = document.getElementById('menu-open-records');
const menuSavePlaylist = document.getElementById('menu-save-playlist');
const menuOpenShare = document.getElementById('menu-open-share');
const menuLastFmConnect = document.getElementById('menu-lastfm-connect');
const menuGdriveConnect = document.getElementById('menu-gdrive-connect');
const gdriveModalEl = document.getElementById('gdriveModal');
const gdriveStatusCard = document.getElementById('gdrive-status-card');
const gdriveStatusTitle = document.getElementById('gdrive-status-title');
const gdriveStatusDesc = document.getElementById('gdrive-status-desc');
const gdriveSyncBadge = document.getElementById('gdrive-sync-badge');
const drawerGdriveStatus = document.getElementById('drawer-gdrive-status');
const curatorBtnCloud = document.getElementById('curator-btn-cloud');
const curatorCloudLabel = document.getElementById('curator-cloud-label');
const gdriveClientIdInput = document.getElementById('gdrive-client-id-input');
const btnGdriveSaveId = document.getElementById('btn-gdrive-save-id');
const btnGdriveAuth = document.getElementById('btn-gdrive-auth');
const btnGdriveAuthText = document.getElementById('btn-gdrive-auth-text');
const btnGdriveUpload = document.getElementById('btn-gdrive-upload');
const btnGdriveDownload = document.getElementById('btn-gdrive-download');
const btnGdriveLogout = document.getElementById('btn-gdrive-logout');
const gdriveAutosyncToggle = document.getElementById('gdrive-autosync-toggle');
const gdriveAlert = document.getElementById('gdrive-alert');
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
        const modal = bootstrap.Modal.getOrCreateInstance(installModalEl);
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
    if (range === 'era-spotify') return 'Era Spotify (2019 - Ago 2025)';
    if (range === 'era-lastfm') return 'Nueva Era / Streaming (Ago 2025 - Actualidad)';
    if (range && range.startsWith('dates_')) {
        const [fromD, toD] = range.replace('dates_', '').split('_to_');
        const [fy, fm, fd] = fromD.split('-');
        const [ty, tm, td] = toD.split('-');
        const fMonth = MONTH_SHORT_NAMES[parseInt(fm, 10) - 1] || fm;
        const tMonth = MONTH_SHORT_NAMES[parseInt(tm, 10) - 1] || tm;
        return `${parseInt(fd, 10)} ${fMonth} ${fy} — ${parseInt(td, 10)} ${tMonth} ${ty}`;
    }
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
    updateCloudUI('active');

    const isLoggedOut = localStorage.getItem('spoti_logged_out') === 'true';

    // Procesar posible retorno de Spotify OAuth PKCE
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
        localStorage.removeItem('spoti_logged_out');
        await fetchAccessToken(code);
    } else if (isLoggedOut) {
        showLogin();
    } else {
        showDashboard();
    }
});

function setupEventListeners() {
    if (btnLogin) {
        btnLogin.addEventListener('click', () => {
            localStorage.removeItem('spoti_logged_out');
            redirectToSpotifyLogin();
        });
    }

    const btnLoginDemo = document.getElementById('btn-login-demo');
    if (btnLoginDemo) {
        btnLoginDemo.addEventListener('click', () => {
            localStorage.removeItem('spoti_logged_out');
            showDashboard();
        });
    }

    const btnLoginLastFm = document.getElementById('btn-login-lastfm');
    if (btnLoginLastFm) {
        btnLoginLastFm.addEventListener('click', () => {
            localStorage.removeItem('spoti_logged_out');
        });
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

    if (btnApplyCustomDates) {
        btnApplyCustomDates.addEventListener('click', applyCustomDateRange);
    }
    if (btnSwapDates) {
        btnSwapDates.addEventListener('click', (e) => {
            e.preventDefault();
            const icon = btnSwapDates.querySelector('i');
            if (icon) {
                icon.style.transform = (icon.style.transform === 'rotate(180deg)') ? 'rotate(0deg)' : 'rotate(180deg)';
                icon.style.transition = 'transform 0.25s ease';
            }
            if (inputDateFrom && inputDateTo) {
                const currentTo = inputDateTo.value;
                if (currentTo) {
                    inputDateFrom.value = currentTo;
                }
                // Al hacerlo, que el seleccionador de la derecha se resetee
                inputDateTo.value = '';
                inputDateTo.focus();
            }
        });
    }
    if (inputDateFrom) {
        inputDateFrom.addEventListener('change', () => {
            if (selectTimePeriod && selectTimePeriod.value === 'custom' && inputDateTo?.value) {
                applyCustomDateRange();
            }
        });
    }
    if (inputDateTo) {
        inputDateTo.addEventListener('change', () => {
            if (selectTimePeriod && selectTimePeriod.value === 'custom' && inputDateTo.value) {
                applyCustomDateRange();
            }
        });
    }

    // Modal: Preservar scroll de la página de fondo sin que se reinicie ni suba arriba
    let savedModalScrollY = 0;
    document.addEventListener('show.bs.modal', () => {
        savedModalScrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    });
    document.addEventListener('shown.bs.modal', () => {
        const currentY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
        if (savedModalScrollY > 0 && currentY === 0) {
            window.scrollTo({ top: savedModalScrollY, behavior: 'instant' });
        }
    });
    document.addEventListener('hidden.bs.modal', () => {
        if (typeof savedModalScrollY === 'number') {
            window.scrollTo({ top: savedModalScrollY, behavior: 'instant' });
        }
        // Limpieza de seguridad contra backdrops huérfanos o pantallas bloqueadas
        setTimeout(() => {
            if (!document.querySelector('.modal.show')) {
                document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                document.body.classList.remove('modal-open');
                document.body.style.removeProperty('padding-right');
                document.body.style.removeProperty('overflow');
            }
        }, 120);
    });

    const itemStatsModalEl = document.getElementById('itemStatsModal');
    if (itemStatsModalEl) {
        itemStatsModalEl.addEventListener('hidden.bs.modal', () => {
            itemStatsHistory = [];
            currentOpenStats = null;
        });
    }
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

    // Buscador en tiempo real
    if (filterSearchInput) {
        filterSearchInput.addEventListener('input', handleFilterSearch);
    }

    // Acciones de Análisis y Estadísticas
    if (menuOpenHabits) {
        menuOpenHabits.addEventListener('click', openHabitsModal);
    }
    if (menuOpenForgotten) {
        menuOpenForgotten.addEventListener('click', openForgottenModal);
    }
    if (menuOpenVersus) {
        menuOpenVersus.addEventListener('click', openVersusModal);
    }
    if (menuOpenRecords) {
        menuOpenRecords.addEventListener('click', openRecordsModal);
    }
    if (menuOpenCurator) {
        menuOpenCurator.addEventListener('click', openPlaylistCuratorModal);
    }
    if (btnOpenCuratorNav) {
        btnOpenCuratorNav.addEventListener('click', openPlaylistCuratorModal);
    }

    const menuOpenTrophies = document.getElementById('menu-open-trophies');
    if (menuOpenTrophies) {
        menuOpenTrophies.addEventListener('click', openTrophiesModal);
    }
    const btnOpenTrophiesNav = document.getElementById('btn-open-trophies-nav');
    if (btnOpenTrophiesNav) {
        btnOpenTrophiesNav.addEventListener('click', openTrophiesModal);
    }
    const btnToggleMilestonePush = document.getElementById('btn-toggle-milestone-push');
    if (btnToggleMilestonePush) {
        btnToggleMilestonePush.addEventListener('click', toggleMilestonePushNotifications);
    }
    const btnEnableMilestonePush = document.getElementById('btn-enable-milestone-push');
    if (btnEnableMilestonePush) {
        btnEnableMilestonePush.addEventListener('click', toggleMilestonePushNotifications);
    }

    const menuOpenCapsule = document.getElementById('menu-open-capsule');
    if (menuOpenCapsule) {
        menuOpenCapsule.addEventListener('click', openCapsuleModal);
    }
    const menuOpenTrivia = document.getElementById('menu-open-trivia');
    if (menuOpenTrivia) {
        menuOpenTrivia.addEventListener('click', openTriviaModal);
    }
    const menuOpenTournament = document.getElementById('menu-open-tournament');
    if (menuOpenTournament) {
        menuOpenTournament.addEventListener('click', openTournamentModal);
    }
    const menuOpenIceberg = document.getElementById('menu-open-iceberg');
    if (menuOpenIceberg) {
        menuOpenIceberg.addEventListener('click', openIcebergModal);
    }
    const menuOpenEras = document.getElementById('menu-open-eras');
    if (menuOpenEras) {
        menuOpenEras.addEventListener('click', openErasModal);
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

    // Base de Datos en la Nube (Supabase - Central)
    if (menuGdriveConnect) {
        menuGdriveConnect.addEventListener('click', openGoogleDriveModal);
    }
    if (curatorBtnCloud) {
        curatorBtnCloud.addEventListener('click', openGoogleDriveModal);
    }
    if (btnGdriveUpload) {
        btnGdriveUpload.addEventListener('click', () => saveToCloudDatabase(false));
    }
    if (btnGdriveDownload) {
        btnGdriveDownload.addEventListener('click', () => loadFromCloudDatabase());
    }
    if (gdriveAutosyncToggle) {
        gdriveAutosyncToggle.addEventListener('change', (e) => {
            cloudAutoSync = e.target.checked;
            localStorage.setItem(CLOUD_AUTOSYNC_KEY, String(cloudAutoSync));
        });
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
        if (customDatePickerContainer) customDatePickerContainer.classList.add('d-none');

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
        if (customDatePickerContainer) customDatePickerContainer.classList.add('d-none');

        if (selectTimePeriod) {
            selectTimePeriod.innerHTML = `
                <option value="overall" selected>✨ Histórico Total</option>
                <option value="curator">🪄 Curador de Playlists Semestrales...</option>
                <option value="era-spotify">🟢 Era Spotify (2019 - Ago 2025)</option>
                <option value="era-lastfm">🟣 Nueva Era (Ago 2025 - Hoy)</option>
                <option value="custom">📅 Elegir Fechas (Rango libre)...</option>
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
    if (val === 'curator') {
        openPlaylistCuratorModal();
        if (selectTimePeriod) selectTimePeriod.value = currentRange || 'overall';
        return;
    }

    if (val === 'custom') {
        if (customDatePickerContainer) customDatePickerContainer.classList.remove('d-none');
        if (selectMonth) {
            selectMonth.disabled = true;
            selectMonth.innerHTML = '<option value="all" selected>Todo el año</option>';
        }
        applyCustomDateRange();
        return;
    }

    if (customDatePickerContainer) customDatePickerContainer.classList.add('d-none');

    if (val === 'era-spotify') {
        if (selectMonth) {
            selectMonth.disabled = true;
            selectMonth.innerHTML = '<option value="all" selected>Todo el año</option>';
        }
        currentRange = 'era-spotify';
    } else if (val === 'era-lastfm') {
        if (selectMonth) {
            selectMonth.disabled = true;
            selectMonth.innerHTML = '<option value="all" selected>Todo el año</option>';
        }
        currentRange = 'era-lastfm';
    } else if (val.startsWith('year-')) {
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

function applyCustomDateRange() {
    let from = inputDateFrom?.value || '2019-05-01';
    let to = inputDateTo?.value;

    if (!to) {
        const todayStr = new Date().toISOString().split('T')[0];
        to = todayStr > '2026-12-31' ? '2026-12-31' : todayStr;
        if (inputDateTo) inputDateTo.value = to;
    }

    if (from > to) {
        const tmp = from;
        from = to;
        to = tmp;
        if (inputDateFrom) inputDateFrom.value = from;
        if (inputDateTo) inputDateTo.value = to;
    }

    currentRange = `dates_${from}_to_${to}`;
    updateStatStrip();
    loadStats();
}

function getRangeTopData(activeDb, fromDateStr, toDateStr) {
    if (!activeDb || !activeDb.yearlyTops) return null;

    const fromYM = (fromDateStr || '2019-05-01').slice(0, 7);
    const toYM = (toDateStr || '2026-12-31').slice(0, 7);

    const trackMap = new Map();
    const artistMap = new Map();
    const albumMap = new Map();
    let totalPlays = 0;

    const startYear = parseInt(fromYM.split('-')[0], 10);
    const endYear = parseInt(toYM.split('-')[0], 10);

    for (let y = startYear; y <= endYear; y++) {
        const yData = activeDb.yearlyTops[String(y)];
        if (!yData || !yData.months) continue;

        for (let m = 1; m <= 12; m++) {
            const ymKey = `${y}-${String(m).padStart(2, '0')}`;
            if (ymKey < fromYM || ymKey > toYM) continue;

            const mData = yData.months[String(m)];
            if (!mData) continue;

            totalPlays += (mData.plays || 0);

            (mData.tracks || []).forEach(t => {
                const k = `${normalizeKey(t.name)}:::${normalizeKey(t.artist || '')}`;
                const cur = trackMap.get(k) || {
                    name: t.name,
                    artist: t.artist,
                    album: t.album,
                    plays: 0,
                    uri: t.uri
                };
                cur.plays += t.plays;
                trackMap.set(k, cur);
            });

            (mData.artists || []).forEach(a => {
                const k = normalizeKey(a.name);
                const cur = artistMap.get(k) || {
                    name: a.name,
                    plays: 0
                };
                cur.plays += a.plays;
                artistMap.set(k, cur);
            });

            (mData.albums || []).forEach(al => {
                const k = `${normalizeKey(al.name)}:::${normalizeKey(al.artist || '')}`;
                const cur = albumMap.get(k) || {
                    name: al.name,
                    artist: al.artist,
                    plays: 0
                };
                cur.plays += al.plays;
                albumMap.set(k, cur);
            });
        }
    }

    const sortedTracks = Array.from(trackMap.values()).sort((a, b) => b.plays - a.plays);
    const sortedArtists = Array.from(artistMap.values()).sort((a, b) => b.plays - a.plays);
    const sortedAlbums = Array.from(albumMap.values()).sort((a, b) => b.plays - a.plays);
    const approxHours = (totalPlays * 3.4 / 60).toFixed(1);

    return {
        plays: totalPlays,
        hours: approxHours,
        tracks: sortedTracks,
        artists: sortedArtists,
        albums: sortedAlbums
    };
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

    // Periodo: Era Spotify (2019 - Ago 2025)
    if (currentRange === 'era-spotify') {
        const rData = getRangeTopData(activeDb, '2019-05-01', '2025-08-31');
        if (rData) {
            if (stripPlaycount) stripPlaycount.textContent = formatNumber(rData.plays);
            if (stripHours) stripHours.textContent = Math.round(parseFloat(rData.hours)).toLocaleString();
            if (stripArtists) stripArtists.textContent = formatNumber(rData.artists.length);
            if (stripAlbums) stripAlbums.textContent = formatNumber(rData.albums.length);
            return;
        }
    }

    // Periodo: Nueva Era Last.fm / Otras plataformas (Ago 2025 - Actualidad)
    if (currentRange === 'era-lastfm') {
        const rData = getRangeTopData(activeDb, '2025-08-01', '2026-12-31');
        if (rData) {
            const extra = (currentSource === 'unified') ? deltaCount : 0;
            const extraH = (currentSource === 'unified') ? deltaHours : 0;
            if (stripPlaycount) stripPlaycount.textContent = formatNumber(rData.plays + extra);
            if (stripHours) stripHours.textContent = Math.round(parseFloat(rData.hours) + extraH).toLocaleString();
            if (stripArtists) stripArtists.textContent = formatNumber(rData.artists.length);
            if (stripAlbums) stripAlbums.textContent = formatNumber(rData.albums.length);
            return;
        }
    }

    // Periodo: Rango de fechas personalizado (dates_YYYY-MM-DD_to_YYYY-MM-DD)
    if (currentRange && currentRange.startsWith('dates_')) {
        const [fromD, toD] = currentRange.replace('dates_', '').split('_to_');
        const rData = getRangeTopData(activeDb, fromD, toD);
        if (rData) {
            const extra = (currentSource === 'unified' && toD >= '2026-10-01') ? deltaCount : 0;
            const extraH = (currentSource === 'unified' && toD >= '2026-10-01') ? deltaHours : 0;
            if (stripPlaycount) stripPlaycount.textContent = formatNumber(rData.plays + extra);
            if (stripHours) stripHours.textContent = Math.round(parseFloat(rData.hours) + extraH).toLocaleString();
            if (stripArtists) stripArtists.textContent = formatNumber(rData.artists.length);
            if (stripAlbums) stripAlbums.textContent = formatNumber(rData.albums.length);
            return;
        }
    }

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
    localStorage.removeItem('spotify_refresh_token');
    localStorage.removeItem('spotify_token_expires_at');
    localStorage.removeItem('code_verifier');
    localStorage.removeItem('lastfm_user');
    localStorage.removeItem('lastfm_key');
    localStorage.setItem('spoti_logged_out', 'true');
    accessToken = null;
    userProfileData = null;

    if (currentlyPlayingTimer) {
        clearInterval(currentlyPlayingTimer);
        currentlyPlayingTimer = null;
    }

    // Resetear datos visuales del perfil
    if (drawerUserName) drawerUserName.textContent = 'Usuario';
    if (drawerUserFollowers) drawerUserFollowers.textContent = '';
    if (drawerUserImg) drawerUserImg.src = DEFAULT_AVATAR_SVG;
    if (userImg) userImg.src = DEFAULT_AVATAR_SVG;
    if (drawerLastFmStatus) {
        drawerLastFmStatus.textContent = 'Opcional';
        drawerLastFmStatus.className = 'badge bg-secondary bg-opacity-25';
    }
    if (currentlyPlayingContainer) currentlyPlayingContainer.innerHTML = '';

    showLogin();
}

// ----------------------------------------------------
// MOSTRAR VISTAS
// ----------------------------------------------------
function showLogin() {
    loginView.classList.remove('d-none');
    dashboardView.classList.add('d-none');
    navActions.classList.add('d-none');
    if (btnInstallFab) btnInstallFab.classList.add('d-none');

    if (currentlyPlayingTimer) {
        clearInterval(currentlyPlayingTimer);
        currentlyPlayingTimer = null;
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

    initLastFmState();
    startCurrentlyPlayingPolling();

    // Sincronizar perfil con auto-refresh de token y fallback a Last.fm
    syncUserProfile();

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
            if (data.refresh_token) {
                localStorage.setItem('spotify_refresh_token', data.refresh_token);
            }
            const expiresAt = Date.now() + ((data.expires_in || 3600) * 1000);
            localStorage.setItem('spotify_token_expires_at', String(expiresAt));
            localStorage.removeItem('spoti_logged_out');
            window.history.replaceState({}, document.title, window.location.origin + '/');
            showDashboard();
        } else {
            console.warn('Spotify auth token warning:', data);
            window.history.replaceState({}, document.title, window.location.origin + '/');
            showDashboard();
        }
    } catch (err) {
        console.error('fetchAccessToken exception:', err);
        window.history.replaceState({}, document.title, window.location.origin + '/');
        showDashboard();
    }
}

let isRefreshingToken = false;
let refreshPromise = null;

async function refreshAccessToken() {
    const refreshToken = localStorage.getItem('spotify_refresh_token');
    if (!refreshToken) return null;

    if (isRefreshingToken && refreshPromise) {
        return refreshPromise;
    }

    isRefreshingToken = true;
    refreshPromise = (async () => {
        try {
            const params = new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: CLIENT_ID
            });

            const response = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params
            });

            const data = await response.json();
            if (data.access_token) {
                accessToken = data.access_token;
                localStorage.setItem('spotify_access_token', accessToken);
                if (data.refresh_token) {
                    localStorage.setItem('spotify_refresh_token', data.refresh_token);
                }
                const expiresAt = Date.now() + ((data.expires_in || 3600) * 1000);
                localStorage.setItem('spotify_token_expires_at', String(expiresAt));
                return accessToken;
            } else {
                console.warn('No se pudo refrescar el token de Spotify:', data);
                if (data.error === 'invalid_grant') {
                    localStorage.removeItem('spotify_access_token');
                    localStorage.removeItem('spotify_refresh_token');
                    localStorage.removeItem('spotify_token_expires_at');
                    accessToken = null;
                }
                return null;
            }
        } catch (err) {
            console.error('Error al refrescar token de Spotify:', err);
            return null;
        } finally {
            isRefreshingToken = false;
            refreshPromise = null;
        }
    })();

    return refreshPromise;
}

async function getValidAccessToken() {
    if (!accessToken) {
        accessToken = localStorage.getItem('spotify_access_token') || null;
    }
    const expiresAt = parseInt(localStorage.getItem('spotify_token_expires_at') || '0', 10);
    const refreshToken = localStorage.getItem('spotify_refresh_token');

    // Si ya expiró o expira en menos de 90 segundos y tenemos refresh_token
    if ((!accessToken || (expiresAt && Date.now() > expiresAt - 90000)) && refreshToken) {
        const refreshedToken = await refreshAccessToken();
        if (refreshedToken) return refreshedToken;
    }
    return accessToken;
}

async function spotifyFetch(endpoint, options = {}) {
    let token = await getValidAccessToken();
    if (!token) return null;
    try {
        let res = await fetch(`https://api.spotify.com/v1/${endpoint}`, {
            ...options,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });

        if (res.status === 401) {
            const newToken = await refreshAccessToken();
            if (newToken) {
                res = await fetch(`https://api.spotify.com/v1/${endpoint}`, {
                    ...options,
                    headers: {
                        'Authorization': `Bearer ${newToken}`,
                        'Content-Type': 'application/json',
                        ...(options.headers || {})
                    }
                });
            } else {
                localStorage.removeItem('spotify_access_token');
                accessToken = null;
                return null;
            }
        }

        if (res.status === 204) return { success: true };
        if (!res.ok) {
            const errBody = await res.text().catch(() => '');
            console.warn(`spotifyFetch error [${res.status}] ${endpoint}:`, errBody);
            return null;
        }
        return await res.json();
    } catch (err) {
        console.warn(`spotifyFetch exception on ${endpoint}:`, err);
        return null;
    }
}

async function createSpotifyPlaylistWithDetails(payload) {
    let token = await getValidAccessToken();
    if (!token) {
        throw new Error('Tu sesión de Spotify no es válida. Inicia sesión de nuevo.');
    }

    const requestCreate = async (authToken) => fetch('https://api.spotify.com/v1/me/playlists', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + authToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    let res = await requestCreate(token);
    if (res.status === 401) {
        const newToken = await refreshAccessToken();
        if (newToken) {
            res = await requestCreate(newToken);
        } else {
            localStorage.removeItem('spotify_access_token');
            accessToken = null;
            throw new Error('Tu sesión de Spotify expiró. Inicia sesión nuevamente.');
        }
    }

    if (res.ok) {
        return await res.json();
    }

    let detailMessage = `Spotify devolvió un error (${res.status}).`;
    try {
        const errData = await res.json();
        const spotifyMessage = errData?.error?.message || errData?.message;
        if (spotifyMessage) {
            detailMessage = `Spotify: ${spotifyMessage}`;
        } else if (res.statusText) {
            detailMessage = `Spotify (${res.status}): ${res.statusText}`;
        }
    } catch (e) {
        if (res.statusText) {
            detailMessage = `Spotify (${res.status}): ${res.statusText}`;
        }
    }

    throw new Error(detailMessage);
}

async function fetchUserProfile() {
    const data = await spotifyFetch('me');
    if (!data) return false;
    userProfileData = data;
    if (drawerUserName) drawerUserName.textContent = data.display_name || 'Usuario';
    if (drawerUserFollowers) drawerUserFollowers.textContent = `${data.followers ? formatNumber(data.followers.total) : 0} seguidores en Spotify`;
    const avatarUrl = data.images && data.images.length > 0 ? data.images[0].url : null;
    if (userImg) userImg.src = avatarUrl || DEFAULT_AVATAR_SVG;
    if (drawerUserImg) drawerUserImg.src = avatarUrl || DEFAULT_AVATAR_SVG;
    return true;
}

async function syncUserProfile() {
    let spotifySuccess = false;
    const token = await getValidAccessToken();
    if (token) {
        spotifySuccess = await fetchUserProfile();
    }

    if (!spotifySuccess) {
        await fetchLastFmGlobalStats({ updateProfileUI: true });
    } else {
        fetchLastFmGlobalStats({ updateProfileUI: false });
    }
}

// ----------------------------------------------------
// EN VIVO: DETECCIÓN DE REPRODUCCIÓN ACTUAL
// ----------------------------------------------------
let currentlyPlayingTimer = null;
let lastPlayingTrackKey = null;

async function fetchCurrentlyPlaying() {
    if (!navigator.onLine) return; // Si no hay internet, no consultar Last.fm
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

                const cover = firstTrack.image?.[1]?.['#text'] || FALLBACK_ART_SVG;
                const spotifySearch = `https://open.spotify.com/search/${encodeURIComponent(trackName + ' ' + artistName)}`;

                if (currentlyPlayingContainer) {
                    currentlyPlayingContainer.innerHTML = `
                        <div class="card-uniform border-primary border-opacity-40" style="background: linear-gradient(90deg, rgba(20, 16, 30, 0.95) 0%, rgba(38, 22, 60, 0.85) 100%);">
                            <img src="${cover}" class="img-thumb" alt="Cover" onerror="safeImgError(this)">
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

async function fetchLastFmGlobalStats(options = {}) {
    const { updateProfileUI = true } = options;
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

            if (updateProfileUI && !userProfileData) {
                const lfImg = data.user.image && data.user.image[1] && data.user.image[1]['#text'];
                if (userImg) userImg.src = lfImg || DEFAULT_AVATAR_SVG;
                if (drawerUserImg) drawerUserImg.src = lfImg || DEFAULT_AVATAR_SVG;
                if (drawerUserName) drawerUserName.textContent = data.user.name || `@${user}`;
                if (drawerUserFollowers) drawerUserFollowers.textContent = `${formatNumber(data.user.playcount)} scrobbles en Last.fm`;
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
    if (filterSearchInput) filterSearchInput.value = '';
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
        checkArtistMilestones(activeDb);

        let topData = activeDb.yearlyTops?.overall;
        let isDateRange = false;
        let dateRangeTo = '';

        if (currentRange === 'era-spotify') {
            topData = getRangeTopData(activeDb, '2019-05-01', '2025-08-31');
        } else if (currentRange === 'era-lastfm') {
            topData = getRangeTopData(activeDb, '2025-08-01', '2026-12-31');
            isDateRange = true;
            dateRangeTo = '2026-12-31';
        } else if (currentRange && currentRange.startsWith('dates_')) {
            const [fromD, toD] = currentRange.replace('dates_', '').split('_to_');
            topData = getRangeTopData(activeDb, fromD, toD);
            isDateRange = true;
            dateRangeTo = toD;
        } else if (currentRange.startsWith('year-')) {
            const y = currentRange.replace('year-', '');
            topData = activeDb.yearlyTops?.[y] || activeDb.yearlyTops?.overall;
        } else if (currentRange.startsWith('month-')) {
            const parts = currentRange.split('-');
            const y = parts[1];
            const m = parts[2];
            topData = activeDb.yearlyTops?.[y]?.months?.[m] || activeDb.yearlyTops?.overall;
        }

        const appliesDelta = (currentSource === 'unified' && lastFmRecentDelta.length > 0 &&
            (currentRange === 'overall' || currentRange === 'year-2026' || currentRange === 'month-2026-10' ||
             (isDateRange && dateRangeTo >= '2026-10-01')));

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
    if (!navigator.onLine) return; // Si no hay conexión a internet, no consultar APIs externas

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
    return FALLBACK_ART_SVG;
}

function getImageFromItem(item) {
    if (!item) return FALLBACK_ART_SVG;
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
            <span class="card-rank ${index === 0 ? 'top-1' : (index === 1 ? 'top-2' : (index === 2 ? 'top-3' : ''))}">#${String(index + 1).padStart(2, '0')}</span>
            <img id="${imgId}" src="${initialImg}" class="img-thumb" alt="Cover" onerror="safeImgError(this)">
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
            <span class="card-rank ${index === 0 ? 'top-1' : (index === 1 ? 'top-2' : (index === 2 ? 'top-3' : ''))}">#${String(index + 1).padStart(2, '0')}</span>
            <img id="${imgId}" src="${initialImg}" class="img-thumb rounded-circle" alt="Artist" onerror="safeImgError(this)">
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
            <span class="card-rank ${index === 0 ? 'top-1' : (index === 1 ? 'top-2' : (index === 2 ? 'top-3' : ''))}">#${String(index + 1).padStart(2, '0')}</span>
            <img id="${imgId}" src="${initialImg}" class="img-thumb" alt="Album" onerror="safeImgError(this)">
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
            <span class="card-rank">#${String(index + 1).padStart(2, '0')}</span>
            <img id="${imgId}" src="${initialImg}" class="img-thumb" alt="Cover" onerror="safeImgError(this)">
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
let itemStatsHistory = [];
let currentOpenStats = null;

function goBackItemStats() {
    if (itemStatsHistory.length > 0) {
        const prev = itemStatsHistory.pop();
        showItemStats(prev.type, prev.name, prev.artist, true);
    }
}

async function showItemStats(type, name, artist, isBack = false) {
    if (!isBack && currentOpenStats && (currentOpenStats.name !== name || currentOpenStats.type !== type)) {
        itemStatsHistory.push({ ...currentOpenStats });
    }
    currentOpenStats = { type, name, artist };

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

    const backBtnHtml = itemStatsHistory.length > 0 ? `
        <div class="mb-2.5">
            <button type="button" class="btn btn-sm text-white border-0 px-2.5 py-1 d-inline-flex align-items-center gap-1.5" onclick="goBackItemStats()" style="background-color: rgba(255, 255, 255, 0.08); font-size: 0.74rem; border-radius: 6px; cursor: pointer; transition: background 0.15s ease;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.15)'" onmouseout="this.style.backgroundColor='rgba(255,255,255,0.08)'">
                <i class="fa-solid fa-arrow-left"></i> Volver a ${itemStatsHistory[itemStatsHistory.length - 1].name}
            </button>
        </div>
    ` : '';

    if (!data) {
        modalBody.innerHTML = `
            ${backBtnHtml}
            <div class="d-flex align-items-center gap-3 mb-3 p-2 rounded" style="background-color: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06);">
                <img src="${coverImg}" class="rounded ${type === 'artist' ? 'rounded-circle' : ''}" style="width: 56px; height: 56px; object-fit: cover;" onerror="safeImgError(this)">
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
        const modalEl = document.getElementById('itemStatsModal');
        const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
        if (!modalEl.classList.contains('show')) {
            modalInstance.show();
        } else {
            modalEl.querySelector('.modal-body')?.scrollTo({ top: 0, behavior: 'smooth' });
        }
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
        ${backBtnHtml}
        <!-- Hero Header -->
        <div class="d-flex align-items-center gap-3 mb-3 p-2 rounded" style="background-color: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06);">
            <img src="${coverImg}" class="rounded ${type === 'artist' ? 'rounded-circle' : ''}" style="width: 58px; height: 58px; object-fit: cover; flex-shrink: 0;" alt="Cover" onerror="safeImgError(this)">
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

    const modalEl = document.getElementById('itemStatsModal');
    const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
    if (!modalEl.classList.contains('show')) {
        modalInstance.show();
    } else {
        modalEl.querySelector('.modal-body')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// ----------------------------------------------------
// MODAL LAST.FM CONFIGURACIÓN
// ----------------------------------------------------
function openLastFmModal() {
    const { user, key } = getLastFmCredentials();
    if (lastFmUsernameInput) lastFmUsernameInput.value = user;
    if (lastFmApiKeyInput) lastFmApiKeyInput.value = key;
    if (lastFmError) lastFmError.classList.add('d-none');

    const modal = bootstrap.Modal.getOrCreateInstance(lastFmModalEl);
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

        localStorage.removeItem('spoti_logged_out');
        localStorage.setItem('lastfm_user', user);
        localStorage.setItem('lastfm_key', key);
        showDashboard();
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
        if (!currentLoadedItems || currentLoadedItems.length === 0) {
            alert('No hay canciones cargadas en este momento.');
            return;
        }

        const trackCandidates = (currentLoadedItems || [])
            .map(item => ({
                name: (item?.name || '').trim(),
                artist: (typeof item?.artist === 'string'
                    ? item.artist
                    : (item?.artist?.name || item?.artist?.['#text'] || '')).trim(),
                uri: (item?.uri || '').trim()
            }))
            .filter(t => t.name && t.artist);

        if (trackCandidates.length === 0) {
            throw new Error('La vista actual no contiene canciones exportables. Cambia a la vista de canciones o recientes.');
        }

        const periodName = getRangeLabel(currentRange);
        const payload = {
            name: `Mi Top (${periodName}) - SpotiTracker`,
            description: `Playlist creada con mis canciones más escuchadas según Last.fm. Fecha: ${new Date().toLocaleDateString()}`,
            public: false
        };

        const createRes = await createSpotifyPlaylistWithDetails(payload);

        if (!createRes || !createRes.id) {
            throw new Error('Spotify no devolvió un identificador de playlist.');
        }

        const urisToAdd = [];
        const seenUris = new Set();
        for (const t of trackCandidates) {
            let resolvedUri = '';
            if (t.uri && t.uri.startsWith('spotify:track:')) {
                resolvedUri = t.uri;
            } else {
                try {
                    const q = encodeURIComponent(`track:${t.name} artist:${t.artist}`);
                    let sRes = await spotifyFetch(`search?type=track&limit=1&q=${q}`);
                    let foundUri = sRes?.tracks?.items?.[0]?.uri;
                    if (!foundUri) {
                        const fallbackQ = encodeURIComponent(`${t.name} ${t.artist}`.trim());
                        sRes = await spotifyFetch(`search?type=track&limit=1&q=${fallbackQ}`);
                        foundUri = sRes?.tracks?.items?.[0]?.uri;
                    }
                    if (foundUri && foundUri.startsWith('spotify:track:')) {
                        resolvedUri = foundUri;
                    }
                } catch (e) {
                    // Ignorar fallos de búsqueda individuales
                }
            }

            if (resolvedUri && !seenUris.has(resolvedUri)) {
                seenUris.add(resolvedUri);
                urisToAdd.push(resolvedUri);
            }
        }

        if (urisToAdd.length === 0) {
            throw new Error('Se creó la playlist, pero no se pudieron resolver canciones para agregar.');
        }

        let tracksAddedCount = 0;
        for (let i = 0; i < urisToAdd.length; i += 100) {
            const chunk = urisToAdd.slice(i, i + 100);
            let addRes = await spotifyFetch(`playlists/${createRes.id}/tracks`, {
                method: 'POST',
                body: JSON.stringify({ uris: chunk })
            });

            if (!addRes) {
                const queryUris = encodeURIComponent(chunk.join(','));
                addRes = await spotifyFetch(`playlists/${createRes.id}/tracks?uris=${queryUris}`, {
                    method: 'POST'
                });
            }

            if (addRes) tracksAddedCount += chunk.length;
        }

        if (tracksAddedCount > 0) {
            alert(`¡Playlist "${payload.name}" creada con éxito en tu Spotify con ${tracksAddedCount} canciones!`);
        } else {
            alert(`Playlist "${payload.name}" creada en Spotify, pero hubo un problema al sincronizar las canciones.\n\nTip: Si tus permisos de Spotify son antiguos, cierra sesión y vuelve a iniciar sesión en Spotify para otorgar permisos de playlist.`);
        }
        if (createRes.external_urls?.spotify) {
            window.open(createRes.external_urls.spotify, '_blank');
        }
    } catch (err) {
        console.error(err);
        alert(err?.message || 'Ocurrió un error al guardar la playlist.');
    }
}

// ----------------------------------------------------
// ACCIÓN: TARJETA PARA COMPARTIR
// ----------------------------------------------------
async function prepareShareCard() {
    const modalEl = bootstrap.Modal.getOrCreateInstance(shareCardModal);
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
            <img src="${img}" class="rounded" style="width: 32px; height: 32px; object-fit: cover;" alt="cover" onerror="safeImgError(this)">
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

// ----------------------------------------------------
// 6. BUSCADOR GLOBAL EN TIEMPO REAL
// ----------------------------------------------------
function renderCurrentItems(items) {
    if (currentType === 'tracks') renderTracks(items);
    else if (currentType === 'artists') renderArtists(items);
    else if (currentType === 'albums') renderAlbums(items);
    else if (currentType === 'recent') renderRecent(items);
}

async function handleFilterSearch(e) {
    const q = (e.target.value || '').trim().toLowerCase();
    if (!q) {
        renderCurrentItems(currentLoadedItems);
        return;
    }

    // Buscar en la base de datos completa de canciones registradas
    const activeDb = unifiedDb || spotifyDb || await getActiveDatabase();
    if (activeDb) {
        if (currentType === 'tracks' && activeDb.tracksLookup) {
            const all = Object.values(activeDb.tracksLookup);
            const matches = all.filter(t => {
                const name = (t.name || '').toLowerCase();
                const artist = (t.artist || '').toLowerCase();
                const album = (t.album || '').toLowerCase();
                return name.includes(q) || artist.includes(q) || album.includes(q);
            });

            matches.sort((a, b) => (b.plays || 0) - (a.plays || 0));

            const formatted = matches.slice(0, 200).map(t => ({
                name: t.name,
                artist: { name: t.artist },
                album: { name: t.album },
                playcount: t.plays || 0,
                uri: t.uri
            }));

            renderTracks(formatted);

            // Banner indicador de búsqueda en catálogo global
            const banner = document.createElement('div');
            banner.className = 'w-100 d-flex align-items-center justify-content-between py-1.5 px-3 mb-2 rounded border';
            banner.style = 'grid-column: 1 / -1; background: rgba(168, 85, 247, 0.08); border-color: rgba(168, 85, 247, 0.25) !important; font-size: 0.74rem;';
            banner.innerHTML = `
                <div class="d-flex align-items-center gap-1.5 text-white">
                    <i class="fa-solid fa-magnifying-glass text-primary"></i>
                    <span><strong>${matches.length}</strong> canciones encontradas en tu catálogo completo</span>
                </div>
                <span class="badge" style="font-family: var(--font-mono); font-size: 0.65rem; background: rgba(255,255,255,0.08); color: #cbd5e1;">Historial Global</span>
            `;
            statsList.prepend(banner);
            return;
        } else if (currentType === 'artists') {
            const allArtists = activeDb.top?.overall?.artists || (activeDb.artists ? Object.values(activeDb.artists) : []);
            if (allArtists.length > 0) {
                const matches = allArtists.filter(a => (a.name || '').toLowerCase().includes(q));
                matches.sort((a, b) => (b.plays || 0) - (a.plays || 0));
                renderArtists(matches.slice(0, 150));

                const banner = document.createElement('div');
                banner.className = 'w-100 d-flex align-items-center justify-content-between py-1.5 px-3 mb-2 rounded border';
                banner.style = 'grid-column: 1 / -1; background: rgba(168, 85, 247, 0.08); border-color: rgba(168, 85, 247, 0.25) !important; font-size: 0.74rem;';
                banner.innerHTML = `
                    <div class="d-flex align-items-center gap-1.5 text-white">
                        <i class="fa-solid fa-magnifying-glass text-primary"></i>
                        <span><strong>${matches.length}</strong> artistas encontrados en tu catálogo completo</span>
                    </div>
                    <span class="badge" style="font-family: var(--font-mono); font-size: 0.65rem; background: rgba(255,255,255,0.08); color: #cbd5e1;">Historial Global</span>
                `;
                statsList.prepend(banner);
                return;
            }
        } else if (currentType === 'albums') {
            const allAlbums = activeDb.top?.overall?.albums || (activeDb.albums ? Object.values(activeDb.albums) : []);
            if (allAlbums.length > 0) {
                const matches = allAlbums.filter(a => {
                    const name = (a.name || '').toLowerCase();
                    const artist = (a.artist || '').toLowerCase();
                    return name.includes(q) || artist.includes(q);
                });
                matches.sort((a, b) => (b.plays || 0) - (a.plays || 0));
                renderAlbums(matches.slice(0, 150));

                const banner = document.createElement('div');
                banner.className = 'w-100 d-flex align-items-center justify-content-between py-1.5 px-3 mb-2 rounded border';
                banner.style = 'grid-column: 1 / -1; background: rgba(168, 85, 247, 0.08); border-color: rgba(168, 85, 247, 0.25) !important; font-size: 0.74rem;';
                banner.innerHTML = `
                    <div class="d-flex align-items-center gap-1.5 text-white">
                        <i class="fa-solid fa-magnifying-glass text-primary"></i>
                        <span><strong>${matches.length}</strong> álbumes encontrados en tu catálogo completo</span>
                    </div>
                    <span class="badge" style="font-family: var(--font-mono); font-size: 0.65rem; background: rgba(255,255,255,0.08); color: #cbd5e1;">Historial Global</span>
                `;
                statsList.prepend(banner);
                return;
            }
        }
    }

    // Fallback: buscar en los items cargados actualmente
    const filtered = (currentLoadedItems || []).filter(item => {
        const name = (item.name || '').toLowerCase();
        const artist = (item.artist?.name || item.artist?.['#text'] || item.artist || '').toLowerCase();
        const album = (item.album?.name || item.album?.['#text'] || item.album || '').toLowerCase();
        return name.includes(q) || artist.includes(q) || album.includes(q);
    });
    renderCurrentItems(filtered);
}

// ----------------------------------------------------
// CARGA Y CACHÉ DE INSIGHTS (HÁBITOS, RÉCORDS, OLVIDADOS)
// ----------------------------------------------------
let cachedInsights = null;

async function loadInsightsData() {
    if (cachedInsights) return cachedInsights;
    if (unifiedDb && unifiedDb.insights) {
        cachedInsights = unifiedDb.insights;
        return cachedInsights;
    }
    try {
        const res = await fetch('/data/insights.json');
        if (res.ok) {
            cachedInsights = await res.json();
            return cachedInsights;
        }
    } catch (e) {
        console.warn('Error al cargar insights.json:', e);
    }
    return null;
}

// ----------------------------------------------------
// 2. HÁBITOS DE ESCUCHA (GRÁFICOS DE HORAS Y DÍAS)
// ----------------------------------------------------
async function openHabitsModal() {
    const habitsBody = document.getElementById('habits-body');
    if (!habitsBody) return;
    habitsBody.innerHTML = '<div class="text-center py-4 text-secondary"><span class="spinner-border spinner-border-sm text-info me-2"></span>Cargando tus hábitos...</div>';
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('habitsModal'));
    modal.show();

    const insights = await loadInsightsData();
    if (!insights || !insights.habits) {
        habitsBody.innerHTML = '<div class="text-secondary text-center py-3">No se encontraron datos de hábitos disponibles.</div>';
        return;
    }

    const h = insights.habits;
    const maxHourVal = Math.max(...h.hourly, 1);
    const maxDayVal = Math.max(...h.weekday, 1);

    let hourlyBarsHtml = '';
    h.hourly.forEach((count, hour) => {
        const pct = Math.round((count / maxHourVal) * 100);
        const label = `${String(hour).padStart(2, '0')}:00`;
        const isPeak = hour === h.peakHour;
        hourlyBarsHtml += `
            <div class="d-flex align-items-center gap-2 mb-1" style="font-size: 0.72rem;">
                <span class="text-secondary text-end font-monospace" style="width: 42px;">${label}</span>
                <div class="flex-grow-1 bg-black rounded" style="height: 7px; overflow: hidden; border: 1px solid var(--border-subtle);">
                    <div style="width: ${pct}%; height: 100%; background: ${isPeak ? 'var(--brand-primary)' : '#475569'}; border-radius: 3px;"></div>
                </div>
                <span class="${isPeak ? 'text-white fw-bold' : 'text-secondary'} font-monospace" style="width: 45px; text-align: right;">${formatNumber(count)}</span>
            </div>
        `;
    });

    let dayBarsHtml = '';
    h.weekdayNames.forEach((name, idx) => {
        const count = h.weekday[idx];
        const pct = Math.round((count / maxDayVal) * 100);
        const isPeak = name === h.peakWeekday;
        dayBarsHtml += `
            <div class="d-flex align-items-center gap-2 mb-1" style="font-size: 0.72rem;">
                <span class="text-secondary text-end" style="width: 65px;">${name}</span>
                <div class="flex-grow-1 bg-black rounded" style="height: 7px; overflow: hidden; border: 1px solid var(--border-subtle);">
                    <div style="width: ${pct}%; height: 100%; background: ${isPeak ? '#06b6d4' : '#475569'}; border-radius: 3px;"></div>
                </div>
                <span class="${isPeak ? 'text-white fw-bold' : 'text-secondary'} font-monospace" style="width: 45px; text-align: right;">${formatNumber(count)}</span>
            </div>
        `;
    });

    habitsBody.innerHTML = `
        <div class="p-2.5 rounded-3 border mb-3" style="background-color: var(--bg-surface-hover); border-color: var(--border-subtle) !important;">
            <div class="d-flex align-items-center gap-2 mb-1 text-info fw-semibold" style="font-size: 0.78rem;">
                <i class="fa-solid fa-bolt"></i> Tu Momento Favorito
            </div>
            <div class="text-white" style="font-size: 0.81rem;">
                Tu hora pico del día son las <strong>${h.peakHour}:00 hrs</strong> y tu día con mayor actividad musical es el <strong>${h.peakWeekday}</strong>.
            </div>
        </div>

        <div class="fw-bold text-white mb-2" style="font-size: 0.80rem;">Distribución por Día de la Semana</div>
        <div class="mb-3">${dayBarsHtml}</div>

        <div class="fw-bold text-white mb-2" style="font-size: 0.80rem;">Distribución por Hora del Día (0:00 - 23:00)</div>
        <div style="max-height: 220px; overflow-y: auto; padding-right: 4px;">${hourlyBarsHtml}</div>
    `;
}

// ----------------------------------------------------
// 3. SECCIÓN DE ARTISTAS OLVIDADOS
// ----------------------------------------------------
async function openForgottenModal() {
    const forgottenBody = document.getElementById('forgotten-body');
    if (!forgottenBody) return;
    forgottenBody.innerHTML = '<div class="text-center py-4 text-secondary"><span class="spinner-border spinner-border-sm text-warning me-2"></span>Buscando artistas olvidados...</div>';
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('forgottenModal'));
    modal.show();

    const insights = await loadInsightsData();
    const list = insights?.forgottenArtists || [];

    if (list.length === 0) {
        forgottenBody.innerHTML = '<div class="text-secondary text-center py-3">¡No tienes artistas olvidados! Sigues escuchando tu biblioteca activamente.</div>';
        return;
    }

    forgottenBody.innerHTML = `
        <div class="text-secondary mb-2" style="font-size: 0.76rem;">
            Artistas que escuchabas intensamente en el pasado y no has reproducido en más de 1 año:
        </div>
        <div id="forgotten-items-container" style="max-height: 380px; overflow-y: auto; padding-right: 2px;"></div>
    `;

    const container = document.getElementById('forgotten-items-container');
    list.forEach((art, idx) => {
        const lastDate = art.last ? new Date(art.last).toLocaleDateString([], { month: 'short', year: 'numeric' }) : 'Antiguo';
        const spSearch = `https://open.spotify.com/search/${encodeURIComponent(art.name)}`;
        const row = document.createElement('div');
        row.className = 'card-uniform mb-1';
        row.style.minHeight = '44px';
        row.style.padding = '5px 8px';
        row.innerHTML = `
            <span class="card-rank text-muted">#${idx + 1}</span>
            <div class="overflow-hidden flex-grow-1">
                <div class="fw-bold text-truncate text-white" style="font-size: 0.81rem;">${art.name}</div>
                <small class="text-secondary d-block text-truncate" style="font-size: 0.69rem;"><i class="fa-regular fa-clock me-1"></i>Última vez: ${lastDate} • Top: ${art.topTrack}</small>
            </div>
            <span class="badge-scrobble"><i class="fa-solid fa-headphones"></i>${formatNumber(art.plays)}</span>
            <a href="${spSearch}" target="_blank" rel="noopener noreferrer" class="btn-card-action" title="Volver a escuchar">
                <i class="fa-brands fa-spotify"></i>
            </a>
        `;
        row.addEventListener('click', () => {
            showItemStats('artist', art.name, '');
        });
        const spLink = row.querySelector('.btn-card-action');
        if (spLink) spLink.addEventListener('click', (e) => e.stopPropagation());
        container.appendChild(row);
    });
}

// ----------------------------------------------------
// 4. COMPARADOR MUSICAL ("VERSUS")
// ----------------------------------------------------
async function openVersusModal() {
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('versusModal'));
    modal.show();

    const db = await getActiveDatabase();
    if (!db || !db.artistsLookup) return;

    const selectA = document.getElementById('versus-select-a');
    const selectB = document.getElementById('versus-select-b');
    if (!selectA || !selectB) return;

    const allArtists = Object.values(db.artistsLookup).sort((a, b) => b.plays - a.plays).slice(0, 150);

    selectA.innerHTML = '';
    selectB.innerHTML = '';

    allArtists.forEach((a, i) => {
        const optA = document.createElement('option');
        optA.value = a.name;
        optA.textContent = `#${i + 1} ${a.name} (${formatNumber(a.plays)})`;
        selectA.appendChild(optA);

        const optB = document.createElement('option');
        optB.value = a.name;
        optB.textContent = `#${i + 1} ${a.name} (${formatNumber(a.plays)})`;
        selectB.appendChild(optB);
    });

    if (allArtists.length > 0) selectA.value = allArtists[0].name;
    if (allArtists.length > 1) selectB.value = allArtists[1].name;

    selectA.onchange = () => updateVersusResults(db);
    selectB.onchange = () => updateVersusResults(db);

    updateVersusResults(db);
}

function updateVersusResults(db) {
    const nameA = document.getElementById('versus-select-a')?.value;
    const nameB = document.getElementById('versus-select-b')?.value;
    const resultsContainer = document.getElementById('versus-comparison-results');
    if (!resultsContainer) return;

    const artMap = db.artistsLookup || {};
    const keyA = normalizeKey(nameA);
    const keyB = normalizeKey(nameB);

    const artA = artMap[keyA] || Object.values(artMap).find(a => normalizeKey(a.name) === keyA);
    const artB = artMap[keyB] || Object.values(artMap).find(a => normalizeKey(a.name) === keyB);

    if (!artA || !artB) return;

    const playsA = artA.plays || 0;
    const playsB = artB.plays || 0;
    const hoursA = (artA.ms ? (artA.ms / 3600000).toFixed(1) : (playsA * 3.5 / 60).toFixed(1));
    const hoursB = (artB.ms ? (artB.ms / 3600000).toFixed(1) : (playsB * 3.5 / 60).toFixed(1));
    const topSongA = artA.tracks?.[0]?.name || 'N/A';
    const topSongB = artB.tracks?.[0]?.name || 'N/A';

    const totalPlays = playsA + playsB || 1;
    const pctA = Math.round((playsA / totalPlays) * 100);
    const pctB = 100 - pctA;

    const winner = playsA >= playsB ? 'A' : 'B';

    resultsContainer.innerHTML = `
        <div class="p-2.5 rounded-3 border mb-3" style="background-color: var(--bg-surface-hover); border-color: var(--border-subtle) !important;">
            <div class="d-flex align-items-center justify-content-between mb-2">
                <div class="text-start" style="width: 45%;">
                    <div class="fw-bold text-truncate text-white" style="font-size: 0.88rem;">
                        ${winner === 'A' ? '👑 ' : ''}${artA.name}
                    </div>
                    <small class="text-secondary">${pctA}% cuota</small>
                </div>
                <div class="text-center text-muted fw-bold" style="font-size: 0.76rem;">VS</div>
                <div class="text-end" style="width: 45%;">
                    <div class="fw-bold text-truncate text-white" style="font-size: 0.88rem;">
                        ${winner === 'B' ? '👑 ' : ''}${artB.name}
                    </div>
                    <small class="text-secondary">${pctB}% cuota</small>
                </div>
            </div>

            <!-- Comparison Bar -->
            <div class="d-flex rounded overflow-hidden mb-2" style="height: 8px; background-color: #272733;">
                <div style="width: ${pctA}%; background: linear-gradient(90deg, #a855f7, #c084fc);"></div>
                <div style="width: ${pctB}%; background: linear-gradient(90deg, #06b6d4, #22d3ee);"></div>
            </div>
        </div>

        <!-- Comparative Metrics -->
        <div class="d-flex flex-column gap-2" style="font-size: 0.78rem;">
            <div class="d-flex justify-content-between border-bottom pb-1" style="border-color: var(--border-subtle) !important;">
                <span class="fw-bold text-white">${formatNumber(playsA)}</span>
                <span class="text-muted">Reproducciones</span>
                <span class="fw-bold text-white">${formatNumber(playsB)}</span>
            </div>
            <div class="d-flex justify-content-between border-bottom pb-1" style="border-color: var(--border-subtle) !important;">
                <span class="fw-bold text-white">${hoursA} h</span>
                <span class="text-muted">Horas Totales</span>
                <span class="fw-bold text-white">${hoursB} h</span>
            </div>
            <div class="d-flex justify-content-between border-bottom pb-1" style="border-color: var(--border-subtle) !important;">
                <span class="text-white text-truncate text-start" style="max-width: 40%;" title="${topSongA}">${topSongA}</span>
                <span class="text-muted text-center" style="min-width: 80px;">Canción Top</span>
                <span class="text-white text-truncate text-end" style="max-width: 40%;" title="${topSongB}">${topSongB}</span>
            </div>
        </div>
    `;
}

// ----------------------------------------------------
// 5. RÉCORDS Y LOGROS PERSONALES
// ----------------------------------------------------
async function openRecordsModal() {
    const recordsBody = document.getElementById('records-body');
    if (!recordsBody) return;
    recordsBody.innerHTML = '<div class="text-center py-4 text-secondary"><span class="spinner-border spinner-border-sm text-warning me-2"></span>Calculando tus récords...</div>';
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('recordsModal'));
    modal.show();

    const insights = await loadInsightsData();
    const rec = insights?.records;
    if (!rec) {
        recordsBody.innerHTML = '<div class="text-secondary text-center py-3">No hay datos de récords disponibles.</div>';
        return;
    }

    const topDayDate = rec.topDay?.date ? new Date(rec.topDay.date + 'T12:00:00Z').toLocaleDateString([], { day: '2-digit', month: 'long', year: 'numeric' }) : 'N/A';
    const marathonDate = rec.marathonArtist?.date ? new Date(rec.marathonArtist.date + 'T12:00:00Z').toLocaleDateString([], { day: '2-digit', month: 'long', year: 'numeric' }) : 'N/A';

    let topDaysHtml = '';
    (rec.topDaysList || []).forEach((d, i) => {
        const fDate = new Date(d.date + 'T12:00:00Z').toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
        topDaysHtml += `
            <div class="d-flex justify-content-between py-1 border-bottom" style="border-color: var(--border-subtle) !important; font-size: 0.74rem;">
                <span class="text-white">#${i + 1} ${fDate}</span>
                <span class="badge-scrobble">${d.count} streams</span>
            </div>
        `;
    });

    recordsBody.innerHTML = `
        <div class="row g-2 mb-3">
            <div class="col-12">
                <div class="p-3 rounded-3 border" style="background-color: var(--bg-surface-hover); border-color: var(--border-subtle) !important;">
                    <div class="d-flex align-items-center gap-2 mb-1 text-warning fw-semibold" style="font-size: 0.76rem;">
                        <i class="fa-solid fa-trophy"></i> Día Récord Histórico
                    </div>
                    <div class="display-6 fw-bold text-white mb-0" style="font-size: 1.5rem;">${rec.topDay.count} <span style="font-size: 0.82rem;" class="fw-normal text-secondary">canciones</span></div>
                    <div class="text-secondary" style="font-size: 0.76rem;">El <strong>${topDayDate}</strong> fue el día con más música en toda tu vida registrada.</div>
                </div>
            </div>

            <div class="col-12">
                <div class="p-3 rounded-3 border" style="background-color: var(--bg-surface-hover); border-color: var(--border-subtle) !important;">
                    <div class="d-flex align-items-center gap-2 mb-1 text-info fw-semibold" style="font-size: 0.76rem;">
                        <i class="fa-solid fa-fire"></i> Artista Más Maratoneado
                    </div>
                    <div class="h6 fw-bold text-white mb-0">${rec.marathonArtist.artist} (${rec.marathonArtist.count} reproducciones)</div>
                    <div class="text-secondary" style="font-size: 0.76rem;">Escuchado intensamente en una sola jornada el <strong>${marathonDate}</strong>.</div>
                </div>
            </div>

            <div class="col-6">
                <div class="p-2.5 rounded-3 border" style="background-color: var(--bg-surface-hover); border-color: var(--border-subtle) !important;">
                    <div class="text-muted" style="font-size: 0.68rem;">Días con Música</div>
                    <div class="fw-bold text-white mb-0" style="font-size: 0.88rem;">${formatNumber(rec.totalDaysActive)} días</div>
                </div>
            </div>

            <div class="col-6">
                <div class="p-2.5 rounded-3 border" style="background-color: var(--bg-surface-hover); border-color: var(--border-subtle) !important;">
                    <div class="text-muted" style="font-size: 0.68rem;">Promedio Diario</div>
                    <div class="fw-bold text-white mb-0" style="font-size: 0.88rem;">~${rec.avgPlaysPerDay} canciones/día</div>
                </div>
            </div>
        </div>

        <div class="fw-bold text-white mb-2" style="font-size: 0.80rem;">Top 5 Días con Más Escuchas</div>
        <div>${topDaysHtml}</div>
    `;
}

// ----------------------------------------------------
// 5. SALA DE TROFEOS, HITOS (+100 STREAMS) & GAMIFICACIÓN
// ----------------------------------------------------
const MILESTONE_STORAGE_KEY = 'spoti_artist_milestones';
let hasCheckedMilestonesThisSession = false;

function getStoredArtistMilestones() {
    try {
        const raw = localStorage.getItem(MILESTONE_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function saveStoredArtistMilestones(milestones) {
    try {
        localStorage.setItem(MILESTONE_STORAGE_KEY, JSON.stringify(milestones));
    } catch (e) {}
}

async function checkArtistMilestones(activeDb) {
    if (!activeDb || !activeDb.artistsLookup) return;
    if (hasCheckedMilestonesThisSession) return;
    hasCheckedMilestonesThisSession = true;

    let stored = getStoredArtistMilestones();
    const isFirstRun = stored === null;
    if (!stored) stored = {};

    const allArtists = Object.values(activeDb.artistsLookup);
    const newCelebrations = [];

    allArtists.forEach(art => {
        let totalPlays = art.plays || 0;
        if (currentSource === 'unified' && lastFmRecentDelta.length > 0) {
            const normA = normalizeKey(art.name);
            const deltaCount = lastFmRecentDelta.filter(t => {
                const tArt = normalizeKey(t.artist ? (t.artist['#text'] || t.artist.name || '') : '');
                return tArt === normA || tArt.includes(normA) || normA.includes(tArt);
            }).length;
            totalPlays += deltaCount;
        }

        if (totalPlays >= 100) {
            const currentMilestone = Math.floor(totalPlays / 100) * 100;
            const normKey = normalizeKey(art.name);
            const prevMilestone = stored[normKey] || 0;

            if (currentMilestone > prevMilestone) {
                stored[normKey] = currentMilestone;
                if (!isFirstRun) {
                    newCelebrations.push({
                        name: art.name,
                        milestone: currentMilestone,
                        totalPlays: totalPlays
                    });
                }
            }
        }
    });

    saveStoredArtistMilestones(stored);

    if (newCelebrations.length > 0) {
        newCelebrations.sort((a, b) => b.milestone - a.milestone);
        const topHito = newCelebrations[0];

        sendPushMilestoneNotification(topHito.name, topHito.milestone);

        setTimeout(() => {
            showArtistMilestoneCelebration(topHito);
        }, 800);
    }
}

async function toggleMilestonePushNotifications() {
    if (!('Notification' in window)) {
        alert('Tu navegador no admite notificaciones web.');
        return;
    }

    if (Notification.permission === 'granted') {
        alert('¡Las notificaciones push para hitos ya están activas en este dispositivo!');
        updatePushButtonsUI();
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            sendPushMilestoneNotification('Notificaciones Activadas', '100');
            updatePushButtonsUI();
        } else {
            alert('Has denegado o cancelado el permiso de notificaciones.');
            updatePushButtonsUI();
        }
    } catch (err) {
        console.error('Error solicitando permisos de notificación:', err);
    }
}

function updatePushButtonsUI() {
    const isGranted = 'Notification' in window && Notification.permission === 'granted';
    const btnToggle = document.getElementById('btn-toggle-milestone-push');
    const pushPrompt = document.getElementById('milestone-push-prompt');

    if (btnToggle) {
        if (isGranted) {
            btnToggle.classList.remove('btn-outline-warning');
            btnToggle.classList.add('btn-warning');
            btnToggle.innerHTML = '<i class="fa-solid fa-check me-1"></i> Alertas Activas';
        } else {
            btnToggle.classList.add('btn-outline-warning');
            btnToggle.classList.remove('btn-warning');
            btnToggle.innerHTML = 'Activar Alertas';
        }
    }

    if (pushPrompt) {
        if (isGranted) {
            pushPrompt.classList.add('d-none');
        } else {
            pushPrompt.classList.remove('d-none');
        }
    }
}

function sendPushMilestoneNotification(artistName, milestone) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const title = `🎉 ¡Hito Alcanzado en Spotify Tracker!`;
    const options = {
        body: `¡${artistName} acaba de superar las ${milestone} reproducciones en tu biblioteca!`,
        icon: '/logo.png',
        badge: '/logo.png',
        tag: `milestone-${normalizeKey(artistName)}-${milestone}`,
        renotify: true
    };

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(reg => {
            reg.showNotification(title, options);
        }).catch(() => {
            new Notification(title, options);
        });
    } else {
        new Notification(title, options);
    }
}

async function showArtistMilestoneCelebration(data) {
    const { name, milestone } = data;
    const modalEl = document.getElementById('artistMilestoneModal');
    if (!modalEl) return;

    const nameEl = document.getElementById('milestone-artist-name');
    const countEl = document.getElementById('milestone-plays-count');
    const badgeEl = document.getElementById('milestone-badge-pill');
    const congratsEl = document.getElementById('milestone-congrats-text');
    const imgEl = document.getElementById('milestone-artist-img');
    const viewStatsBtn = document.getElementById('btn-milestone-view-stats');

    if (nameEl) nameEl.textContent = name;
    if (countEl) countEl.textContent = formatNumber(milestone);
    if (badgeEl) badgeEl.textContent = `+${milestone}`;

    if (congratsEl) {
        if (milestone >= 1000) {
            congratsEl.innerHTML = `<strong>¡Hito Legendario!</strong> ${name} ha sobrepasado las <strong>${formatNumber(milestone)} reproducciones</strong>. Es uno de los pilares de tu historia musical.`;
        } else if (milestone >= 500) {
            congratsEl.innerHTML = `<strong>¡Medio Millar de Escuchas!</strong> Superar los <strong>${milestone} streams</strong> sitúa a ${name} en el podio más alto de tu biblioteca.`;
        } else if (milestone >= 200) {
            congratsEl.innerHTML = `<strong>¡Doble Centenar!</strong> ${name} acumula más de <strong>${milestone} streams</strong> demostrando una fidelidad continua en tus listas.`;
        } else {
            congratsEl.innerHTML = `<strong>¡Bienvenido al Club de los 100!</strong> ${name} acaba de superar sus primeras <strong>100 reproducciones</strong> oficiales en tu cuenta.`;
        }
    }

    if (imgEl) {
        imgEl.src = '/logo.png';
        const artKey = `artist::${normalizeKey(name)}::`;
        if (artCache[artKey]) {
            imgEl.src = artCache[artKey];
        } else {
            resolveSpotifyArtwork(name, '', 'artist', 'milestone-artist-img');
        }
    }

    if (viewStatsBtn) {
        viewStatsBtn.onclick = () => {
            const mInstance = bootstrap.Modal.getInstance(modalEl);
            if (mInstance) mInstance.hide();
            showItemStats('artist', name, '');
        };
    }

    updatePushButtonsUI();

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();

    if (typeof confetti === 'function') {
        confetti({
            particleCount: 90,
            spread: 80,
            origin: { y: 0.6 }
        });
        setTimeout(() => {
            confetti({
                particleCount: 50,
                angle: 60,
                spread: 60,
                origin: { x: 0.1, y: 0.7 }
            });
            confetti({
                particleCount: 50,
                angle: 120,
                spread: 60,
                origin: { x: 0.9, y: 0.7 }
            });
        }, 280);
    }
}

async function openTrophiesModal() {
    const modalEl = document.getElementById('trophiesModal');
    if (!modalEl) return;

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();

    updatePushButtonsUI();

    const db = await getActiveDatabase();
    if (!db || !db.artistsLookup) return;

    renderTrophiesMilestonesTab(db);
    renderTrophiesBadgesTab(db);
}

function renderTrophiesMilestonesTab(db) {
    const nearContainer = document.getElementById('near-milestones-container');
    const achievedContainer = document.getElementById('achieved-milestones-container');
    const countLabel = document.getElementById('milestones-count-label');

    if (!nearContainer || !achievedContainer) return;

    const allArtists = Object.values(db.artistsLookup || {}).map(art => {
        let totalPlays = art.plays || 0;
        if (currentSource === 'unified' && lastFmRecentDelta.length > 0) {
            const normA = normalizeKey(art.name);
            const deltaCount = lastFmRecentDelta.filter(t => {
                const tArt = normalizeKey(t.artist ? (t.artist['#text'] || t.artist.name || '') : '');
                return tArt === normA || tArt.includes(normA) || normA.includes(tArt);
            }).length;
            totalPlays += deltaCount;
        }
        return {
            ...art,
            effectivePlays: totalPlays
        };
    });

    // 1. Artistas cerca de su próximo centenar (a falta de 1 a 25 reproducciones)
    const nearList = allArtists
        .filter(a => {
            const r = a.effectivePlays % 100;
            return (a.effectivePlays >= 75 && r >= 75 && r < 100);
        })
        .map(a => {
            const r = a.effectivePlays % 100;
            const nextMilestone = (Math.floor(a.effectivePlays / 100) + 1) * 100;
            const remaining = nextMilestone - a.effectivePlays;
            return {
                ...a,
                nextMilestone,
                remaining,
                progressPct: r
            };
        })
        .sort((a, b) => a.remaining - b.remaining)
        .slice(0, 6);

    if (nearList.length === 0) {
        nearContainer.innerHTML = `
            <div class="p-2.5 rounded text-center border border-secondary border-opacity-10 text-secondary" style="background: rgba(255,255,255,0.02); font-size: 0.74rem;">
                No hay artistas a menos de 25 canciones de un hito en este momento. ¡Sigue escuchando música!
            </div>
        `;
    } else {
        nearContainer.innerHTML = nearList.map(a => {
            const safeName = a.name.replace(/'/g, "\\'");
            const artKey = `artist::${normalizeKey(a.name)}::`;
            const cover = artCache[artKey] || '/logo.png';
            const imgId = `near-art-img-${Math.abs(normalizeKey(a.name).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0))}`;
            return `
                <div class="card-uniform p-2" onclick="showItemStats('artist', '${safeName}', '')" style="cursor: pointer; min-height: 48px;">
                    <img id="${imgId}" src="${cover}" class="rounded-circle flex-shrink-0" style="width: 38px; height: 38px; object-fit: cover;" onerror="safeAvatarError(this)">
                    <div class="flex-grow-1 overflow-hidden">
                        <div class="d-flex align-items-center justify-content-between mb-0.5">
                            <span class="fw-bold text-white text-truncate" style="font-size: 0.8rem;">${a.name}</span>
                            <span class="badge border border-warning border-opacity-30 text-warning" style="background: rgba(234, 179, 8, 0.12); font-size: 0.68rem; padding: 1px 6px;">
                                ¡Faltan ${a.remaining}!
                            </span>
                        </div>
                        <div class="progress" style="height: 5px; background: rgba(255,255,255,0.06); border-radius: 3px;">
                            <div class="progress-bar" style="width: ${a.progressPct}%; background: linear-gradient(90deg, #f59e0b, #eab308);"></div>
                        </div>
                        <div class="d-flex justify-content-between text-secondary mt-0.5" style="font-size: 0.64rem;">
                            <span>${a.effectivePlays} escuchas</span>
                            <span>Meta: ${a.nextMilestone}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        nearList.forEach(a => {
            const artKey = `artist::${normalizeKey(a.name)}::`;
            if (!artCache[artKey]) {
                const imgId = `near-art-img-${Math.abs(normalizeKey(a.name).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0))}`;
                resolveSpotifyArtwork(a.name, '', 'artist', imgId);
            }
        });
    }

    // 2. Club de los +100 Streams
    const achieved = allArtists.filter(a => a.effectivePlays >= 100).sort((a, b) => b.effectivePlays - a.effectivePlays);
    if (countLabel) countLabel.textContent = `${achieved.length} artistas en el club`;

    if (achieved.length === 0) {
        achievedContainer.innerHTML = `
            <div class="text-center py-4 text-secondary" style="font-size: 0.78rem;">
                Aún no tienes artistas con 100 o más reproducciones registradas.
            </div>
        `;
    } else {
        achievedContainer.innerHTML = achieved.map((a, idx) => {
            const safeName = a.name.replace(/'/g, "\\'");
            const milestone = Math.floor(a.effectivePlays / 100) * 100;
            const artKey = `artist::${normalizeKey(a.name)}::`;
            const cover = artCache[artKey] || '/logo.png';
            const imgId = `achieved-art-img-${idx}`;
            return `
                <div class="card-uniform p-1.5 px-2.5" style="min-height: 44px;">
                    <span class="card-rank text-muted" style="width: 24px;">#${idx + 1}</span>
                    <img id="${imgId}" src="${cover}" class="rounded-circle flex-shrink-0" style="width: 34px; height: 34px; object-fit: cover;" onerror="safeAvatarError(this)">
                    <div class="overflow-hidden flex-grow-1 cursor-pointer" onclick="showItemStats('artist', '${safeName}', '')" title="Ver estadísticas">
                        <div class="fw-bold text-white text-truncate" style="font-size: 0.78rem;">${a.name}</div>
                        <small class="text-secondary" style="font-size: 0.68rem;">${formatNumber(a.effectivePlays)} reproducciones totales</small>
                    </div>
                    <span class="badge border border-warning border-opacity-30 text-warning px-2 py-1 flex-shrink-0" style="background: rgba(234, 179, 8, 0.12); font-size: 0.7rem;">
                        +${formatNumber(milestone)}
                    </span>
                    <button type="button" class="btn btn-sm btn-outline-secondary border-0 text-warning px-2 py-1 flex-shrink-0" onclick="showArtistMilestoneCelebration({ name: '${safeName}', milestone: ${milestone}, totalPlays: ${a.effectivePlays} })" title="Revivir celebración con confeti" style="font-size: 0.75rem;">
                        <i class="fa-solid fa-wand-magic-sparkles"></i>
                    </button>
                </div>
            `;
        }).join('');

        achieved.slice(0, 30).forEach((a, idx) => {
            const artKey = `artist::${normalizeKey(a.name)}::`;
            if (!artCache[artKey]) {
                resolveSpotifyArtwork(a.name, '', 'artist', `achieved-art-img-${idx}`);
            }
        });
    }
}

async function renderTrophiesBadgesTab(db) {
    const container = document.getElementById('badges-container');
    if (!container) return;

    container.innerHTML = '<div class="text-center py-4 text-secondary col-12"><span class="spinner-border spinner-border-sm text-info me-2"></span>Calculando tus medallas...</div>';

    const insights = await loadInsightsData();
    const rec = insights?.records || {};
    const habits = insights?.habits || {};

    const allArtists = Object.values(db.artistsLookup || {});
    const allTracks = Object.values(db.tracksLookup || {});

    const totalDistinctArtists = allArtists.length;
    const totalDistinctTracks = allTracks.length;
    const topArtistPlays = allArtists.length > 0 ? Math.max(...allArtists.map(a => a.plays || 0)) : 0;
    const topTrackPlays = allTracks.length > 0 ? Math.max(...allTracks.map(t => t.plays || 0)) : 0;
    const artistsOver100Count = allArtists.filter(a => (a.plays || 0) >= 100).length;
    const topDayCount = rec.topDay?.count || 0;
    const activeDays = rec.totalDaysActive || 0;

    const hoursMap = habits.hours || {};
    const totalHourStreams = Object.values(hoursMap).reduce((a, b) => a + b, 0) || 1;
    const nightStreams = [0, 1, 2, 3, 4, 5].reduce((sum, h) => sum + (hoursMap[String(h)] || 0), 0);
    const nightPct = Math.round((nightStreams / totalHourStreams) * 100);

    const morningStreams = [6, 7, 8, 9, 10].reduce((sum, h) => sum + (hoursMap[String(h)] || 0), 0);
    const morningPct = Math.round((morningStreams / totalHourStreams) * 100);

    const has2019or2020 = Boolean(db.yearlyTops?.['2019'] || db.yearlyTops?.['2020']);

    const badges = [
        {
            icon: 'fa-solid fa-moon text-info',
            title: 'Búho Nocturno',
            desc: 'Más del 15% de tus escuchas son de madrugada (12am a 6am)',
            achieved: nightPct >= 15,
            progress: `${nightPct}% / 15%`,
            pct: Math.min(100, Math.round((nightPct / 15) * 100))
        },
        {
            icon: 'fa-solid fa-sun text-warning',
            title: 'Madrugador Sonoro',
            desc: 'Más del 15% de tus escuchas ocurren en la mañana (6am a 11am)',
            achieved: morningPct >= 15,
            progress: `${morningPct}% / 15%`,
            pct: Math.min(100, Math.round((morningPct / 15) * 100))
        },
        {
            icon: 'fa-solid fa-crown text-warning',
            title: 'Devoción Absoluta',
            desc: 'Superar 1,000 reproducciones con un mismo artista',
            achieved: topArtistPlays >= 1000,
            progress: `${formatNumber(topArtistPlays)} / 1,000`,
            pct: Math.min(100, Math.round((topArtistPlays / 1000) * 100))
        },
        {
            icon: 'fa-solid fa-certificate text-success',
            title: 'Club Centenario',
            desc: 'Tener al menos 10 artistas con +100 reproducciones',
            achieved: artistsOver100Count >= 10,
            progress: `${artistsOver100Count} / 10 artistas`,
            pct: Math.min(100, Math.round((artistsOver100Count / 10) * 100))
        },
        {
            icon: 'fa-solid fa-compass text-primary',
            title: 'Arqueólogo Musical',
            desc: 'Tener música y escuchas registradas desde 2019 o 2020',
            achieved: has2019or2020,
            progress: has2019or2020 ? 'Registros de 2019/2020' : 'Solo reciente',
            pct: has2019or2020 ? 100 : 25
        },
        {
            icon: 'fa-solid fa-person-running text-danger',
            title: 'Maratonista Sonoro',
            desc: 'Escuchar más de 100 canciones en un solo día',
            achieved: topDayCount >= 100,
            progress: `${topDayCount} / 100 canciones`,
            pct: Math.min(100, Math.round((topDayCount / 100) * 100))
        },
        {
            icon: 'fa-solid fa-compass-drafting text-info',
            title: 'Explorador Compulsivo',
            desc: 'Haber descubierto más de 500 artistas distintos',
            achieved: totalDistinctArtists >= 500,
            progress: `${formatNumber(totalDistinctArtists)} / 500 artistas`,
            pct: Math.min(100, Math.round((totalDistinctArtists / 500) * 100))
        },
        {
            icon: 'fa-solid fa-compact-disc text-warning',
            title: 'Gran Fonoteca',
            desc: 'Más de 1,000 canciones únicas escuchadas',
            achieved: totalDistinctTracks >= 1000,
            progress: `${formatNumber(totalDistinctTracks)} / 1,000 temas`,
            pct: Math.min(100, Math.round((totalDistinctTracks / 1000) * 100))
        },
        {
            icon: 'fa-solid fa-repeat text-primary',
            title: 'Adicto al Bucle',
            desc: 'Repetir una misma canción más de 100 veces',
            achieved: topTrackPlays >= 100,
            progress: `${formatNumber(topTrackPlays)} / 100 reps`,
            pct: Math.min(100, Math.round((topTrackPlays / 100) * 100))
        },
        {
            icon: 'fa-solid fa-bolt text-warning',
            title: 'Racha Legendaria',
            desc: 'Superar los 500 días con música activa en tu historia',
            achieved: activeDays >= 500,
            progress: `${formatNumber(activeDays)} / 500 días`,
            pct: Math.min(100, Math.round((activeDays / 500) * 100))
        }
    ];

    container.innerHTML = badges.map(b => `
        <div class="col-12 col-sm-6">
            <div class="p-2.5 rounded-3 border h-100 d-flex flex-column justify-content-between" style="background: ${b.achieved ? 'rgba(168, 85, 247, 0.08)' : 'rgba(255, 255, 255, 0.02)'}; border-color: ${b.achieved ? 'rgba(168, 85, 247, 0.35)' : 'rgba(255, 255, 255, 0.06)'} !important;">
                <div>
                    <div class="d-flex align-items-center justify-content-between mb-1.5">
                        <div class="d-flex align-items-center gap-2">
                            <i class="${b.icon} fs-5"></i>
                            <span class="fw-bold text-white" style="font-size: 0.82rem;">${b.title}</span>
                        </div>
                        <span class="badge ${b.achieved ? 'bg-success text-white' : 'bg-secondary bg-opacity-25 text-secondary'}" style="font-size: 0.64rem;">
                            ${b.achieved ? '✓ Desbloqueado' : 'En progreso'}
                        </span>
                    </div>
                    <p class="text-secondary mb-2" style="font-size: 0.72rem; line-height: 1.3;">${b.desc}</p>
                </div>
                <div>
                    <div class="progress mb-1" style="height: 5px; background: rgba(255,255,255,0.06); border-radius: 3px;">
                        <div class="progress-bar ${b.achieved ? 'bg-success' : 'bg-primary'}" style="width: ${b.pct}%;"></div>
                    </div>
                    <div class="d-flex justify-content-between text-muted" style="font-size: 0.65rem;">
                        <span>Progreso:</span>
                        <span class="${b.achieved ? 'text-success fw-semibold' : 'text-white'}">${b.progress}</span>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// ----------------------------------------------------
// CURADOR DE PLAYLISTS SEMESTRALES
// ----------------------------------------------------
let curatorSelectedTracks = [];
let curatorBenchTracks = [];
let curatorCurrentCycleInfo = {
    year: '',
    half: '',
    periodStr: 'Sin periodo seleccionado',
    cycleStart: ''
};

async function openPlaylistCuratorModal() {
    const modalEl = document.getElementById('playlistCuratorModal');
    if (!modalEl) return;

    if (!window._curatorInitialized) {
        window._curatorInitialized = true;
        initCuratorEvents();
    }

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();

    // Default vacío: si no hay año ni mitad seleccionados, empezar totalmente limpio
    const year = curatorYear?.value || '';
    const half = curatorHalf?.value || '';
    if (!year || !half) {
        curatorCurrentCycleInfo = {
            year: '',
            half: '',
            periodStr: 'Sin periodo seleccionado',
            cycleStart: ''
        };
        curatorSelectedTracks = [];
        curatorBenchTracks = [];
        renderCuratorView();
        return;
    }

    await loadCuratorCandidates(false);
}

function initCuratorEvents() {
    if (curatorBtnGenerate) {
        curatorBtnGenerate.addEventListener('click', generateCuratorSelection);
    }
    if (curatorYear) {
        curatorYear.addEventListener('change', () => {
            const shouldAutoSelect = curatorSelectedTracks.length > 0;
            loadCuratorCandidates(shouldAutoSelect);
        });
    }
    if (curatorHalf) {
        curatorHalf.addEventListener('change', () => {
            const shouldAutoSelect = curatorSelectedTracks.length > 0;
            loadCuratorCandidates(shouldAutoSelect);
        });
    }
    if (curatorExcludePast) {
        curatorExcludePast.addEventListener('change', () => {
            const shouldAutoSelect = curatorSelectedTracks.length > 0;
            loadCuratorCandidates(shouldAutoSelect);
        });
    }
    if (curatorTargetCount) {
        curatorTargetCount.addEventListener('change', () => {
            const newTarget = parseInt(curatorTargetCount.value, 10) || 18;
            if (newTarget < 5) curatorTargetCount.value = 5;
            if (newTarget > 50) curatorTargetCount.value = 50;
            renderCuratorView();
        });
    }

    if (curatorTabSelected && curatorTabBench) {
        curatorTabSelected.addEventListener('click', () => {
            curatorTabSelected.classList.add('active');
            curatorTabBench.classList.remove('active');
            if (curatorSelectedView) curatorSelectedView.classList.remove('d-none');
            if (curatorBenchView) curatorBenchView.classList.add('d-none');
        });
        curatorTabBench.addEventListener('click', () => {
            curatorTabBench.classList.add('active');
            curatorTabSelected.classList.remove('active');
            if (curatorBenchView) curatorBenchView.classList.remove('d-none');
            if (curatorSelectedView) curatorSelectedView.classList.add('d-none');
        });
    }

    if (curatorBenchSearch) {
        curatorBenchSearch.addEventListener('input', () => {
            renderCuratorBenchList();
        });
    }

    if (curatorBtnCopy) {
        curatorBtnCopy.addEventListener('click', copyCuratorPlaylistText);
    }
    if (curatorBtnClear) {
        curatorBtnClear.addEventListener('click', clearCuratorSelection);
    }
    if (curatorBtnYtMusic) {
        curatorBtnYtMusic.addEventListener('click', exportCuratorYouTubeMusic);
    }
    if (curatorBtnSpotify) {
        curatorBtnSpotify.addEventListener('click', createCuratorSpotifyPlaylist);
    }
}

function getCuratorStageMonths(targetYear, targetHalf) {
    const y = parseInt(targetYear, 10);
    if (targetHalf === '1') {
        return [
            `${y - 1}-11`,
            `${y - 1}-12`,
            `${y}-01`,
            `${y}-02`,
            `${y}-03`,
            `${y}-04`,
            `${y}-05`
        ];
    } else {
        return [
            `${y}-05`,
            `${y}-06`,
            `${y}-07`,
            `${y}-08`,
            `${y}-09`,
            `${y}-10`,
            `${y}-11`
        ];
    }
}

function getCuratorTrackStagePlays(track, targetYear, targetHalf) {
    if (!track || !track.months) return 0;
    const mList = getCuratorStageMonths(targetYear, targetHalf);
    let count = 0;
    for (const m of mList) {
        if (track.months[m]) count += track.months[m];
    }
    return count;
}

function getCuratorTrackPriorStageMax(t, currentYearNum, currentHalf) {
    let maxPlays = 0;
    for (let y = 2018; y <= currentYearNum; y++) {
        for (const h of ['1', '2']) {
            if (y === currentYearNum && h === currentHalf) {
                return maxPlays;
            }
            const stagePlays = getCuratorTrackStagePlays(t, y, h);
            if (stagePlays > maxPlays) {
                maxPlays = stagePlays;
            }
        }
    }
    return maxPlays;
}

async function loadCuratorCandidates(autoSelect = true) {
    const year = curatorYear?.value || '';
    const half = curatorHalf?.value || '';

    if (!year || !half) {
        curatorCurrentCycleInfo = {
            year: '',
            half: '',
            periodStr: 'Sin periodo seleccionado',
            cycleStart: ''
        };
        curatorSelectedTracks = [];
        curatorBenchTracks = [];
        renderCuratorView();
        return;
    }

    const activeDb = await getActiveDatabase();
    if (!activeDb || !activeDb.tracksLookup) return;

    if (curatorSelectedList && autoSelect) {
        curatorSelectedList.innerHTML = '<div class="text-center text-secondary py-4"><i class="fa-solid fa-spinner fa-spin me-2"></i>Calculando candidatos de este periodo...</div>';
    }

    const targetCount = parseInt(curatorTargetCount?.value, 10) || 18;
    const excludePast = curatorExcludePast ? curatorExcludePast.checked : true;

    const yNum = parseInt(year, 10);
    const months = getCuratorStageMonths(year, half);
    let cycleStart = '';
    let periodStr = '';

    if (half === '1') {
        cycleStart = `${yNum - 1}-11-01`;
        periodStr = `21 Nov ${yNum - 1} — 20 May ${year}`;
    } else {
        cycleStart = `${year}-05-01`;
        periodStr = `21 May ${year} — 20 Nov ${year}`;
    }

    curatorCurrentCycleInfo = {
        year,
        half,
        periodStr,
        cycleStart
    };

    // Recorrer catálogo
    const allCandidates = [];
    const tracksArray = Object.values(activeDb.tracksLookup);

    // Integración de escuchas delta en tiempo real de Last.fm si aplica
    const deltaMap = new Map();
    if (currentSource === 'unified' && year === '2026' && half === '2' && lastFmRecentDelta.length > 0) {
        lastFmRecentDelta.forEach(t => {
            const k = `${normalizeKey(t.name)}:::${normalizeKey(t.artist ? (t.artist['#text'] || t.artist.name || '') : '')}`;
            deltaMap.set(k, (deltaMap.get(k) || 0) + 1);
        });
    }

    for (const t of tracksArray) {
        let periodPlays = 0;
        for (const m of months) {
            if (t.months && t.months[m]) {
                periodPlays += t.months[m];
            }
        }

        const trackKey = `${normalizeKey(t.name)}:::${normalizeKey(t.artist || '')}`;
        if (deltaMap.has(trackKey)) {
            periodPlays += deltaMap.get(trackKey);
        }

        if (periodPlays > 0) {
            const firstDate = t.first || '';
            const isPastDiscovered = Boolean(firstDate && firstDate < cycleStart);

            let isTrulyPastYear = false;
            let isSurgeOrPeak = false;
            let priorMax = 0;

            if (isPastDiscovered) {
                priorMax = getCuratorTrackPriorStageMax(t, yNum, half);

                // Criterio de picos de escuchas:
                // Solo se considera pico si alcanzó su récord en su respectiva etapa semestral actual
                if (periodPlays >= priorMax) {
                    isSurgeOrPeak = true;
                } else {
                    isTrulyPastYear = true;
                }
            }

            allCandidates.push({
                name: t.name,
                artist: t.artist,
                album: t.album,
                uri: t.uri,
                plays: periodPlays,
                first: t.first,
                isPastYear: isTrulyPastYear,
                isSurgeOrPeak,
                priorMax
            });
        }
    }

    allCandidates.sort((a, b) => b.plays - a.plays);

    curatorSelectedTracks = [];
    curatorBenchTracks = [];

    if (autoSelect) {
        for (const item of allCandidates) {
            if (excludePast && item.isPastYear) {
                curatorBenchTracks.push(item);
            } else {
                if (curatorSelectedTracks.length < targetCount) {
                    curatorSelectedTracks.push(item);
                } else {
                    curatorBenchTracks.push(item);
                }
            }
        }
    } else {
        curatorBenchTracks = allCandidates;
    }

    renderCuratorView();
}

async function generateCuratorSelection() {
    const year = curatorYear?.value || '';
    const half = curatorHalf?.value || '';
    if (!year || !half) {
        alert('Por favor selecciona primero un año y un periodo (1ra o 2da mitad) en los selectores superiores.');
        return;
    }
    await loadCuratorCandidates(true);
    triggerGoogleDriveAutoSync();
}

function renderCuratorView() {
    if (curatorPeriodBadge) {
        curatorPeriodBadge.innerHTML = `<i class="fa-regular fa-clock me-1"></i> ${curatorCurrentCycleInfo.periodStr}`;
    }

    const targetCount = parseInt(curatorTargetCount?.value, 10) || 18;
    const selectedCount = curatorSelectedTracks.length;

    if (curatorCounterBadge) {
        curatorCounterBadge.textContent = `${selectedCount} / ${targetCount} seleccionadas`;
        if (selectedCount === targetCount) {
            curatorCounterBadge.style.color = '#4ade80';
            curatorCounterBadge.style.background = 'rgba(34, 197, 94, 0.14)';
            curatorCounterBadge.style.borderColor = 'rgba(34, 197, 94, 0.35)';
        } else if (selectedCount < targetCount) {
            curatorCounterBadge.style.color = '#fde047';
            curatorCounterBadge.style.background = 'rgba(234, 179, 8, 0.14)';
            curatorCounterBadge.style.borderColor = 'rgba(234, 179, 8, 0.35)';
        } else {
            curatorCounterBadge.style.color = '#38bdf8';
            curatorCounterBadge.style.background = 'rgba(56, 189, 248, 0.14)';
            curatorCounterBadge.style.borderColor = 'rgba(56, 189, 248, 0.35)';
        }
    }

    if (curatorSelectedNum) curatorSelectedNum.textContent = selectedCount;
    if (curatorBenchNum) curatorBenchNum.textContent = curatorBenchTracks.length;

    renderCuratorSelectedList();
    renderCuratorBenchList();
}

function renderCuratorSelectedList() {
    if (!curatorSelectedList) return;

    if (!curatorCurrentCycleInfo.year || !curatorCurrentCycleInfo.half) {
        curatorSelectedList.innerHTML = `
            <div class="text-center py-5 text-secondary">
                <i class="fa-regular fa-calendar-check fs-2 mb-2 text-primary opacity-50"></i>
                <div class="fw-semibold text-white mb-1">Sin periodo seleccionado</div>
                <div class="small text-muted" style="max-width: 380px; margin: 0 auto; font-size: 0.76rem;">
                    Elige un año y un periodo (1ra o 2da mitad) en los selectores superiores para comenzar.
                </div>
            </div>
        `;
        return;
    }

    if (curatorSelectedTracks.length === 0) {
        curatorSelectedList.innerHTML = `
            <div class="text-center py-4 text-secondary">
                <i class="fa-solid fa-compact-disc fs-3 mb-2 opacity-50 text-brand"></i>
                <div class="fw-semibold text-white mb-1">Tu lista está vacía</div>
                <div class="small text-muted mb-3" style="max-width: 440px; margin: 0 auto; font-size: 0.76rem;">
                    La playlist empieza limpia para que la armes a tu gusto. Puedes ir añadiendo temas desde la pestaña <b>"Banca / Descarte"</b> o presionar <b>"Generar Selección"</b> para que el curador la autocomplete con los temas más escuchados de este ciclo.
                </div>
                <button type="button" class="btn btn-sm btn-brand rounded-pill px-3 py-1 fw-semibold" onclick="generateCuratorSelection()" style="font-size: 0.76rem;">
                    <i class="fa-solid fa-rotate me-1"></i> Generar Selección Automática
                </button>
            </div>
        `;
        return;
    }

    let html = '';
    curatorSelectedTracks.forEach((t, i) => {
        const artKey = `track::${normalizeKey(t.name)}::${normalizeKey(t.artist || '')}`;
        const coverImg = artCache[artKey] || FALLBACK_ART_SVG;
        const imgId = `curator-art-sel-${i}`;

        html += `
            <div class="curator-track-item">
                <span class="fw-bold text-secondary text-end" style="width: 22px; font-size: 0.76rem;">#${i + 1}</span>
                <img id="${imgId}" src="${coverImg}" class="rounded flex-shrink-0" style="width: 38px; height: 38px; object-fit: cover;" onerror="safeImgError(this)" alt="Cover">
                <div class="overflow-hidden flex-grow-1" style="min-width: 0;">
                    <div class="fw-bold text-white text-truncate" style="font-size: 0.82rem;">${t.name}</div>
                    <div class="d-flex align-items-center gap-1.5 flex-wrap">
                        <small class="text-secondary text-truncate" style="font-size: 0.72rem;">${t.artist}</small>
                        ${t.isSurgeOrPeak ? `<span class="curator-badge-peak" title="Pico de escuchas en esta etapa (${t.plays} plays vs récord previo de ${t.priorMax || 0})"><i class="fa-solid fa-arrow-trend-up"></i> Pico en Etapa</span>` : (t.isPastYear ? '<span class="curator-badge-past">Año Pasado</span>' : '')}
                    </div>
                </div>
                <span class="curator-badge-plays">
                    ${t.plays} ${t.plays === 1 ? 'play' : 'plays'}
                </span>
                <div class="d-flex align-items-center gap-0.5 flex-shrink-0">
                    <button type="button" class="curator-action-btn" onclick="moveCuratorTrack(${i}, -1)" ${i === 0 ? 'disabled' : ''} title="Subir">
                        <i class="fa-solid fa-chevron-up" style="font-size: 0.74rem;"></i>
                    </button>
                    <button type="button" class="curator-action-btn" onclick="moveCuratorTrack(${i}, 1)" ${i === curatorSelectedTracks.length - 1 ? 'disabled' : ''} title="Bajar">
                        <i class="fa-solid fa-chevron-down" style="font-size: 0.74rem;"></i>
                    </button>
                    <button type="button" class="curator-action-btn text-danger ms-1" onclick="removeCuratorTrack(${i})" title="Quitar de la lista">
                        <i class="fa-solid fa-xmark" style="font-size: 0.82rem;"></i>
                    </button>
                </div>
            </div>
        `;

        if (!artCache[artKey]) {
            resolveSpotifyArtwork(t.name, t.artist, 'track', imgId);
        }
    });

    curatorSelectedList.innerHTML = html;
}

function renderCuratorBenchList() {
    if (!curatorBenchList) return;

    if (!curatorCurrentCycleInfo.year || !curatorCurrentCycleInfo.half) {
        curatorBenchList.innerHTML = `
            <div class="text-center py-5 text-secondary">
                <i class="fa-solid fa-layer-group fs-2 mb-2 text-secondary opacity-40"></i>
                <div class="fw-semibold text-white mb-1">Banca en espera</div>
                <div class="small text-muted" style="max-width: 360px; margin: 0 auto; font-size: 0.76rem;">
                    Selecciona un año y un periodo en los selectores superiores para cargar las canciones disponibles de la banca.
                </div>
            </div>
        `;
        return;
    }

    const query = (curatorBenchSearch?.value || '').trim().toLowerCase();
    let filtered = curatorBenchTracks;

    if (query) {
        const benchMatches = curatorBenchTracks.filter(t =>
            (t.name || '').toLowerCase().includes(query) ||
            (t.artist || '').toLowerCase().includes(query) ||
            (t.album || '').toLowerCase().includes(query)
        );

        const existingKeys = new Set(curatorSelectedTracks.map(t => `${normalizeKey(t.name)}:::${normalizeKey(t.artist)}`));
        benchMatches.forEach(t => existingKeys.add(`${normalizeKey(t.name)}:::${normalizeKey(t.artist)}`));

        const catalogMatches = [];
        const activeDb = currentSource === 'unified' ? unifiedDb : spotifyDb;
        if (activeDb && activeDb.tracksLookup) {
            for (const t of Object.values(activeDb.tracksLookup)) {
                const k = `${normalizeKey(t.name)}:::${normalizeKey(t.artist)}`;
                if (existingKeys.has(k)) continue;
                if ((t.name || '').toLowerCase().includes(query) ||
                    (t.artist || '').toLowerCase().includes(query) ||
                    (t.album || '').toLowerCase().includes(query)) {
                    catalogMatches.push({
                        name: t.name,
                        artist: t.artist,
                        album: t.album,
                        uri: t.uri,
                        plays: t.plays || 0,
                        first: t.first,
                        isPastYear: true,
                        isSurgeOrPeak: false,
                        fromFullCatalog: true
                    });
                }
            }
            catalogMatches.sort((a, b) => b.plays - a.plays);
        }

        filtered = [...benchMatches, ...catalogMatches];
    }

    if (filtered.length === 0) {
        curatorBenchList.innerHTML = `
            <div class="text-center py-4 text-secondary">
                <i class="fa-solid fa-magnifying-glass fs-5 mb-1 opacity-50"></i>
                <div>No se encontraron más canciones en la banca o catálogo.</div>
            </div>
        `;
        return;
    }

    let html = '';
    filtered.slice(0, 100).forEach((t, i) => {
        const artKey = `track::${normalizeKey(t.name)}::${normalizeKey(t.artist || '')}`;
        const coverImg = artCache[artKey] || FALLBACK_ART_SVG;
        const imgId = `curator-art-bench-${i}`;

        html += `
            <div class="curator-track-item">
                <img id="${imgId}" src="${coverImg}" class="rounded flex-shrink-0" style="width: 36px; height: 36px; object-fit: cover;" onerror="safeImgError(this)" alt="Cover">
                <div class="overflow-hidden flex-grow-1" style="min-width: 0;">
                    <div class="fw-bold text-white text-truncate" style="font-size: 0.80rem;">${t.name}</div>
                    <div class="d-flex align-items-center gap-1.5 flex-wrap">
                        <small class="text-secondary text-truncate" style="font-size: 0.70rem;">${t.artist}</small>
                        ${t.fromFullCatalog ? '<span class="curator-badge-past" title="Canción de tu catálogo completo">Catálogo Total</span>' : (t.isSurgeOrPeak ? `<span class="curator-badge-peak" title="Pico de escuchas en esta etapa (${t.plays} plays vs récord previo de ${t.priorMax || 0})"><i class="fa-solid fa-arrow-trend-up"></i> Pico en Etapa</span>` : (t.isPastYear ? `<span class="curator-badge-past" title="Pico previo: ${t.priorMax || 0} plays en etapa anterior">Año Pasado</span>` : ''))}
                    </div>
                </div>
                <span class="curator-badge-plays">
                    ${t.plays} ${t.plays === 1 ? 'play' : 'plays'}
                </span>
                <button type="button" class="btn btn-sm btn-outline-brand rounded-pill px-2.5 py-0.5 fw-semibold flex-shrink-0" style="font-size: 0.72rem;" onclick="addCuratorTrackFromBench('${encodeURIComponent(t.name)}', '${encodeURIComponent(t.artist)}')">
                    <i class="fa-solid fa-plus me-1"></i> Añadir
                </button>
            </div>
        `;

        if (!artCache[artKey]) {
            resolveSpotifyArtwork(t.name, t.artist, 'track', imgId);
        }
    });

    curatorBenchList.innerHTML = html;
}

window.moveCuratorTrack = function(index, direction) {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= curatorSelectedTracks.length) return;
    const tmp = curatorSelectedTracks[index];
    curatorSelectedTracks[index] = curatorSelectedTracks[targetIdx];
    curatorSelectedTracks[targetIdx] = tmp;
    renderCuratorSelectedList();
    triggerGoogleDriveAutoSync();
};

window.removeCuratorTrack = function(index) {
    if (index < 0 || index >= curatorSelectedTracks.length) return;
    const [removed] = curatorSelectedTracks.splice(index, 1);
    if (removed) {
        curatorBenchTracks.unshift(removed);
        curatorBenchTracks.sort((a, b) => b.plays - a.plays);
    }
    renderCuratorView();
    triggerGoogleDriveAutoSync();
};

window.addCuratorTrackFromBench = function(encName, encArtist) {
    const name = decodeURIComponent(encName);
    const artist = decodeURIComponent(encArtist);
    const idx = curatorBenchTracks.findIndex(t => t.name === name && t.artist === artist);
    if (idx !== -1) {
        const [item] = curatorBenchTracks.splice(idx, 1);
        curatorSelectedTracks.push(item);
        renderCuratorView();
        triggerGoogleDriveAutoSync();
    } else {
        const activeDb = currentSource === 'unified' ? unifiedDb : spotifyDb;
        if (activeDb && activeDb.tracksLookup) {
            const key = `${normalizeKey(name)}:::${normalizeKey(artist)}`;
            const t = activeDb.tracksLookup[key];
            if (t) {
                curatorSelectedTracks.push({
                    name: t.name,
                    artist: t.artist,
                    album: t.album,
                    uri: t.uri,
                    plays: t.plays || 0,
                    first: t.first,
                    isPastYear: true,
                    isSurgeOrPeak: false
                });
                renderCuratorView();
                triggerGoogleDriveAutoSync();
            }
        }
    }
};

async function copyCuratorPlaylistText() {
    if (curatorSelectedTracks.length === 0) {
        alert('No hay canciones en la selección actual para copiar.');
        return;
    }

    const { year, half, periodStr } = curatorCurrentCycleInfo;
    const halfName = half === '1' ? '1ra Mitad (Ene-May)' : '2da Mitad (Jun-Nov)';

    let text = `🎵 Mi Playlist ${year} - ${halfName}\n📅 Periodo: ${periodStr}\n\n`;
    curatorSelectedTracks.forEach((t, i) => {
        text += `${i + 1}. ${t.artist} - ${t.name}\n`;
    });
    text += `\nGenerado con SpotiTracker`;

    try {
        await navigator.clipboard.writeText(text);
        alert(`¡Lista copiada al portapapeles!\n\n${curatorSelectedTracks.length} canciones listas para pegar.`);
    } catch (err) {
        prompt('Copia tu lista manualmente:', text);
    }
}

async function createCuratorSpotifyPlaylist() {
    if (!accessToken) {
        if (confirm('Para guardar la playlist directamente en tu cuenta de Spotify necesitas iniciar sesión con Spotify.\n\n¿Deseas iniciar sesión ahora?')) {
            redirectToSpotifyLogin();
        }
        return;
    }

    if (curatorSelectedTracks.length === 0) {
        alert('No hay canciones seleccionadas en la playlist.');
        return;
    }

    const { year, half, periodStr } = curatorCurrentCycleInfo;
    const halfName = half === '1' ? '1ra Mitad' : '2da Mitad';

    try {
        const payload = {
            name: `Top ${year} - ${halfName} (SpotiTracker)`,
            description: `Playlist semestral curada (${periodStr}) con ${curatorSelectedTracks.length} temas. Generada en SpotiTracker.`,
            public: false
        };

        const createRes = await createSpotifyPlaylistWithDetails(payload);

        if (!createRes || !createRes.id) {
            throw new Error('Spotify no devolvió un identificador de playlist.');
        }

        const urisToAdd = [];
        const activeDb = await getActiveDatabase();

        for (const t of curatorSelectedTracks) {
            let trackUri = t.uri;

            // 1. Si no tiene URI o no empieza con spotify:track:, buscar en los catálogos cargados
            if (!trackUri || !trackUri.startsWith('spotify:track:')) {
                const k = `${normalizeKey(t.name)}:::${normalizeKey(t.artist || '')}`;
                if (activeDb?.tracksLookup?.[k]?.uri) {
                    trackUri = activeDb.tracksLookup[k].uri;
                } else if (spotifyDb?.tracksLookup?.[k]?.uri) {
                    trackUri = spotifyDb.tracksLookup[k].uri;
                } else if (unifiedDb?.tracksLookup?.[k]?.uri) {
                    trackUri = unifiedDb.tracksLookup[k].uri;
                }
            }

            // 2. Si sigue sin URI, buscar en la API de Spotify
            if (!trackUri || !trackUri.startsWith('spotify:track:')) {
                try {
                    const cleanTitle = (t.name || '')
                        .replace(/\(feat\..*?\)/gi, '')
                        .replace(/\[feat\..*?\]/gi, '')
                        .replace(/\(with.*?\)/gi, '')
                        .replace(/- .*?remaster.*?/gi, '')
                        .trim();
                    const tArtist = (t.artist || '').trim();

                    let sRes = await spotifyFetch(`search?type=track&limit=1&q=${encodeURIComponent(`${cleanTitle} ${tArtist}`)}`);
                    let foundUri = sRes?.tracks?.items?.[0]?.uri;
                    if (!foundUri) {
                        sRes = await spotifyFetch(`search?type=track&limit=1&q=${encodeURIComponent(`track:${cleanTitle} artist:${tArtist}`)}`);
                        foundUri = sRes?.tracks?.items?.[0]?.uri;
                    }
                    if (!foundUri) {
                        sRes = await spotifyFetch(`search?type=track&limit=1&q=${encodeURIComponent(`${t.name} ${tArtist}`)}`);
                        foundUri = sRes?.tracks?.items?.[0]?.uri;
                    }
                    if (foundUri) trackUri = foundUri;
                } catch (e) {
                    console.warn('Error resolviendo URI en Spotify:', t.name, e);
                }
            }

            if (trackUri && trackUri.startsWith('spotify:track:')) {
                urisToAdd.push(trackUri);
            }
        }

        let tracksAddedCount = 0;
        if (urisToAdd.length > 0) {
            for (let i = 0; i < urisToAdd.length; i += 100) {
                const chunk = urisToAdd.slice(i, i + 100);
                let addRes = await spotifyFetch(`playlists/${createRes.id}/tracks`, {
                    method: 'POST',
                    body: JSON.stringify({ uris: chunk })
                });

                if (!addRes) {
                    const queryUris = encodeURIComponent(chunk.join(','));
                    addRes = await spotifyFetch(`playlists/${createRes.id}/tracks?uris=${queryUris}`, {
                        method: 'POST'
                    });
                }

                if (addRes) tracksAddedCount += chunk.length;
            }
        }

        if (tracksAddedCount > 0) {
            alert(`¡Playlist "${payload.name}" creada con éxito en tu Spotify con ${tracksAddedCount} canciones!`);
        } else {
            alert(`Playlist "${payload.name}" creada en Spotify, pero hubo un problema al sincronizar las canciones.\n\nTip: Si tus permisos de Spotify son antiguos, cierra sesión y vuelve a iniciar sesión en Spotify para otorgar permisos de playlist.`);
        }

        if (createRes.external_urls?.spotify) {
            window.open(createRes.external_urls.spotify, '_blank');
        }
    } catch (err) {
        console.error(err);
        alert(err?.message || 'Ocurrió un error al crear la playlist en Spotify.');
    }
}

function clearCuratorSelection() {
    if (curatorSelectedTracks.length === 0) return;
    for (const t of curatorSelectedTracks) {
        curatorBenchTracks.push(t);
    }
    curatorBenchTracks.sort((a, b) => b.plays - a.plays);
    curatorSelectedTracks = [];
    renderCuratorView();
    triggerGoogleDriveAutoSync();
}

async function exportCuratorYouTubeMusic() {
    if (curatorSelectedTracks.length === 0) {
        alert('No hay canciones en la selección actual para exportar a YouTube Music.');
        return;
    }

    const cleanList = curatorSelectedTracks.map(t => `${t.artist} - ${t.name}`).join('\n');
    try {
        await navigator.clipboard.writeText(cleanList);
    } catch (e) {
        // Fallback
    }

    const firstTrackQuery = encodeURIComponent(`${curatorSelectedTracks[0].name} ${curatorSelectedTracks[0].artist}`);
    const ytMusicUrl = `https://music.youtube.com/search?q=${firstTrackQuery}`;

    const msg = `🎵 Lista de ${curatorSelectedTracks.length} canciones copiada al portapapeles en formato "Artista - Canción".\n\nIdeal para importar en TuneMyMusic, Soundiiz o buscar en YouTube Music.\n\n¿Deseas abrir YouTube Music en una nueva pestaña?`;
    if (confirm(msg)) {
        window.open(ytMusicUrl, '_blank');
    }
}

window.clearCuratorSelection = clearCuratorSelection;
window.exportCuratorYouTubeMusic = exportCuratorYouTubeMusic;

// ====================================================
// PERSISTENCIA EN LA NUBE: SUPABASE (Central-de-estudio)
// ====================================================
const SUPABASE_PROJECT_URL = 'https://znbihwazambtwjwizmsn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_C7JjbD4TMFzBGysYO835GQ_s1rRzvm-';
const SUPABASE_REST_URL = `${SUPABASE_PROJECT_URL}/rest/v1/spotitracker_curator`;
const CLOUD_AUTOSYNC_KEY = 'spotitracker_cloud_autosync';
const CLOUD_LAST_SYNC_KEY = 'spotitracker_cloud_last_sync';

let cloudAutoSync = localStorage.getItem(CLOUD_AUTOSYNC_KEY) !== 'false';
let cloudDebounceTimer = null;
let isCloudSyncing = false;

function updateCloudUI(status = 'active', customMsg = '') {
    const lastSync = localStorage.getItem(CLOUD_LAST_SYNC_KEY);

    if (gdriveAutosyncToggle) {
        gdriveAutosyncToggle.checked = cloudAutoSync;
    }

    if (drawerGdriveStatus) {
        drawerGdriveStatus.textContent = status === 'syncing' ? 'Sincronizando...' : 'Supabase Activo';
        drawerGdriveStatus.style.background = 'rgba(16, 185, 129, 0.15)';
        drawerGdriveStatus.style.color = '#10b981';
    }

    if (curatorCloudLabel) {
        curatorCloudLabel.textContent = customMsg || (status === 'syncing' ? 'Guardando...' : 'Nube Activa');
    }

    if (gdriveStatusTitle) {
        gdriveStatusTitle.textContent = status === 'syncing' ? 'Sincronizando con Supabase...' : 'Conectado a Central-de-estudio';
    }

    if (gdriveStatusDesc) {
        gdriveStatusDesc.textContent = customMsg || (lastSync
            ? `Último respaldo: ${new Date(lastSync).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`
            : 'Base de datos PostgreSQL lista para respaldar tus selecciones.');
    }

    if (gdriveSyncBadge) {
        gdriveSyncBadge.textContent = status === 'syncing' ? 'GUARDANDO...' : 'EN LÍNEA';
        gdriveSyncBadge.style.color = status === 'syncing' ? '#38bdf8' : '#10b981';
        gdriveSyncBadge.style.background = status === 'syncing' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(16, 185, 129, 0.15)';
        gdriveSyncBadge.style.borderColor = status === 'syncing' ? 'rgba(56, 189, 248, 0.3)' : 'rgba(16, 185, 129, 0.3)';
    }

    if (btnGdriveUpload) btnGdriveUpload.disabled = isCloudSyncing;
    if (btnGdriveDownload) btnGdriveDownload.disabled = isCloudSyncing;
}

function showCloudAlert(message, type = 'info') {
    if (!gdriveAlert) return;
    gdriveAlert.className = `alert alert-${type} py-1.5 px-2.5 small mt-3 mb-0`;
    gdriveAlert.innerHTML = message;
    gdriveAlert.classList.remove('d-none');
    setTimeout(() => {
        gdriveAlert.classList.add('d-none');
    }, 4500);
}

function openGoogleDriveModal() {
    updateCloudUI('active');
    const modal = bootstrap.Modal.getOrCreateInstance(gdriveModalEl);
    modal.show();
}

async function saveToCloudDatabase(isSilent = false) {
    if (isCloudSyncing) return false;
    try {
        isCloudSyncing = true;
        updateCloudUI('syncing', 'Guardando...');

        const payload = {
            id: 'default',
            user_id: 'Vrak_23',
            cycle_year: curatorCurrentCycleInfo.year || (curatorYear?.value || ''),
            cycle_half: curatorCurrentCycleInfo.half || (curatorHalf?.value || ''),
            target_count: parseInt(curatorTargetCount?.value || '18', 10),
            selected_tracks: curatorSelectedTracks || [],
            honorable_mentions: window.curatorHonorableTracks || [],
            year_favorites: window.curatorYearFavorites || [],
            settings: {
                excludePast: curatorExcludePast ? curatorExcludePast.checked : true
            },
            updated_at: new Date().toISOString()
        };

        const res = await fetch(SUPABASE_REST_URL, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const nowIso = new Date().toISOString();
            localStorage.setItem(CLOUD_LAST_SYNC_KEY, nowIso);
            updateCloudUI('active', 'Nube Sincronizada');
            if (!isSilent) {
                showCloudAlert(`¡Guardado exitoso en Supabase! (${payload.selected_tracks.length} canciones sincronizadas)`, 'success');
                alert(`¡Éxito! Tu selección curada (${payload.selected_tracks.length} canciones) ha sido respaldada en tu base de datos Supabase (Central-de-estudio).`);
            }
            return true;
        } else {
            const errTxt = await res.text();
            console.error('Error guardando en Supabase:', errTxt);
            if (!isSilent) {
                showCloudAlert('Error al guardar en Supabase. Revisa la consola.', 'danger');
            }
        }
    } catch (err) {
        console.error('Error saveToCloudDatabase:', err);
        if (!isSilent) {
            showCloudAlert('Error de red al conectar con Supabase.', 'danger');
        }
    } finally {
        isCloudSyncing = false;
        setTimeout(() => updateCloudUI('active'), 2000);
    }
    return false;
}

async function loadFromCloudDatabase() {
    if (isCloudSyncing) return false;
    try {
        isCloudSyncing = true;
        updateCloudUI('syncing', 'Cargando...');

        const res = await fetch(`${SUPABASE_REST_URL}?id=eq.default&select=*`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });

        if (res.ok) {
            const data = await res.json();
            const row = Array.isArray(data) ? data[0] : data;
            if (row && Array.isArray(row.selected_tracks) && row.selected_tracks.length > 0) {
                curatorSelectedTracks = row.selected_tracks;
                if (row.cycle_year && curatorYear) curatorYear.value = row.cycle_year;
                if (row.cycle_half && curatorHalf) curatorHalf.value = row.cycle_half;
                if (row.target_count && curatorTargetCount) curatorTargetCount.value = row.target_count;
                if (row.settings && row.settings.excludePast !== undefined && curatorExcludePast) {
                    curatorExcludePast.checked = row.settings.excludePast;
                }

                curatorCurrentCycleInfo.year = row.cycle_year || '';
                curatorCurrentCycleInfo.half = row.cycle_half || '';
                curatorCurrentCycleInfo.periodStr = row.cycle_year && row.cycle_half
                    ? (row.cycle_half === '1' ? `1 Ene — 20 May ${row.cycle_year}` : `1 Jun — 20 Nov ${row.cycle_year}`)
                    : 'Sin periodo seleccionado';

                if (row.cycle_year && row.cycle_half) {
                    await loadCuratorCandidates(false);
                } else {
                    renderCuratorView();
                }

                const nowIso = new Date().toISOString();
                localStorage.setItem(CLOUD_LAST_SYNC_KEY, nowIso);
                updateCloudUI('active', 'Nube Sincronizada');
                showCloudAlert(`¡Restauradas ${curatorSelectedTracks.length} canciones desde Supabase!`, 'success');
                alert(`¡Éxito! Se restauraron ${curatorSelectedTracks.length} canciones desde tu base de datos Supabase (Ciclo: ${row.cycle_year || 'N/A'} - ${row.cycle_half === '1' ? '1ra Mitad' : (row.cycle_half === '2' ? '2da Mitad' : 'N/A')}).`);
                return true;
            } else {
                showCloudAlert('No hay canciones guardadas aún en la base de datos.', 'warning');
                alert('No se encontró ninguna selección previa guardada en la base de datos.');
            }
        } else {
            showCloudAlert('Error al consultar datos en Supabase.', 'danger');
        }
    } catch (err) {
        console.error('Error loadFromCloudDatabase:', err);
        showCloudAlert('Error de red al consultar Supabase.', 'danger');
    } finally {
        isCloudSyncing = false;
        setTimeout(() => updateCloudUI('active'), 1500);
    }
    return false;
}

function triggerGoogleDriveAutoSync() {
    if (!cloudAutoSync) return;
    clearTimeout(cloudDebounceTimer);
    cloudDebounceTimer = setTimeout(() => {
        saveToCloudDatabase(true);
    }, 1500);
}

// ----------------------------------------------------
// 6. CÁPSULA DEL TIEMPO ("ESTE MES EN LA HISTORIA")
// ----------------------------------------------------
let currentCapsuleYear = null;

async function openCapsuleModal() {
    const modalEl = document.getElementById('capsuleModal');
    if (!modalEl) return;

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();

    const db = await getActiveDatabase();
    if (!db || !db.yearlyTops) return;

    initCapsuleView(db);
}

function initCapsuleView(db) {
    const nav = document.getElementById('capsule-years-nav');
    const content = document.getElementById('capsule-content-area');
    if (!nav || !content) return;

    const now = new Date();
    const curMonthNum = now.getMonth() + 1;
    const curMonthKey = String(curMonthNum);
    const monthName = MONTH_NAMES[curMonthNum - 1] || 'este mes';

    // Años disponibles con datos para este mes
    const availableYears = ['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019'].filter(y => {
        return db.yearlyTops[y]?.months?.[curMonthKey];
    });

    if (availableYears.length === 0) {
        content.innerHTML = `<div class="text-center py-4 text-secondary">No se encontraron registros de ${monthName} en años anteriores.</div>`;
        return;
    }

    if (!currentCapsuleYear || !availableYears.includes(currentCapsuleYear)) {
        currentCapsuleYear = availableYears.find(y => y !== '2026') || availableYears[0];
    }

    nav.innerHTML = availableYears.map(y => {
        const isActive = y === currentCapsuleYear;
        const diff = 2026 - parseInt(y, 10);
        const subLabel = diff === 0 ? 'En vivo' : (diff === 1 ? 'Hace 1 año' : `Hace ${diff} años`);
        return `
            <button type="button" class="btn btn-sm ${isActive ? 'btn-brand fw-bold' : 'btn-outline-secondary text-secondary'} rounded-pill px-3 py-1 flex-shrink-0" onclick="selectCapsuleYear('${y}')" style="font-size: 0.76rem;">
                ${y} <span class="opacity-75" style="font-size: 0.65rem;">(${subLabel})</span>
            </button>
        `;
    }).join('');

    renderCapsuleContent(db, currentCapsuleYear, curMonthKey, monthName);
}

async function selectCapsuleYear(year) {
    currentCapsuleYear = year;
    const db = await getActiveDatabase();
    if (db) initCapsuleView(db);
}

function renderCapsuleContent(db, year, monthKey, monthName) {
    const content = document.getElementById('capsule-content-area');
    if (!content) return;

    const monthData = db.yearlyTops[year]?.months?.[monthKey];
    if (!monthData) {
        content.innerHTML = `<div class="text-center py-4 text-secondary">Sin datos para ${monthName} ${year}.</div>`;
        return;
    }

    const topTracks = (monthData.tracks || []).slice(0, 10);
    const topArtist = (monthData.artists || [])[0];
    const plays = monthData.plays || topTracks.reduce((acc, t) => acc + (t.plays || 0), 0);

    const artKey = topArtist ? `artist::${normalizeKey(topArtist.name)}::` : '';
    const topArtistCover = artCache[artKey] || '/logo.png';

    content.innerHTML = `
        <div class="p-3 rounded-3 mb-3 border border-info border-opacity-20" style="background: rgba(6, 182, 212, 0.08);">
            <div class="d-flex align-items-center justify-content-between mb-2">
                <span class="fw-bold text-white fs-6"><i class="fa-solid fa-calendar-check text-info me-1.5"></i> ${monthName} de ${year}</span>
                <span class="badge bg-info bg-opacity-20 text-info border border-info border-opacity-30">${formatNumber(plays)} reproducciones</span>
            </div>
            ${topArtist ? `
                <div class="d-flex align-items-center gap-2.5 pt-1">
                    <img id="capsule-top-art-img" src="${topArtistCover}" class="rounded-circle border border-info border-opacity-40" style="width: 44px; height: 44px; object-fit: cover;" onerror="safeAvatarError(this)">
                    <div class="overflow-hidden">
                        <small class="text-secondary d-block" style="font-size: 0.68rem;">Artista más escuchado de esa época:</small>
                        <strong class="text-white text-truncate d-block" style="font-size: 0.88rem;">${topArtist.name}</strong>
                    </div>
                </div>
            ` : ''}
        </div>

        <div class="d-flex align-items-center justify-content-between mb-2">
            <span class="fw-bold text-white" style="font-size: 0.78rem;"><i class="fa-solid fa-list-ol text-primary me-1"></i> Canciones que no parabas de escuchar</span>
            <small class="text-secondary" style="font-size: 0.7rem;">Top 10 de esa época</small>
        </div>

        <div class="d-flex flex-column gap-1.5" style="max-height: 280px; overflow-y: auto;">
            ${topTracks.map((t, idx) => {
                const safeName = (t.name || '').replace(/'/g, "\\'");
                const safeArtist = (t.artist || '').replace(/'/g, "\\'");
                const tArtKey = `track::${normalizeKey(t.name)}::${normalizeKey(t.artist || '')}`;
                const cover = artCache[tArtKey] || '/logo.png';
                const imgId = `capsule-trk-img-${idx}`;
                return `
                    <div class="card-uniform p-1.5 px-2.5 cursor-pointer" onclick="showItemStats('track', '${safeName}', '${safeArtist}')" style="min-height: 42px;">
                        <span class="card-rank text-muted" style="width: 22px;">#${idx + 1}</span>
                        <img id="${imgId}" src="${cover}" class="rounded flex-shrink-0" style="width: 34px; height: 34px; object-fit: cover;" onerror="safeImgError(this)">
                        <div class="overflow-hidden flex-grow-1">
                            <div class="fw-bold text-white text-truncate" style="font-size: 0.78rem;">${t.name}</div>
                            <small class="text-secondary text-truncate d-block" style="font-size: 0.68rem;">${t.artist}</small>
                        </div>
                        <span class="badge bg-secondary bg-opacity-25 text-white flex-shrink-0" style="font-size: 0.68rem;">${t.plays} reps</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    if (topArtist && !artCache[artKey]) {
        resolveSpotifyArtwork(topArtist.name, '', 'artist', 'capsule-top-art-img');
    }
    topTracks.forEach((t, idx) => {
        const tArtKey = `track::${normalizeKey(t.name)}::${normalizeKey(t.artist || '')}`;
        if (!artCache[tArtKey]) {
            resolveSpotifyArtwork(t.name, t.artist || '', 'track', `capsule-trk-img-${idx}`);
        }
    });
}

// ----------------------------------------------------
// 7. TRIVIA MUSICAL PERSONAL (QUIZ INTERACTIVO)
// ----------------------------------------------------
let triviaCurrentQuestions = [];
let triviaCurrentIndex = 0;
let triviaScore = 0;

async function openTriviaModal() {
    const modalEl = document.getElementById('triviaModal');
    if (!modalEl) return;

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();

    const db = await getActiveDatabase();
    if (!db) return;

    startTriviaGame(db);
}

function startTriviaGame(db) {
    triviaCurrentQuestions = generateTriviaQuestions(db);
    triviaCurrentIndex = 0;
    triviaScore = 0;
    renderTriviaQuestion();
}

function generateTriviaQuestions(db) {
    const questions = [];
    const allArtists = Object.values(db.artistsLookup || {}).filter(a => a.plays >= 30);
    const allTracks = Object.values(db.tracksLookup || {}).filter(t => t.plays >= 20);

    const years = ['2021', '2022', '2023', '2024'].filter(y => db.yearlyTops?.[y]?.tracks?.length > 3);
    if (years.length > 0) {
        const randY = years[Math.floor(Math.random() * years.length)];
        const correctTrack = db.yearlyTops[randY].tracks[0];
        const decoys = db.yearlyTops[randY].tracks.slice(1, 6).sort(() => 0.5 - Math.random()).slice(0, 3);
        const options = [correctTrack, ...decoys].sort(() => 0.5 - Math.random());
        questions.push({
            title: `¿Cuál fue tu canción #1 en todo el año ${randY}?`,
            correctIndex: options.indexOf(correctTrack),
            options: options.map(t => `${t.name} - ${t.artist}`),
            explanation: `Tu tema más escuchado en ${randY} fue "${correctTrack.name}" con ${correctTrack.plays} reproducciones.`
        });
    }

    if (allArtists.length >= 4) {
        const sampleArtists = [...allArtists].sort(() => 0.5 - Math.random()).slice(0, 4);
        sampleArtists.sort((a, b) => b.plays - a.plays);
        const correct = sampleArtists[0];
        const shuffled = [...sampleArtists].sort(() => 0.5 - Math.random());
        questions.push({
            title: `¿Cuál de estos artistas tiene MÁS reproducciones en tu historia?`,
            correctIndex: shuffled.indexOf(correct),
            options: shuffled.map(a => `${a.name}`),
            explanation: `¡${correct.name} lidera con ${formatNumber(correct.plays)} escuchas en tu biblioteca!`
        });
    }

    const discoverArtists = allArtists.filter(a => a.first && a.plays >= 50);
    if (discoverArtists.length > 0) {
        const art = discoverArtists[Math.floor(Math.random() * discoverArtists.length)];
        const correctYear = new Date(art.first).getFullYear().toString();
        const possibleYears = ['2019', '2020', '2021', '2022', '2023', '2024', '2025'].filter(y => y !== correctYear);
        const decoyYears = possibleYears.sort(() => 0.5 - Math.random()).slice(0, 3);
        const options = [correctYear, ...decoyYears].sort(() => 0.5 - Math.random());
        questions.push({
            title: `¿En qué año empezaste a escuchar a "${art.name}"?`,
            correctIndex: options.indexOf(correctYear),
            options: options,
            explanation: `Tu primer registro de ${art.name} fue en ${new Date(art.first).toLocaleDateString([], { month: 'long', year: 'numeric' })}.`
        });
    }

    const albumYears = ['2022', '2023', '2024'].filter(y => db.yearlyTops?.[y]?.albums?.length > 3);
    if (albumYears.length > 0) {
        const y = albumYears[Math.floor(Math.random() * albumYears.length)];
        const topAlb = db.yearlyTops[y].albums[0];
        const decoys = db.yearlyTops[y].albums.slice(1, 5).sort(() => 0.5 - Math.random()).slice(0, 3);
        const options = [topAlb, ...decoys].sort(() => 0.5 - Math.random());
        questions.push({
            title: `¿Cuál fue tu álbum estrella en ${y}?`,
            correctIndex: options.indexOf(topAlb),
            options: options.map(a => `${a.name} (${a.artist})`),
            explanation: `En ${y}, "${topAlb.name}" de ${topAlb.artist} fue tu álbum #1 con ${topAlb.plays} reproducciones.`
        });
    }

    if (allTracks.length >= 8) {
        const highPlays = [...allTracks].sort((a, b) => b.plays - a.plays).slice(5, 25).sort(() => 0.5 - Math.random())[0];
        const decoys = [...allTracks].filter(t => t.name !== highPlays.name).sort(() => 0.5 - Math.random()).slice(0, 3);
        const options = [highPlays, ...decoys].sort(() => 0.5 - Math.random());
        questions.push({
            title: `¿Cuál de estas canciones has reproducido más de ${Math.floor(highPlays.plays * 0.8)} veces?`,
            correctIndex: options.indexOf(highPlays),
            options: options.map(t => `${t.name} - ${t.artist}`),
            explanation: `"${highPlays.name}" acumula ${highPlays.plays} reproducciones en tu cuenta.`
        });
    }

    return questions.slice(0, 5);
}

function renderTriviaQuestion() {
    const body = document.getElementById('trivia-modal-body');
    if (!body) return;

    if (triviaCurrentIndex >= triviaCurrentQuestions.length) {
        renderTriviaResults();
        return;
    }

    const q = triviaCurrentQuestions[triviaCurrentIndex];
    const qNum = triviaCurrentIndex + 1;
    const totalQ = triviaCurrentQuestions.length;

    body.innerHTML = `
        <div class="d-flex align-items-center justify-content-between mb-3 text-secondary" style="font-size: 0.74rem;">
            <span><strong class="text-white">Pregunta ${qNum}</strong> de ${totalQ}</span>
            <span class="badge border border-primary border-opacity-30 text-white" style="background: rgba(168, 85, 247, 0.15);">Aciertos: ${triviaScore}</span>
        </div>

        <div class="progress mb-3" style="height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px;">
            <div class="progress-bar bg-primary" style="width: ${(qNum / totalQ) * 100}%;"></div>
        </div>

        <h5 class="fw-bold text-white mb-3" style="font-size: 1.05rem; line-height: 1.4;">${q.title}</h5>

        <div class="d-flex flex-column gap-2 mb-3">
            ${q.options.map((opt, idx) => `
                <button type="button" class="btn btn-outline-secondary text-start text-white p-2.5 rounded-3 d-flex align-items-center justify-content-between trivia-opt-btn" onclick="handleTriviaAnswer(${idx})" style="background: rgba(255, 255, 255, 0.03); border-color: rgba(255, 255, 255, 0.1); font-size: 0.82rem; transition: all 0.15s ease;">
                    <span class="text-truncate">${opt}</span>
                    <i class="fa-regular fa-circle text-secondary fs-6 flex-shrink-0 ms-2"></i>
                </button>
            `).join('')}
        </div>

        <div id="trivia-feedback-box" class="d-none p-2.5 rounded-3 border mb-3" style="font-size: 0.76rem;"></div>
        <div id="trivia-next-container" class="d-none text-end">
            <button type="button" class="btn btn-sm btn-brand rounded-pill px-4 py-1.5 fw-semibold" onclick="advanceTriviaQuestion()" style="font-size: 0.8rem;">
                ${qNum === totalQ ? 'Ver Resultados' : 'Siguiente Pregunta <i class="fa-solid fa-arrow-right ms-1"></i>'}
            </button>
        </div>
    `;
}

function handleTriviaAnswer(selectedIndex) {
    const q = triviaCurrentQuestions[triviaCurrentIndex];
    const buttons = document.querySelectorAll('.trivia-opt-btn');
    buttons.forEach(b => b.disabled = true);

    const isCorrect = selectedIndex === q.correctIndex;
    if (isCorrect) triviaScore++;

    const feedback = document.getElementById('trivia-feedback-box');
    const nextBtn = document.getElementById('trivia-next-container');

    buttons.forEach((b, idx) => {
        if (idx === q.correctIndex) {
            b.style.background = 'rgba(34, 197, 94, 0.2)';
            b.style.borderColor = '#22c55e';
            b.querySelector('i').className = 'fa-solid fa-circle-check text-success fs-6';
        } else if (idx === selectedIndex && !isCorrect) {
            b.style.background = 'rgba(239, 68, 68, 0.2)';
            b.style.borderColor = '#ef4444';
            b.querySelector('i').className = 'fa-solid fa-circle-xmark text-danger fs-6';
        }
    });

    if (feedback) {
        feedback.classList.remove('d-none');
        if (isCorrect) {
            feedback.style.background = 'rgba(34, 197, 94, 0.08)';
            feedback.style.borderColor = 'rgba(34, 197, 94, 0.3)';
            feedback.innerHTML = `<strong class="text-success"><i class="fa-solid fa-check me-1"></i> ¡Correcto!</strong> <span class="text-secondary">${q.explanation}</span>`;
        } else {
            feedback.style.background = 'rgba(239, 68, 68, 0.08)';
            feedback.style.borderColor = 'rgba(239, 68, 68, 0.3)';
            feedback.innerHTML = `<strong class="text-danger"><i class="fa-solid fa-xmark me-1"></i> Casi...</strong> <span class="text-secondary">${q.explanation}</span>`;
        }
    }

    if (nextBtn) nextBtn.classList.remove('d-none');
}

function advanceTriviaQuestion() {
    triviaCurrentIndex++;
    renderTriviaQuestion();
}

function renderTriviaResults() {
    const body = document.getElementById('trivia-modal-body');
    if (!body) return;

    let title = '';
    let icon = '';
    const total = triviaCurrentQuestions.length;

    if (triviaScore === total) {
        title = '👑 Dios de tu Propio Universo Musical';
        icon = 'fa-trophy text-warning';
    } else if (triviaScore >= 3) {
        title = '🔥 Melómano Experto';
        icon = 'fa-fire text-primary';
    } else {
        title = '🎧 Oyente Casual en Evolución';
        icon = 'fa-headphones text-info';
    }

    body.innerHTML = `
        <div class="text-center py-3">
            <div class="mb-3 d-inline-flex align-items-center justify-content-center" style="width: 76px; height: 76px; border-radius: 50%; background: linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(234, 179, 8, 0.25)); border: 2px solid rgba(234, 179, 8, 0.5);">
                <i class="fa-solid ${icon} fs-1"></i>
            </div>
            <h4 class="fw-bold text-white mb-1">${title}</h4>
            <div class="text-secondary small mb-3">
                Acertaste <strong class="text-white">${triviaScore}</strong> de <strong class="text-white">${total}</strong> preguntas sobre tu propio historial.
            </div>

            <div class="p-3 rounded-3 mb-4 border border-secondary border-opacity-15 text-start" style="background: rgba(255, 255, 255, 0.02); font-size: 0.78rem;">
                <div class="text-white fw-semibold mb-1"><i class="fa-solid fa-sparkles text-warning me-1"></i> Resumen de la Partida</div>
                <div class="text-secondary">Tu memoria sonora refleja ${Math.round((triviaScore / total) * 100)}% de precisión con tus hábitos históricos registrados entre 2019 y 2026.</div>
            </div>

            <div class="d-flex align-items-center justify-content-center gap-2">
                <button type="button" class="btn btn-sm btn-brand rounded-pill px-4 py-1.5 fw-semibold" onclick="openTriviaModal()" style="font-size: 0.8rem;">
                    <i class="fa-solid fa-rotate me-1"></i> Jugar Otra Partida
                </button>
                <button type="button" class="btn btn-sm btn-outline-secondary rounded-pill px-3 py-1.5 text-white" data-bs-dismiss="modal" style="font-size: 0.8rem;">
                    Cerrar
                </button>
            </div>
        </div>
    `;

    if (triviaScore >= 3 && typeof confetti === 'function') {
        confetti({ particleCount: 70, spread: 70, origin: { y: 0.6 } });
    }
}

// ----------------------------------------------------
// 8. TORNEO DE CANCIONES (BRACKET POR ELIMINACIÓN DIRECTA)
// ----------------------------------------------------
let tournamentMatches = [];
let tournamentRoundName = 'Octavos de Final';
let tournamentCurrentMatchIdx = 0;
let tournamentNextRoundTracks = [];

async function openTournamentModal() {
    const modalEl = document.getElementById('tournamentModal');
    if (!modalEl) return;

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();

    const db = await getActiveDatabase();
    if (!db) return;

    renderTournamentLobby(db);
}

function renderTournamentLobby(db) {
    const body = document.getElementById('tournament-modal-body');
    if (!body) return;

    body.innerHTML = `
        <div class="text-center py-2 mb-3">
            <h5 class="fw-bold text-white mb-1"><i class="fa-solid fa-trophy text-danger me-1.5"></i> Elige el Campo de Batalla</h5>
            <p class="text-secondary small mb-0">Selecciona con qué canciones se formará la llave de 16 participantes:</p>
        </div>

        <div class="d-flex flex-column gap-2 mb-3">
            <button type="button" class="btn btn-outline-secondary text-start text-white p-3 rounded-3 d-flex align-items-center justify-content-between" onclick="initTournamentTracks('overall')" style="background: rgba(244, 63, 94, 0.08); border-color: rgba(244, 63, 94, 0.25);">
                <div>
                    <strong class="text-white d-block" style="font-size: 0.85rem;"><i class="fa-solid fa-crown text-warning me-1.5"></i> Torneo de tu Top 16 Histórico</strong>
                    <small class="text-secondary" style="font-size: 0.72rem;">Los 16 temas más reproducidos de toda tu vida (2019 - 2026).</small>
                </div>
                <i class="fa-solid fa-chevron-right text-secondary fs-6"></i>
            </button>

            <button type="button" class="btn btn-outline-secondary text-start text-white p-3 rounded-3 d-flex align-items-center justify-content-between" onclick="initTournamentTracks('2024')" style="background: rgba(255, 255, 255, 0.03); border-color: rgba(255, 255, 255, 0.08);">
                <div>
                    <strong class="text-white d-block" style="font-size: 0.85rem;"><i class="fa-solid fa-calendar-star text-info me-1.5"></i> Torneo de tu 2024</strong>
                    <small class="text-secondary" style="font-size: 0.72rem;">Las 16 canciones más destacadas de tu año 2024.</small>
                </div>
                <i class="fa-solid fa-chevron-right text-secondary fs-6"></i>
            </button>

            <button type="button" class="btn btn-outline-secondary text-start text-white p-3 rounded-3 d-flex align-items-center justify-content-between" onclick="initTournamentTracks('2023')" style="background: rgba(255, 255, 255, 0.03); border-color: rgba(255, 255, 255, 0.08);">
                <div>
                    <strong class="text-white d-block" style="font-size: 0.85rem;"><i class="fa-solid fa-clock-rotate-left text-primary me-1.5"></i> Torneo de tu 2023</strong>
                    <small class="text-secondary" style="font-size: 0.72rem;">Las 16 canciones más sonadas de tu año 2023.</small>
                </div>
                <i class="fa-solid fa-chevron-right text-secondary fs-6"></i>
            </button>
        </div>
    `;
}

async function initTournamentTracks(type) {
    const db = await getActiveDatabase();
    if (!db) return;

    let rawTracks = [];
    if (type === 'overall') {
        rawTracks = db.yearlyTops?.overall?.tracks || Object.values(db.tracksLookup || {});
    } else {
        rawTracks = db.yearlyTops?.[type]?.tracks || [];
    }

    const participants = rawTracks.slice(0, 16);
    if (participants.length < 4) {
        alert('No hay suficientes canciones en este periodo para armar un torneo.');
        return;
    }

    tournamentMatches = [];
    for (let i = 0; i < participants.length; i += 2) {
        if (i + 1 < participants.length) {
            tournamentMatches.push([participants[i], participants[i + 1]]);
        }
    }

    tournamentRoundName = participants.length === 16 ? 'Octavos de Final' : 'Semifinales';
    tournamentCurrentMatchIdx = 0;
    tournamentNextRoundTracks = [];

    renderTournamentMatch();
}

function renderTournamentMatch() {
    const body = document.getElementById('tournament-modal-body');
    if (!body) return;

    if (tournamentCurrentMatchIdx >= tournamentMatches.length) {
        if (tournamentNextRoundTracks.length === 1) {
            renderTournamentWinner(tournamentNextRoundTracks[0]);
            return;
        }

        tournamentMatches = [];
        for (let i = 0; i < tournamentNextRoundTracks.length; i += 2) {
            if (i + 1 < tournamentNextRoundTracks.length) {
                tournamentMatches.push([tournamentNextRoundTracks[i], tournamentNextRoundTracks[i + 1]]);
            }
        }
        if (tournamentMatches.length === 4) tournamentRoundName = 'Cuartos de Final';
        else if (tournamentMatches.length === 2) tournamentRoundName = 'Semifinales';
        else if (tournamentMatches.length === 1) tournamentRoundName = 'Gran Final';

        tournamentCurrentMatchIdx = 0;
        tournamentNextRoundTracks = [];
    }

    const [trackA, trackB] = tournamentMatches[tournamentCurrentMatchIdx];
    const matchNum = tournamentCurrentMatchIdx + 1;
    const totalMatches = tournamentMatches.length;

    const coverAKey = `track::${normalizeKey(trackA.name)}::${normalizeKey(trackA.artist || '')}`;
    const coverBKey = `track::${normalizeKey(trackB.name)}::${normalizeKey(trackB.artist || '')}`;
    const coverA = artCache[coverAKey] || '/logo.png';
    const coverB = artCache[coverBKey] || '/logo.png';

    body.innerHTML = `
        <div class="d-flex align-items-center justify-content-between mb-3 text-secondary" style="font-size: 0.74rem;">
            <span class="badge border border-danger border-opacity-30 text-white" style="background: rgba(244, 63, 94, 0.2);">${tournamentRoundName}</span>
            <span>Duelo <strong class="text-white">${matchNum}</strong> de ${totalMatches}</span>
        </div>

        <div class="row g-2 align-items-center mb-3">
            <div class="col-6">
                <div class="p-3 rounded-3 text-center border border-secondary border-opacity-15 h-100 d-flex flex-column justify-content-between" style="background: rgba(255, 255, 255, 0.03);">
                    <div>
                        <img id="tourn-cover-a" src="${coverA}" class="rounded-3 shadow mb-2" style="width: 80px; height: 80px; object-fit: cover;" onerror="safeImgError(this)">
                        <h6 class="fw-bold text-white mb-0 text-truncate" title="${trackA.name}" style="font-size: 0.85rem;">${trackA.name}</h6>
                        <small class="text-secondary text-truncate d-block mb-1" style="font-size: 0.72rem;">${trackA.artist}</small>
                        <span class="badge bg-secondary bg-opacity-25 text-white mb-2" style="font-size: 0.65rem;">${trackA.plays} reps</span>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-danger w-100 rounded-pill py-1.5 fw-semibold" onclick="voteTournament(0)" style="font-size: 0.78rem;">
                        <i class="fa-solid fa-heart me-1"></i> Elegir
                    </button>
                </div>
            </div>

            <div class="col-6">
                <div class="p-3 rounded-3 text-center border border-secondary border-opacity-15 h-100 d-flex flex-column justify-content-between" style="background: rgba(255, 255, 255, 0.03);">
                    <div>
                        <img id="tourn-cover-b" src="${coverB}" class="rounded-3 shadow mb-2" style="width: 80px; height: 80px; object-fit: cover;" onerror="safeImgError(this)">
                        <h6 class="fw-bold text-white mb-0 text-truncate" title="${trackB.name}" style="font-size: 0.85rem;">${trackB.name}</h6>
                        <small class="text-secondary text-truncate d-block mb-1" style="font-size: 0.72rem;">${trackB.artist}</small>
                        <span class="badge bg-secondary bg-opacity-25 text-white mb-2" style="font-size: 0.65rem;">${trackB.plays} reps</span>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-danger w-100 rounded-pill py-1.5 fw-semibold" onclick="voteTournament(1)" style="font-size: 0.78rem;">
                        <i class="fa-solid fa-heart me-1"></i> Elegir
                    </button>
                </div>
            </div>
        </div>
    `;

    if (!artCache[coverAKey]) resolveSpotifyArtwork(trackA.name, trackA.artist || '', 'track', 'tourn-cover-a');
    if (!artCache[coverBKey]) resolveSpotifyArtwork(trackB.name, trackB.artist || '', 'track', 'tourn-cover-b');
}

function voteTournament(choiceIdx) {
    const currentPair = tournamentMatches[tournamentCurrentMatchIdx];
    const winner = currentPair[choiceIdx];
    tournamentNextRoundTracks.push(winner);
    tournamentCurrentMatchIdx++;
    renderTournamentMatch();
}

function renderTournamentWinner(track) {
    const body = document.getElementById('tournament-modal-body');
    if (!body) return;

    const coverKey = `track::${normalizeKey(track.name)}::${normalizeKey(track.artist || '')}`;
    const cover = artCache[coverKey] || '/logo.png';

    body.innerHTML = `
        <div class="text-center py-3">
            <div class="badge rounded-pill px-3 py-1 mb-2 text-uppercase fw-bold text-warning" style="background: rgba(234, 179, 8, 0.15); border: 1px solid rgba(234, 179, 8, 0.3); font-size: 0.72rem;">
                👑 Gran Campeona del Torneo
            </div>

            <div class="my-3">
                <img id="tourn-champ-img" src="${cover}" class="rounded-3 shadow-lg border border-2 border-warning" style="width: 110px; height: 110px; object-fit: cover;" onerror="safeImgError(this)">
            </div>

            <h4 class="fw-bold text-white mb-0">${track.name}</h4>
            <div class="text-secondary small mb-3">${track.artist}</div>

            <p class="text-secondary mx-auto mb-4" style="max-width: 360px; font-size: 0.78rem;">
                ¡Esta canción superó todas las rondas de eliminación directa y se corona como tu favorita indiscutible de este torneo!
            </p>

            <div class="d-flex align-items-center justify-content-center gap-2">
                <button type="button" class="btn btn-sm btn-brand rounded-pill px-4 py-1.5 fw-semibold" onclick="openTournamentModal()" style="font-size: 0.8rem;">
                    <i class="fa-solid fa-rotate me-1"></i> Nuevo Torneo
                </button>
                <button type="button" class="btn btn-sm btn-outline-secondary rounded-pill px-3 py-1.5 text-white" data-bs-dismiss="modal" style="font-size: 0.8rem;">
                    Cerrar
                </button>
            </div>
        </div>
    `;

    if (!artCache[coverKey]) resolveSpotifyArtwork(track.name, track.artist || '', 'track', 'tourn-champ-img');
    if (typeof confetti === 'function') {
        confetti({ particleCount: 90, spread: 80, origin: { y: 0.6 } });
    }
}

// ----------------------------------------------------
// 9. ICEBERG MUSICAL PERSONALIZADO
// ----------------------------------------------------
async function openIcebergModal() {
    const modalEl = document.getElementById('icebergModal');
    if (!modalEl) return;

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();

    const db = await getActiveDatabase();
    if (!db || !db.artistsLookup) return;

    renderIcebergView(db);
}

function renderIcebergView(db) {
    const body = document.getElementById('iceberg-modal-body');
    if (!body) return;

    const all = Object.values(db.artistsLookup).sort((a, b) => b.plays - a.plays);

    const layer1 = all.filter(a => a.plays >= 400).slice(0, 12);
    const layer2 = all.filter(a => a.plays >= 150 && a.plays < 400).slice(0, 15);
    const layer3 = all.filter(a => a.plays >= 50 && a.plays < 150).slice(0, 18);
    const layer4 = all.filter(a => a.plays >= 15 && a.plays < 50).slice(0, 20);
    const layer5 = all.filter(a => a.plays < 15).slice(0, 20);

    const renderLayerBadges = (list) => {
        if (list.length === 0) return '<span class="text-muted small">Sin artistas en este estrato</span>';
        return list.map(a => `
            <span class="badge border border-white border-opacity-10 text-white rounded-pill px-2 py-1 cursor-pointer" onclick="showItemStats('artist', '${a.name.replace(/'/g, "\\'")}', '')" style="background: rgba(255,255,255,0.06); font-size: 0.7rem; transition: background 0.15s ease;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.18)'" onmouseout="this.style.backgroundColor='rgba(255,255,255,0.06)'">
                ${a.name} <strong class="text-warning opacity-75">${formatNumber(a.plays)}</strong>
            </span>
        `).join(' ');
    };

    body.innerHTML = `
        <div class="text-secondary small mb-3">
            Tus artistas clasificados en 5 estratos de profundidad marina. Haz clic en cualquiera para ver sus estadísticas:
        </div>

        <div class="d-flex flex-column gap-2">
            <!-- Nivel 1: Cielo / Punta del Iceberg -->
            <div class="p-3 rounded-3 border border-warning border-opacity-30" style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(59, 130, 246, 0.15));">
                <div class="d-flex align-items-center justify-content-between mb-2">
                    <span class="fw-bold text-warning" style="font-size: 0.78rem;"><i class="fa-solid fa-sun me-1.5"></i> Nivel 1: Cielo / Élite Visible (+400 streams)</span>
                    <small class="text-secondary">${layer1.length} artistas</small>
                </div>
                <div class="d-flex flex-wrap gap-1.5">${renderLayerBadges(layer1)}</div>
            </div>

            <!-- Nivel 2: Superficie del Mar -->
            <div class="p-3 rounded-3 border border-info border-opacity-30" style="background: linear-gradient(135deg, rgba(6, 182, 212, 0.12), rgba(14, 116, 144, 0.2));">
                <div class="d-flex align-items-center justify-content-between mb-2">
                    <span class="fw-bold text-info" style="font-size: 0.78rem;"><i class="fa-solid fa-water me-1.5"></i> Nivel 2: Superficie (150 - 399 streams)</span>
                    <small class="text-secondary">${layer2.length} artistas</small>
                </div>
                <div class="d-flex flex-wrap gap-1.5">${renderLayerBadges(layer2)}</div>
            </div>

            <!-- Nivel 3: Aguas Medias -->
            <div class="p-3 rounded-3 border border-primary border-opacity-30" style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(30, 58, 138, 0.25));">
                <div class="d-flex align-items-center justify-content-between mb-2">
                    <span class="fw-bold text-primary" style="font-size: 0.78rem;"><i class="fa-solid fa-fish me-1.5"></i> Nivel 3: Aguas Medias (50 - 149 streams)</span>
                    <small class="text-secondary">${layer3.length} artistas</small>
                </div>
                <div class="d-flex flex-wrap gap-1.5">${renderLayerBadges(layer3)}</div>
            </div>

            <!-- Nivel 4: Profundidades -->
            <div class="p-3 rounded-3 border border-secondary border-opacity-25" style="background: linear-gradient(135deg, rgba(30, 27, 75, 0.4), rgba(15, 23, 42, 0.6));">
                <div class="d-flex align-items-center justify-content-between mb-2">
                    <span class="fw-bold text-secondary text-white-50" style="font-size: 0.78rem;"><i class="fa-solid fa-anchor me-1.5"></i> Nivel 4: Profundidades (15 - 49 streams)</span>
                    <small class="text-secondary">${layer4.length} artistas</small>
                </div>
                <div class="d-flex flex-wrap gap-1.5">${renderLayerBadges(layer4)}</div>
            </div>

            <!-- Nivel 5: Abismo Submarino -->
            <div class="p-3 rounded-3 border border-dark border-opacity-50" style="background: #030408;">
                <div class="d-flex align-items-center justify-content-between mb-2">
                    <span class="fw-bold text-secondary" style="font-size: 0.78rem;"><i class="fa-solid fa-gem text-info me-1.5"></i> Nivel 5: Fosas Abisales / Rarezas (&lt;15 streams)</span>
                    <small class="text-secondary">${layer5.length} artistas</small>
                </div>
                <div class="d-flex flex-wrap gap-1.5">${renderLayerBadges(layer5)}</div>
            </div>
        </div>
    `;
}

// ----------------------------------------------------
// 10. CARRERA DE ERAS (BAR CHART RACE ANIMADO)
// ----------------------------------------------------
let erasRaceTimer = null;
let erasRaceFrames = [];
let erasRaceCurrentFrame = 0;
let erasRaceIsPlaying = false;
let erasRaceSpeed = 1000;

async function openErasModal() {
    const modalEl = document.getElementById('erasModal');
    if (!modalEl) return;

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();

    const db = await getActiveDatabase();
    if (!db || !db.yearlyTops) return;

    prepareErasRaceFrames(db);
    renderErasRaceUI();
}

function prepareErasRaceFrames(db) {
    erasRaceFrames = [];
    const years = ['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026'];
    const cumulativeArtistMap = {};

    years.forEach(y => {
        const yData = db.yearlyTops[y];
        if (!yData) return;

        (yData.artists || []).forEach(a => {
            cumulativeArtistMap[a.name] = (cumulativeArtistMap[a.name] || 0) + a.plays;
        });

        const top8 = Object.entries(cumulativeArtistMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([name, plays], idx) => ({ rank: idx + 1, name, plays }));

        erasRaceFrames.push({
            label: `Año ${y}`,
            year: y,
            top: top8
        });
    });

    erasRaceCurrentFrame = 0;
    erasRaceIsPlaying = false;
    clearInterval(erasRaceTimer);
}

function renderErasRaceUI() {
    const body = document.getElementById('eras-modal-body');
    if (!body || erasRaceFrames.length === 0) return;

    body.innerHTML = `
        <div class="d-flex align-items-center justify-content-between p-2.5 mb-3 rounded-3 border border-secondary border-opacity-15" style="background: rgba(255,255,255,0.02);">
            <div class="d-flex align-items-center gap-2">
                <button type="button" id="btn-eras-play" class="btn btn-sm btn-brand rounded-pill px-3 py-1 fw-semibold" onclick="toggleErasRacePlay()">
                    <i class="fa-solid fa-play me-1"></i> Reproducir
                </button>
                <button type="button" class="btn btn-sm btn-outline-secondary rounded-pill px-2.5 py-1 text-white" onclick="resetErasRace()" title="Reiniciar">
                    <i class="fa-solid fa-rotate-left"></i>
                </button>
            </div>
            <div class="d-flex align-items-center gap-2">
                <span id="eras-frame-label" class="fw-bold text-white fs-6">Año 2019</span>
            </div>
        </div>

        <input type="range" class="form-range mb-3" id="eras-scrubber" min="0" max="${erasRaceFrames.length - 1}" value="0" oninput="scrubErasRace(this.value)">

        <div id="eras-bars-container" class="d-flex flex-column gap-2" style="min-height: 320px;">
        </div>
    `;

    renderErasBars();
}

function renderErasBars() {
    const container = document.getElementById('eras-bars-container');
    const label = document.getElementById('eras-frame-label');
    const scrubber = document.getElementById('eras-scrubber');
    if (!container || erasRaceFrames.length === 0) return;

    const frame = erasRaceFrames[erasRaceCurrentFrame];
    if (!frame) return;

    if (label) label.textContent = frame.label;
    if (scrubber) scrubber.value = erasRaceCurrentFrame;

    const maxPlays = Math.max(1, frame.top[0]?.plays || 1);

    container.innerHTML = frame.top.map(item => {
        const pct = Math.max(8, Math.round((item.plays / maxPlays) * 100));
        return `
            <div class="d-flex align-items-center gap-2" style="font-size: 0.78rem;">
                <span class="text-secondary fw-bold" style="width: 24px;">#${item.rank}</span>
                <span class="text-white text-truncate fw-semibold" style="width: 120px;" title="${item.name}">${item.name}</span>
                <div class="progress flex-grow-1" style="height: 18px; background: rgba(255,255,255,0.04); border-radius: 6px;">
                    <div class="progress-bar d-flex align-items-center justify-content-end pe-2 text-dark fw-bold" style="width: ${pct}%; background: linear-gradient(90deg, #a855f7, #ec4899); border-radius: 6px; font-size: 0.68rem; transition: width 0.4s ease;">
                        ${formatNumber(item.plays)}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function toggleErasRacePlay() {
    const playBtn = document.getElementById('btn-eras-play');
    if (erasRaceIsPlaying) {
        clearInterval(erasRaceTimer);
        erasRaceIsPlaying = false;
        if (playBtn) playBtn.innerHTML = '<i class="fa-solid fa-play me-1"></i> Reproducir';
    } else {
        erasRaceIsPlaying = true;
        if (playBtn) playBtn.innerHTML = '<i class="fa-solid fa-pause me-1"></i> Pausar';
        if (erasRaceCurrentFrame >= erasRaceFrames.length - 1) erasRaceCurrentFrame = 0;
        erasRaceTimer = setInterval(() => {
            if (erasRaceCurrentFrame < erasRaceFrames.length - 1) {
                erasRaceCurrentFrame++;
                renderErasBars();
            } else {
                toggleErasRacePlay();
            }
        }, erasRaceSpeed);
    }
}

function scrubErasRace(val) {
    erasRaceCurrentFrame = parseInt(val, 10);
    renderErasBars();
}

function resetErasRace() {
    clearInterval(erasRaceTimer);
    erasRaceIsPlaying = false;
    erasRaceCurrentFrame = 0;
    const playBtn = document.getElementById('btn-eras-play');
    if (playBtn) playBtn.innerHTML = '<i class="fa-solid fa-play me-1"></i> Reproducir';
    renderErasBars();
}

// Exponer funciones interactivas globalmente
window.selectCapsuleYear = selectCapsuleYear;
window.handleTriviaAnswer = handleTriviaAnswer;
window.advanceTriviaQuestion = advanceTriviaQuestion;
window.initTournamentTracks = initTournamentTracks;
window.voteTournament = voteTournament;
window.toggleErasRacePlay = toggleErasRacePlay;
window.scrubErasRace = scrubErasRace;
window.resetErasRace = resetErasRace;
window.showArtistMilestoneCelebration = showArtistMilestoneCelebration;

// Inicializar estado de Supabase en UI al arrancar
updateCloudUI('active');

window.openGoogleDriveModal = openGoogleDriveModal;
window.saveToCloudDatabase = saveToCloudDatabase;
window.loadFromCloudDatabase = loadFromCloudDatabase;
window.saveToGoogleDrive = saveToCloudDatabase;
window.loadFromGoogleDrive = loadFromCloudDatabase;
window.triggerGoogleDriveAutoSync = triggerGoogleDriveAutoSync;

