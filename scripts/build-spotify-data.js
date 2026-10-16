const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const zipPath = 'C:\\Users\\Rodrigo Llanos\\Downloads\\my_spotify_data.zip';
const outDir = path.join(__dirname, '..', 'public', 'data');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

function norm(s) {
  return (s || '').trim().toLowerCase();
}

console.log('Reading files from Spotify ZIP...');
const listOutput = execSync(`tar -tf "${zipPath}"`).toString('utf8');
const audioFiles = listOutput.split('\n')
  .map(l => l.trim())
  .filter(l => l.includes('Streaming_History_Audio') && l.endsWith('.json'))
  .sort();

console.log('Audio files to process:', audioFiles.length);

const allStreams = [];
let totalStreams = 0;
let validStreams = 0;
let totalMs = 0;

for (const file of audioFiles) {
  console.log('Reading:', file);
  const jsonContent = execSync(`tar -xOf "${zipPath}" "${file}"`, { maxBuffer: 50 * 1024 * 1024 }).toString('utf8');
  const arr = JSON.parse(jsonContent);
  totalStreams += arr.length;
  allStreams.push(...arr);
}

console.log(`Loaded ${totalStreams} raw stream entries. Sorting chronologically...`);
allStreams.sort((a, b) => (a.ts > b.ts ? 1 : (a.ts < b.ts ? -1 : 0)));

const tracksLookup = {};
const albumsLookup = {};
const artistsLookup = {};
const yearlyData = {};
const yearsSet = new Set();
let earliestDate = null;
let latestDate = null;

// Collect all stats
for (const item of allStreams) {
  const track = item.master_metadata_track_name;
  const artist = item.master_metadata_album_artist_name;
  const album = item.master_metadata_album_album_name;
  const ms = item.ms_played || 0;
  const ts = item.ts;
  const platform = item.platform || 'Desconocido';
  const uri = item.spotify_track_uri;
  const isSkip = item.skipped === true || (ms < 5000 && item.reason_end === 'fwdbtn');

  if (!track || !artist) continue;

  // Spotify standard stream criteria: >= 30,000 ms (30s)
  const isValid = ms >= 30000;
  if (isValid) validStreams++;
  totalMs += ms;

  if (ts) {
    if (!earliestDate || ts < earliestDate) earliestDate = ts;
    if (!latestDate || ts > latestDate) latestDate = ts;
  }

  const year = ts ? ts.substring(0, 4) : null;
  const monthNum = ts ? parseInt(ts.substring(5, 7), 10) : null;
  const monthKey = ts ? ts.substring(0, 7) : null; // YYYY-MM

  if (year) yearsSet.add(year);

  // 1. Track Lookup
  const tKey = `${norm(track)}:::${norm(artist)}`;
  if (!tracksLookup[tKey]) {
    tracksLookup[tKey] = {
      name: track,
      artist: artist,
      album: album || 'Sencillo / Desconocido',
      uri: uri || '',
      plays: 0,
      ms: 0,
      skips: 0,
      first: ts,
      last: ts,
      years: {},
      months: {},
      platforms: {}
    };
  }
  tracksLookup[tKey].ms += ms;
  if (isSkip) tracksLookup[tKey].skips++;
  if (ts) {
    if (!tracksLookup[tKey].first || ts < tracksLookup[tKey].first) tracksLookup[tKey].first = ts;
    if (!tracksLookup[tKey].last || ts > tracksLookup[tKey].last) tracksLookup[tKey].last = ts;
  }
  if (isValid) {
    tracksLookup[tKey].plays++;
    if (year) tracksLookup[tKey].years[year] = (tracksLookup[tKey].years[year] || 0) + 1;
    if (monthKey) tracksLookup[tKey].months[monthKey] = (tracksLookup[tKey].months[monthKey] || 0) + 1;
    tracksLookup[tKey].platforms[platform] = (tracksLookup[tKey].platforms[platform] || 0) + 1;
  }

  // 2. Album Lookup
  if (album) {
    const aKey = `${norm(album)}:::${norm(artist)}`;
    if (!albumsLookup[aKey]) {
      albumsLookup[aKey] = {
        name: album,
        artist: artist,
        plays: 0,
        ms: 0,
        first: ts,
        last: ts,
        years: {},
        months: {},
        trackPlays: {}
      };
    }
    albumsLookup[aKey].ms += ms;
    if (ts) {
      if (!albumsLookup[aKey].first || ts < albumsLookup[aKey].first) albumsLookup[aKey].first = ts;
      if (!albumsLookup[aKey].last || ts > albumsLookup[aKey].last) albumsLookup[aKey].last = ts;
    }
    if (isValid) {
      albumsLookup[aKey].plays++;
      if (year) albumsLookup[aKey].years[year] = (albumsLookup[aKey].years[year] || 0) + 1;
      if (monthKey) albumsLookup[aKey].months[monthKey] = (albumsLookup[aKey].months[monthKey] || 0) + 1;
      albumsLookup[aKey].trackPlays[track] = (albumsLookup[aKey].trackPlays[track] || 0) + 1;
    }
  }

  // 3. Artist Lookup
  const artKey = norm(artist);
  if (!artistsLookup[artKey]) {
    artistsLookup[artKey] = {
      name: artist,
      plays: 0,
      ms: 0,
      first: ts,
      last: ts,
      years: {},
      tracks: {}
    };
  }
  artistsLookup[artKey].ms += ms;
  if (ts) {
    if (!artistsLookup[artKey].first || ts < artistsLookup[artKey].first) artistsLookup[artKey].first = ts;
    if (!artistsLookup[artKey].last || ts > artistsLookup[artKey].last) artistsLookup[artKey].last = ts;
  }
  if (isValid) {
    artistsLookup[artKey].plays++;
    if (year) artistsLookup[artKey].years[year] = (artistsLookup[artKey].years[year] || 0) + 1;
    artistsLookup[artKey].tracks[track] = (artistsLookup[artKey].tracks[track] || 0) + 1;
  }

  // 4. Yearly and Monthly Aggregations
  if (year && isValid) {
    if (!yearlyData[year]) {
      yearlyData[year] = {
        plays: 0,
        ms: 0,
        tracks: {},
        artists: {},
        albums: {},
        months: {}
      };
    }
    yearlyData[year].plays++;
    yearlyData[year].ms += ms;
    yearlyData[year].tracks[tKey] = (yearlyData[year].tracks[tKey] || 0) + 1;
    yearlyData[year].artists[artKey] = (yearlyData[year].artists[artKey] || 0) + 1;
    if (album) {
      const aKey = `${norm(album)}:::${norm(artist)}`;
      yearlyData[year].albums[aKey] = (yearlyData[year].albums[aKey] || 0) + 1;
    }

    if (monthNum) {
      if (!yearlyData[year].months[monthNum]) {
        yearlyData[year].months[monthNum] = {
          plays: 0,
          ms: 0,
          tracks: {},
          artists: {},
          albums: {}
        };
      }
      yearlyData[year].months[monthNum].plays++;
      yearlyData[year].months[monthNum].ms += ms;
      yearlyData[year].months[monthNum].tracks[tKey] = (yearlyData[year].months[monthNum].tracks[tKey] || 0) + 1;
      yearlyData[year].months[monthNum].artists[artKey] = (yearlyData[year].months[monthNum].artists[artKey] || 0) + 1;
      if (album) {
        const aKey = `${norm(album)}:::${norm(artist)}`;
        yearlyData[year].months[monthNum].albums[aKey] = (yearlyData[year].months[monthNum].albums[aKey] || 0) + 1;
      }
    }
  }
}

// Recent 100 plays (chronologically latest)
const recentPlays = allStreams
  .filter(s => s.master_metadata_track_name && s.master_metadata_album_artist_name && (s.ms_played || 0) >= 15000)
  .slice(-100)
  .reverse()
  .map(s => ({
    name: s.master_metadata_track_name,
    artist: s.master_metadata_album_artist_name,
    album: s.master_metadata_album_album_name,
    ts: s.ts,
    ms: s.ms_played,
    uri: s.spotify_track_uri
  }));

// Helper to build pre-sorted top lists
function getTopTracksList(countMap, limit = 50) {
  return Object.entries(countMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, plays]) => {
      const t = tracksLookup[key];
      return {
        name: t ? t.name : key.split(':::')[0],
        artist: t ? t.artist : key.split(':::')[1],
        album: t ? t.album : '',
        plays: plays,
        ms: t ? t.ms : 0,
        uri: t ? t.uri : ''
      };
    });
}

function getTopArtistsList(countMap, limit = 50) {
  return Object.entries(countMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, plays]) => {
      const a = artistsLookup[key];
      return {
        name: a ? a.name : key,
        plays: plays,
        ms: a ? a.ms : 0
      };
    });
}

function getTopAlbumsList(countMap, limit = 50) {
  return Object.entries(countMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, plays]) => {
      const al = albumsLookup[key];
      return {
        name: al ? al.name : key.split(':::')[0],
        artist: al ? al.artist : key.split(':::')[1],
        plays: plays,
        ms: al ? al.ms : 0
      };
    });
}

// Build pre-compiled Tops for overall, each year, and each month
const yearlyTops = {};

// Overall
const overallTrackCounts = {};
for (const [k, t] of Object.entries(tracksLookup)) overallTrackCounts[k] = t.plays;
const overallArtistCounts = {};
for (const [k, a] of Object.entries(artistsLookup)) overallArtistCounts[k] = a.plays;
const overallAlbumCounts = {};
for (const [k, al] of Object.entries(albumsLookup)) overallAlbumCounts[k] = al.plays;

yearlyTops['overall'] = {
  tracks: getTopTracksList(overallTrackCounts, 100),
  artists: getTopArtistsList(overallArtistCounts, 100),
  albums: getTopAlbumsList(overallAlbumCounts, 100)
};

const sortedYears = Array.from(yearsSet).sort().reverse();

for (const y of sortedYears) {
  const yData = yearlyData[y];
  if (!yData) continue;
  yearlyTops[y] = {
    plays: yData.plays,
    hours: (yData.ms / (1000 * 60 * 60)).toFixed(1),
    tracks: getTopTracksList(yData.tracks, 100),
    artists: getTopArtistsList(yData.artists, 100),
    albums: getTopAlbumsList(yData.albums, 100),
    months: {}
  };

  for (let m = 1; m <= 12; m++) {
    const mData = yData.months[m];
    if (mData && mData.plays > 0) {
      yearlyTops[y].months[m] = {
        plays: mData.plays,
        tracks: getTopTracksList(mData.tracks, 50),
        artists: getTopArtistsList(mData.artists, 50),
        albums: getTopAlbumsList(mData.albums, 50)
      };
    }
  }
}

// Convert albumsLookup.trackPlays to sorted arrays
const cleanAlbumsLookup = {};
for (const [k, al] of Object.entries(albumsLookup)) {
  cleanAlbumsLookup[k] = {
    name: al.name,
    artist: al.artist,
    plays: al.plays,
    ms: al.ms,
    first: al.first,
    last: al.last,
    years: al.years,
    months: al.months,
    tracks: Object.entries(al.trackPlays)
      .sort((a, b) => b[1] - a[1])
      .map(([name, plays]) => ({ name, plays }))
  };
}

const cleanArtistsLookup = {};
for (const [k, ar] of Object.entries(artistsLookup)) {
  cleanArtistsLookup[k] = {
    name: ar.name,
    plays: ar.plays,
    ms: ar.ms,
    first: ar.first,
    last: ar.last,
    years: ar.years,
    tracks: Object.entries(ar.tracks)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name, plays]) => ({ name, plays }))
  };
}

const finalDb = {
  summary: {
    totalStreams,
    validStreams,
    totalHours: (totalMs / (1000 * 60 * 60)).toFixed(1),
    dateRange: { start: earliestDate, end: latestDate },
    years: sortedYears,
    yearsStats: sortedYears.reduce((acc, y) => {
      acc[y] = {
        plays: yearlyData[y]?.plays || 0,
        hours: ((yearlyData[y]?.ms || 0) / (1000 * 60 * 60)).toFixed(1)
      };
      return acc;
    }, {})
  },
  yearlyTops,
  recent: recentPlays,
  tracksLookup,
  albumsLookup: cleanAlbumsLookup,
  artistsLookup: cleanArtistsLookup
};

const outFile = path.join(outDir, 'spotify_history.json');
fs.writeFileSync(outFile, JSON.stringify(finalDb));
const outSizeMB = (fs.statSync(outFile).size / (1024 * 1024)).toFixed(2);

console.log(`Database built successfully!`);
console.log(`Saved to: ${outFile}`);
console.log(`File size: ${outSizeMB} MB`);
console.log(`Years covered: ${sortedYears.join(', ')}`);
console.log(`Tracks indexed: ${Object.keys(tracksLookup).length}`);
console.log(`Albums indexed: ${Object.keys(cleanAlbumsLookup).length}`);
