# SpotiTracker 🎧

Plataforma analítica e interactiva para visualizar, profundizar y descubrir estadísticas reales de tu biblioteca musical, unificando el historial completo de Spotify (2019 - 2026) con registros en tiempo real de Last.fm y persistencia en la nube PostgreSQL (Supabase).

---

## 🚀 Características Principales

### 1. Panel de Control y Catálogo Unificado
- **Métricas Globales**: Streams totales, horas acumuladas de reproducción, conteo de artistas únicos y álbumes.
- **Top Rankings**: Filtros por canciones, artistas, álbumes y reproducciones recientes con paginación configurable (Top 25, 50, 100, 200 o catálogo completo).
- **Selector de Periodos Rápido y Avanzado**:
  - **⚡ Rápido**: *Este mes*, *Últimas 4 semanas*, *Este año* o *Histórico Total*.
  - **⚙️ Avanzado**: Eras musicales (*Era Spotify 2019-2025*, *Nueva Era Last.fm*), desglose por año/mes y rangos de fechas personalizados.
- **Búsqueda en Tiempo Real**: Filtrado reactivo e instantáneo sobre cualquier vista activa.

### 2. Comparador de Periodos
- Análisis comparativo entre periodos (ej. este mes vs. mes anterior, o año contra año).
- Cálculo automático de variación porcentual en **streams** y **horas escuchadas**.
- Mapeo de movimientos en el ranking: artistas que subieron de posición, nuevos ingresos y descensos.

### 3. Curador de Playlists Semestrales (Apartado Nativo)
- Selección guiada de ~18 temas equilibrados para ciclos semestrales:
  - **1ra Mitad**: 1 de Enero — 20 de Mayo.
  - **2da Mitad**: 1 de Junio — 20 de Noviembre.
- Banco de suplentes interactivo, descarte y sustitución rápida.
- Exportación directa a **Spotify**, **YouTube Music** o copia al portapapeles.
- Respaldo automático bidireccional en la nube mediante **Supabase**.

### 4. Mi Progreso & Gamificación (Apartado Nativo)
- **Nivel de Oyente (XP)**: Sistema de rangos dinámicos según tiempo y canciones reproducidas.
- **Racha Diaria**: Conteo diario de actividad con medallero por hitos (3, 7, 14, 30, 60 y 100 días).
- **Reto Musical Diario**: Desafíos generados por día con opción de reroll diario.
- **Hitos de Artistas (+100)**: Celebración visual con confetti y alertas cuando un artista supera el centenar de reproducciones.

### 5. Experiencias & Juegos Musicales
- **Trivia Musical**: Cuestionario interactivo basado en tus canciones y hábitos reales.
- **Torneo de Canciones**: Duelos de eliminación directa para definir tu tema favorito.
- **Cápsula del Tiempo**: Consulta qué escuchabas en este mismo mes en años anteriores (2019-2025).
- **Iceberg Musical**: Clasificación de tu biblioteca desde lo más comercial hasta rarezas abisales.
- **Carrera de Eras**: Bar chart race animado mes a mes.
- **Hábitos y Horarios Pico**: Mapas de calor y momentos más activos del día y la semana.

### 6. Exportación y Utilidades
- **Exportación en CSV y JSON**: Descarga tu top actual con metadatos completos y estructura adaptada al tipo de contenido.
- **Tarjeta para Compartir**: Generación de tarjeta visual descargable en PNG mediante HTML5 Canvas.
- **PWA (Progressive Web App)**: Instalable como app de escritorio o móvil con modo offline y Service Worker con detección de versiones.

---

## 🛠️ Tecnologías

- **Frontend**: HTML5, Vanilla JavaScript (ES6+), CSS3 personalizado (tema Obsidian Dark), Bootstrap 5, FontAwesome 6, Canvas Confetti, html2canvas.
- **Backend / Servidor**: Node.js, Express 5.
- **APIs & Datos**: Spotify Web API (OAuth PKCE), Last.fm AudioScrobbler API, Supabase REST API (PostgreSQL + RLS).

---

## 📦 Instalación y Uso Local

1. **Clonar el repositorio**:
   ```bash
   git clone https://github.com/Vrak23/spotify-tracker.git
   cd spotify-tracker
   ```

2. **Instalar dependencias**:
   ```bash
   npm install
   ```

3. **Ejecutar servidor**:
   ```bash
   npm start
   ```

4. **Abrir en el navegador**:
   Visita `http://localhost:3000`

---

## 📄 Licencia

ISC
