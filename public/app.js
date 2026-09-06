// Configuración de Client ID de Spotify (Safe to expose on client-side)
const CLIENT_ID = '78c1217f07404df7b95cceb3e7cc6657';
const REDIRECT_URI = window.location.origin + '/';

// Estado global
let accessToken = null;
let currentRange = 'short_term'; // short_term, medium_term, long_term
let currentType = 'tracks';     // tracks, artists

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

// Inicializar app
document.addEventListener('DOMContentLoaded', () => {
    // Extraer token del hash de la URL (Implicit Grant Flow)
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    
    if (params.has('access_token')) {
        accessToken = params.get('access_token');
        localStorage.setItem('spotify_access_token', accessToken);
        window.location.hash = ''; // Limpiar hash de la URL
    } else {
        accessToken = localStorage.getItem('spotify_access_token');
    }

    if (accessToken) {
        showDashboard();
    } else {
        showLogin();
    }

    setupEventListeners();
});

// Generar URL de autorización cliente
function redirectToSpotifyLogin() {
    const scope = 'user-read-private user-read-email user-top-read user-read-currently-playing user-read-recently-played';
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(scope)}&response_type=token&show_dialog=true`;
    window.location.href = authUrl;
}

// Event Listeners
function setupEventListeners() {
    if (btnLogin) {
        btnLogin.addEventListener('click', redirectToSpotifyLogin);
    }

    btnLogout.addEventListener('click', () => {
        localStorage.removeItem('spotify_access_token');
        accessToken = null;
        showLogin();
    });

    // Pestañas de rango de tiempo
    document.querySelectorAll('#time-range-tabs .nav-link').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#time-range-tabs .nav-link').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentRange = e.target.getAttribute('data-range');
            loadStats();
        });
    });

    // Radios Canciones / Artistas
    document.querySelectorAll('input[name="contentType"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentType = e.target.value;
            loadStats();
        });
    });
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

// Peticiones a API de Spotify
async function spotifyFetch(endpoint) {
    try {
        const res = await fetch(`https://api.spotify.com/v1/${endpoint}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (res.status === 401) {
            // Token expirado
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

// Cargar perfil del usuario
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

// Cargar canción reproduciéndose en tiempo real
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

// Cargar estadísticas principales
async function loadStats() {
    statsList.innerHTML = '';
    loader.classList.remove('d-none');

    const endpoint = `me/top/${currentType}?time_range=${currentRange}&limit=20`;
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

// Renderizar Top Canciones
function renderTracks(tracks) {
    tracks.forEach((track, index) => {
        const col = document.createElement('div');
        col.className = 'col-12 col-md-6';
        col.innerHTML = `
            <div class="card card-item p-2 h-100">
                <div class="d-flex align-items-center gap-3">
                    <span class="fw-bold text-secondary ps-2" style="width: 25px;">#${index + 1}</span>
                    <img src="${track.album.images[0]?.url || 'https://via.placeholder.com/54'}" class="img-thumb" alt="Album Art">
                    <div class="overflow-hidden">
                        <div class="fw-bold text-truncate">${track.name}</div>
                        <small class="text-secondary text-truncate d-block">${track.artists.map(a => a.name).join(', ')}</small>
                    </div>
                </div>
            </div>
        `;
        statsList.appendChild(col);
    });
}

// Renderizar Top Artistas
function renderArtists(artists) {
    artists.forEach((artist, index) => {
        const col = document.createElement('div');
        col.className = 'col-12 col-md-6';
        col.innerHTML = `
            <div class="card card-item p-2 h-100">
                <div class="d-flex align-items-center gap-3">
                    <span class="fw-bold text-secondary ps-2" style="width: 25px;">#${index + 1}</span>
                    <img src="${artist.images[0]?.url || 'https://via.placeholder.com/54'}" class="img-thumb rounded-circle" alt="Artist">
                    <div class="overflow-hidden">
                        <div class="fw-bold text-truncate">${artist.name}</div>
                        <small class="text-secondary text-capitalize d-block">${artist.genres.slice(0, 2).join(', ') || 'Artista'}</small>
                    </div>
                </div>
            </div>
        `;
        statsList.appendChild(col);
    });
}
