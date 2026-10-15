const CLIENT_ID = '78c1217f07404df7b95cceb3e7cc6657';
// Usar ruta explícita /callback
const REDIRECT_URI = window.location.origin + '/callback';

let accessToken = null;
let currentRange = 'short_term';
let currentType = 'tracks';
let currentLimit = 50;
let rawRecentItems = [];
let currentDateFilter = 'all';

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

    const scope = 'user-read-private user-read-email user-top-read user-read-currently-playing user-read-recently-played';
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
    if (isToday) return `Hoy a las ${time}`;
    if (isYesterday) return `Ayer a las ${time}`;
    return `${date.toLocaleDateString([], { day: '2-digit', month: 'short' })} a las ${time}`;
}

function formatNumber(num) {
    if (!num) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
}

function setupEventListeners() {
    if (btnLogin) {
        btnLogin.addEventListener('click', redirectToSpotifyLogin);
    }

    btnLogout.addEventListener('click', () => {
        localStorage.removeItem('spotify_access_token');
        localStorage.removeItem('code_verifier');
        accessToken = null;
        showLogin();
    });

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
            if (currentType === 'recent') {
                timeRangeContainer?.classList.add('d-none');
                limitContainer?.classList.add('d-none');
                recentDateFilter?.classList.remove('d-none');
            } else {
                timeRangeContainer?.classList.remove('d-none');
                limitContainer?.classList.remove('d-none');
                recentDateFilter?.classList.add('d-none');
            }
            loadStats();
        });
    });

    document.querySelectorAll('input[name="limitCount"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentLimit = parseInt(e.target.value, 10);
            if (currentType !== 'recent') {
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
    loadStats();
}

async function spotifyFetch(endpoint) {
    try {
        const res = await fetch(`https://api.spotify.com/v1/${endpoint}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
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

    userName.textContent = data.display_name || 'Usuario Spotify';
    userFollowers.textContent = `${data.followers ? data.followers.total : 0} seguidores`;
    
    if (data.images && data.images.length > 0) {
        userImg.src = data.images[0].url;
    } else {
        userImg.src = 'https://via.placeholder.com/48?text=U';
    }
}

async function fetchCurrentlyPlaying() {
    const data = await spotifyFetch('me/player/currently-playing');
    
    if (data && data.is_playing && data.item) {
        const track = data.item;
        currentlyPlayingContainer.innerHTML = `
            <div class="card card-item p-3 border-success border-opacity-50">
                <div class="d-flex align-items-center gap-3">
                    <img src="${track.album.images[0]?.url}" class="img-thumb" alt="Cover">
                    <div class="flex-grow-1 overflow-hidden">
                        <small class="text-success fw-bold text-uppercase" style="font-size: 0.75rem;">
                            <i class="fa-solid fa-signal me-1"></i> Escuchando ahora
                        </small>
                        <div class="fw-bold text-truncate">${track.name}</div>
                        <small class="text-secondary text-truncate d-block">${track.artists.map(a => a.name).join(', ')}</small>
                    </div>
                </div>
            </div>
        `;
    } else {
        currentlyPlayingContainer.innerHTML = '';
    }
}

async function loadStats() {
    statsList.innerHTML = '';
    loader.classList.remove('d-none');

    if (currentType === 'recent') {
        const data = await spotifyFetch('me/player/recently-played?limit=50');
        loader.classList.add('d-none');
        if (!data || !data.items || data.items.length === 0) {
            statsList.innerHTML = '<div class="col-12 text-center text-secondary py-4">No se encontraron reproducciones recientes.</div>';
            return;
        }
        rawRecentItems = data.items;
        applyRecentFilter();
        return;
    }

    const endpoint = `me/top/${currentType}?time_range=${currentRange}&limit=${currentLimit}`;
    const data = await spotifyFetch(endpoint);

    loader.classList.add('d-none');
    if (!data || !data.items || data.items.length === 0) {
        statsList.innerHTML = '<div class="col-12 text-center text-secondary py-4">No se encontraron datos para este rango.</div>';
        return;
    }

    if (currentType === 'tracks') {
        renderTracks(data.items);
    } else {
        renderArtists(data.items);
    }
}

function applyRecentFilter() {
    if (!rawRecentItems || rawRecentItems.length === 0) {
        statsList.innerHTML = '<div class="col-12 text-center text-secondary py-4">No hay canciones recientes.</div>';
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
        const col = document.createElement('div');
        col.className = 'col-12 col-md-6';
        const duration = formatDuration(track.duration_ms);
        const popularity = track.popularity !== undefined ? track.popularity : null;
        const spotifyUrl = track.external_urls?.spotify || '#';
        const albumYear = track.album?.release_date ? track.album.release_date.substring(0, 4) : '';

        col.innerHTML = `
            <div class="card card-item p-2 h-100">
                <div class="d-flex align-items-center gap-3">
                    <span class="fw-bold text-secondary ps-2" style="width: 28px;">#${index + 1}</span>
                    <img src="${track.album.images[0]?.url || 'https://via.placeholder.com/54'}" class="img-thumb shadow-sm" alt="Album Art">
                    <div class="overflow-hidden flex-grow-1">
                        <div class="d-flex align-items-center justify-content-between gap-2">
                            <div class="fw-bold text-truncate">${track.name}</div>
                            <span class="badge bg-secondary bg-opacity-25 text-white-50 text-nowrap" style="font-size: 0.75rem;">
                                <i class="fa-regular fa-clock me-1"></i>${duration}
                            </span>
                        </div>
                        <small class="text-secondary text-truncate d-block">${track.artists.map(a => a.name).join(', ')}</small>
                        <div class="d-flex align-items-center justify-content-between mt-1 pt-1 border-top border-secondary border-opacity-10">
                            <small class="text-secondary" style="font-size: 0.75rem;">
                                ${albumYear ? `<span class="me-2 text-muted">${albumYear}</span>` : ''}
                                ${popularity !== null ? `<span title="Popularidad en Spotify (0-100)"><i class="fa-solid fa-fire text-danger me-1"></i>${popularity}%</span>` : ''}
                            </small>
                            <a href="${spotifyUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline-success btn-sm py-0 px-2 text-decoration-none" style="font-size: 0.75rem;" title="Escuchar en Spotify">
                                <i class="fa-brands fa-spotify me-1"></i>Abrir
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `;
        statsList.appendChild(col);
    });
}

function renderArtists(artists) {
    statsList.innerHTML = '';
    artists.forEach((artist, index) => {
        const col = document.createElement('div');
        col.className = 'col-12 col-md-6';
        const followers = artist.followers ? formatNumber(artist.followers.total) : '0';
        const popularity = artist.popularity !== undefined ? artist.popularity : null;
        const genres = artist.genres?.slice(0, 2).join(', ') || 'Artista';
        const spotifyUrl = artist.external_urls?.spotify || '#';

        col.innerHTML = `
            <div class="card card-item p-2 h-100">
                <div class="d-flex align-items-center gap-3">
                    <span class="fw-bold text-secondary ps-2" style="width: 28px;">#${index + 1}</span>
                    <img src="${artist.images[0]?.url || 'https://via.placeholder.com/54'}" class="img-thumb rounded-circle shadow-sm" alt="Artist">
                    <div class="overflow-hidden flex-grow-1">
                        <div class="d-flex align-items-center justify-content-between gap-2">
                            <div class="fw-bold text-truncate">${artist.name}</div>
                            ${popularity !== null ? `<span class="badge bg-danger bg-opacity-25 text-danger border border-danger border-opacity-25 text-nowrap" style="font-size: 0.75rem;" title="Popularidad en Spotify"><i class="fa-solid fa-fire me-1"></i>${popularity}%</span>` : ''}
                        </div>
                        <small class="text-secondary text-capitalize text-truncate d-block">${genres}</small>
                        <div class="d-flex align-items-center justify-content-between mt-1 pt-1 border-top border-secondary border-opacity-10">
                            <small class="text-secondary" style="font-size: 0.75rem;">
                                <i class="fa-solid fa-users me-1"></i>${followers} seguidores
                            </small>
                            <a href="${spotifyUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline-success btn-sm py-0 px-2 text-decoration-none" style="font-size: 0.75rem;" title="Ver en Spotify">
                                <i class="fa-brands fa-spotify me-1"></i>Abrir
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `;
        statsList.appendChild(col);
    });
}

function renderRecent(items) {
    statsList.innerHTML = '';
    if (!items || items.length === 0) {
        statsList.innerHTML = '<div class="col-12 text-center text-secondary py-4">No se encontraron reproducciones para este filtro de fecha.</div>';
        return;
    }

    items.forEach((item, index) => {
        const track = item.track;
        const playedAt = formatDate(item.played_at);
        const duration = formatDuration(track.duration_ms);
        const spotifyUrl = track.external_urls?.spotify || '#';

        const col = document.createElement('div');
        col.className = 'col-12 col-md-6';
        col.innerHTML = `
            <div class="card card-item p-2 h-100">
                <div class="d-flex align-items-center gap-3">
                    <span class="fw-bold text-secondary ps-2" style="width: 28px;">#${index + 1}</span>
                    <img src="${track.album.images[0]?.url || 'https://via.placeholder.com/54'}" class="img-thumb shadow-sm" alt="Cover">
                    <div class="overflow-hidden flex-grow-1">
                        <div class="d-flex align-items-center justify-content-between gap-2">
                            <div class="fw-bold text-truncate">${track.name}</div>
                            <span class="badge bg-secondary bg-opacity-25 text-white-50 text-nowrap" style="font-size: 0.75rem;">
                                <i class="fa-regular fa-clock me-1"></i>${duration}
                            </span>
                        </div>
                        <small class="text-secondary text-truncate d-block">${track.artists.map(a => a.name).join(', ')}</small>
                        <div class="d-flex align-items-center justify-content-between mt-1 pt-1 border-top border-secondary border-opacity-10">
                            <small class="text-success text-opacity-75" style="font-size: 0.75rem;">
                                <i class="fa-regular fa-calendar-check me-1"></i>${playedAt}
                            </small>
                            <a href="${spotifyUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline-success btn-sm py-0 px-2 text-decoration-none" style="font-size: 0.75rem;">
                                <i class="fa-brands fa-spotify me-1"></i>Abrir
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `;
        statsList.appendChild(col);
    });
}
