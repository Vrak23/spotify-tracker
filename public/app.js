const CLIENT_ID = '78c1217f07404df7b95cceb3e7cc6657';
// Asegurar URI limpia sin barra final para coincidencia exacta en Spotify
const REDIRECT_URI = window.location.origin;

let accessToken = null;
let currentRange = 'short_term';
let currentType = 'tracks';

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

    if (code) {
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
