const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const zipPath = 'C:\\Users\\Rodrigo Llanos\\Downloads\\my_spotify_data.zip';
const unifiedPath = path.join(__dirname, '..', 'public', 'data', 'unified_history.json');

console.log('Cargando unified_history.json...');
const unifiedData = JSON.parse(fs.readFileSync(unifiedPath, 'utf8'));

console.log('Extrayendo streams del ZIP para hábitos y récords...');
const listOutput = execSync(`tar -tf "${zipPath}"`).toString('utf8');
const audioFiles = listOutput.split('\n')
  .map(l => l.trim())
  .filter(l => l.includes('Streaming_History_Audio') && l.endsWith('.json'))
  .sort();

const hourlyUTC = Array(24).fill(0);
const weekday = Array(7).fill(0); // 0=Domingo, 1=Lunes, ...
const dailyCounts = {};
let maxDailyArtist = { artist: '', date: '', count: 0 };
const dailyArtistCounts = {};

for (const file of audioFiles) {
  const content = execSync(`tar -xOf "${zipPath}" "${file}"`, { maxBuffer: 50 * 1024 * 1024 }).toString('utf8');
  const arr = JSON.parse(content);
  for (const item of arr) {
    const ms = item.ms_played || 0;
    if (ms < 30000 || !item.ts) continue;

    const d = new Date(item.ts);
    // Asumimos hora Perú/Bogotá (UTC-5) para que sea acorde a la zona horaria del usuario
    const localHour = (d.getUTCHours() - 5 + 24) % 24;
    hourlyUTC[localHour]++;

    // Local day of week (ajustado por UTC-5)
    const localDate = new Date(d.getTime() - (5 * 60 * 60 * 1000));
    const dayOfWeek = localDate.getDay();
    weekday[dayOfWeek]++;

    const dateKey = localDate.toISOString().substring(0, 10);
    dailyCounts[dateKey] = (dailyCounts[dateKey] || 0) + 1;

    const artist = item.master_metadata_album_artist_name;
    if (artist) {
      const daKey = `${dateKey}:::${artist}`;
      dailyArtistCounts[daKey] = (dailyArtistCounts[daKey] || 0) + 1;
      if (dailyArtistCounts[daKey] > maxDailyArtist.count) {
        maxDailyArtist = { artist, date: dateKey, count: dailyArtistCounts[daKey] };
      }
    }
  }
}

// 1. Días récord
const sortedDays = Object.entries(dailyCounts).sort((a, b) => b[1] - a[1]);
const topRecordDay = sortedDays[0]; // [date, count]

// 2. Hora pico
const peakHour = hourlyUTC.indexOf(Math.max(...hourlyUTC));

// 3. Día de la semana pico
const weekdayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const peakWeekdayIdx = weekday.indexOf(Math.max(...weekday));

// 4. Artistas olvidados: Artistas con >= 15 escuchas cuyo último stream fue antes de junio 2025
const forgottenArtists = Object.values(unifiedData.artistsLookup || {})
  .filter(a => a.plays >= 15 && a.last && new Date(a.last) < new Date('2025-06-01'))
  .sort((a, b) => b.plays - a.plays)
  .slice(0, 30)
  .map(a => ({
    name: a.name,
    plays: a.plays,
    last: a.last,
    topTrack: a.tracks?.[0]?.name || 'N/A'
  }));

const insights = {
  habits: {
    hourly: hourlyUTC, // 0 to 23 (hora local UTC-5)
    peakHour: peakHour,
    weekday: weekday, // 0=Dom ... 6=Sab
    peakWeekday: weekdayNames[peakWeekdayIdx],
    weekdayNames: weekdayNames
  },
  records: {
    topDay: {
      date: topRecordDay[0],
      count: topRecordDay[1]
    },
    topDaysList: sortedDays.slice(0, 5).map(d => ({ date: d[0], count: d[1] })),
    marathonArtist: maxDailyArtist,
    totalDaysActive: sortedDays.length,
    avgPlaysPerDay: (sortedDays.reduce((acc, d) => acc + d[1], 0) / sortedDays.length).toFixed(1)
  },
  forgottenArtists: forgottenArtists
};

console.log('Récords encontrados:');
console.log('Top Day:', insights.records.topDay);
console.log('Hora pico:', peakHour, 'con', Math.max(...hourlyUTC), 'escuchas');
console.log('Día pico:', weekdayNames[peakWeekdayIdx], 'con', Math.max(...weekday), 'escuchas');
console.log('Artista más maratoneado:', maxDailyArtist);
console.log('Artistas olvidados detectados:', forgottenArtists.length);

// Guardar insights en public/data/insights.json y mergear en unified_history.json
fs.writeFileSync(path.join(__dirname, '..', 'public', 'data', 'insights.json'), JSON.stringify(insights, null, 2));

unifiedData.insights = insights;
fs.writeFileSync(unifiedPath, JSON.stringify(unifiedData));
console.log('¡Insights guardados exitosamente en insights.json y unified_history.json!');
