const fs = require('fs');
const https = require('https');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const USERNAME = 'tharunrai';

// Classic Tetris piece colors & glow attributes
const TETRIS_COLORS = [
  '#00F0FF', // I - Cyan
  '#FACC15', // O - Yellow
  '#A855F7', // T - Purple
  '#22C55E', // S - GitHub Neon Green
  '#EF4444', // Z - Red
  '#3B82F6', // J - Blue
  '#F97316', // L - Orange
];

async function fetchContributions() {
  return new Promise((resolve, reject) => {
    const query = `
    query {
      user(login: "${USERNAME}") {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                date
                weekday
              }
            }
          }
        }
      }
    }`;

    const options = {
      hostname: 'api.github.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'User-Agent': 'GitHub-Tetris-Action'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`API request failed with status ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify({ query }));
    req.end();
  });
}

function calculateStreaks(days) {
  let currentStreak = 0;
  let maxStreak = 0;
  let tempStreak = 0;

  for (let i = 0; i < days.length; i++) {
    if (days[i].contributionCount > 0) {
      tempStreak++;
      if (tempStreak > maxStreak) maxStreak = tempStreak;
    } else {
      tempStreak = 0;
    }
  }

  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].contributionCount > 0) {
      currentStreak++;
    } else {
      if (i === days.length - 1) continue;
      break;
    }
  }

  return { currentStreak: Math.max(currentStreak, 1), maxStreak: Math.max(maxStreak, currentStreak) };
}

function generateTetrisSVG(days, totalContribs) {
  const SVG_WIDTH = 840;
  const SVG_HEIGHT = 380;

  // Tetris Matrix Configuration
  const BOARD_X = 30;
  const BOARD_Y = 60;
  const COLS = 24; // 24 columns representing the past 24 active time buckets
  const ROWS = 14; // 14 rows high
  const CELL_SIZE = 19;
  const CELL_GAP = 2;
  const BOARD_WIDTH = COLS * (CELL_SIZE + CELL_GAP);
  const BOARD_HEIGHT = ROWS * (CELL_SIZE + CELL_GAP);

  const { currentStreak, maxStreak } = calculateStreaks(days);

  // Take the last 24 days (or condensed buckets)
  const displayDays = days.slice(-COLS);

  // Background Grid Cells
  let gridLines = '';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = BOARD_X + c * (CELL_SIZE + CELL_GAP);
      const y = BOARD_Y + r * (CELL_SIZE + CELL_GAP);
      gridLines += `<rect x="${x}" y="${y}" width="${CELL_SIZE}" height="${CELL_SIZE}" fill="#0a101d" stroke="#152033" stroke-width="1" rx="2" />\n`;
    }
  }

  // Generate Stacked Contribution Blocks
  let matrixBlocks = '';
  displayDays.forEach((day, colIdx) => {
    const count = day.contributionCount;
    if (count === 0) return;

    // Stack height based on count (clamped between 1 and ROWS - 3)
    let blockHeight = Math.min(ROWS - 3, Math.max(1, Math.round((count / 10) * (ROWS - 4)) + 1));
    if (count >= 16) blockHeight = Math.min(ROWS - 2, 11);

    for (let h = 0; h < blockHeight; h++) {
      const rowIdx = ROWS - 1 - h;
      const x = BOARD_X + colIdx * (CELL_SIZE + CELL_GAP);
      const y = BOARD_Y + rowIdx * (CELL_SIZE + CELL_GAP);

      // Block color chosen cyclically for classic Tetris multi-color stack
      const color = TETRIS_COLORS[(colIdx + Math.floor(h / 2)) % TETRIS_COLORS.length];
      const opacity = count >= 16 ? '1' : count >= 8 ? '0.95' : count >= 4 ? '0.85' : '0.75';

      matrixBlocks += `<use href="#tetris-block" x="${x}" y="${y}" fill="${color}" opacity="${opacity}" />\n`;
    }
  });

  // Falling Piece Animation 1 (T-Piece dropping in column 18)
  const fallCol = 17;
  const fallX = BOARD_X + fallCol * (CELL_SIZE + CELL_GAP);
  const landY = BOARD_Y + (ROWS - 6) * (CELL_SIZE + CELL_GAP);

  const fallingPieceSVG = `
  <!-- Animated Falling Tetromino 1 (T-Piece) -->
  <g class="falling-tetromino">
    <use href="#tetris-block" x="${CELL_SIZE + CELL_GAP}" y="0" fill="#A855F7" filter="url(#neon-glow)" />
    <use href="#tetris-block" x="0" y="${CELL_SIZE + CELL_GAP}" fill="#A855F7" filter="url(#neon-glow)" />
    <use href="#tetris-block" x="${CELL_SIZE + CELL_GAP}" y="${CELL_SIZE + CELL_GAP}" fill="#A855F7" filter="url(#neon-glow)" />
    <use href="#tetris-block" x="${(CELL_SIZE + CELL_GAP) * 2}" y="${CELL_SIZE + CELL_GAP}" fill="#A855F7" filter="url(#neon-glow)" />
  </g>`;

  // Falling Piece Animation 2 (I-Piece in column 4)
  const fallCol2 = 4;
  const fallX2 = BOARD_X + fallCol2 * (CELL_SIZE + CELL_GAP);
  const landY2 = BOARD_Y + (ROWS - 6) * (CELL_SIZE + CELL_GAP);

  const fallingPiece2SVG = `
  <!-- Animated Falling Tetromino 2 (I-Piece) -->
  <g class="falling-tetromino-2">
    <use href="#tetris-block" x="0" y="0" fill="#00F0FF" filter="url(#cyan-glow)" />
    <use href="#tetris-block" x="0" y="${CELL_SIZE + CELL_GAP}" fill="#00F0FF" filter="url(#cyan-glow)" />
    <use href="#tetris-block" x="0" y="${(CELL_SIZE + CELL_GAP) * 2}" fill="#00F0FF" filter="url(#cyan-glow)" />
  </g>`;

  // Line Clear Laser Effect across row (ROWS - 2)
  const lineClearY = BOARD_Y + (ROWS - 2) * (CELL_SIZE + CELL_GAP);
  const lineClearSVG = `
  <rect class="line-clear-beam" x="${BOARD_X}" y="${lineClearY}" width="${BOARD_WIDTH}" height="${CELL_SIZE}" fill="#38BDF8" rx="2" opacity="0" filter="url(#line-glow)" />
  `;

  // HUD Side Panel
  const HUD_X = BOARD_X + BOARD_WIDTH + 24;
  const HUD_Y = BOARD_Y;
  const HUD_WIDTH = SVG_WIDTH - HUD_X - 30;

  const svg = `
<svg width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Reusable Beveled Tetris Block Definition -->
    <g id="tetris-block">
      <rect width="${CELL_SIZE}" height="${CELL_SIZE}" rx="3" />
      <path d="M 0 ${CELL_SIZE} L 0 0 L ${CELL_SIZE} 0 L ${CELL_SIZE-3} 3 L 3 3 L 3 ${CELL_SIZE-3} Z" fill="#ffffff" opacity="0.32" />
      <path d="M 0 ${CELL_SIZE} L ${CELL_SIZE} ${CELL_SIZE} L ${CELL_SIZE} 0 L ${CELL_SIZE-3} 3 L ${CELL_SIZE-3} ${CELL_SIZE-3} L 3 ${CELL_SIZE-3} Z" fill="#000000" opacity="0.38" />
      <rect x="5" y="5" width="${CELL_SIZE-10}" height="${CELL_SIZE-10}" fill="#ffffff" opacity="0.22" rx="1" />
    </g>

    <!-- Gradients -->
    <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#080C14" />
      <stop offset="50%" stop-color="#0D111A" />
      <stop offset="100%" stop-color="#0A0F1D" />
    </linearGradient>

    <linearGradient id="panel-grad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#111827" stop-opacity="0.95" />
      <stop offset="100%" stop-color="#0B0F19" stop-opacity="0.98" />
    </linearGradient>

    <!-- Neon Glow Filters -->
    <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>

    <filter id="cyan-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>

    <filter id="line-glow" x="-10%" y="-50%" width="120%" height="200%">
      <feGaussianBlur stdDeviation="6" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>

    <style>
      @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;800&amp;display=swap');

      text {
        font-family: 'JetBrains Mono', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
      }

      .retro-title {
        font-weight: 800;
        letter-spacing: 2px;
      }

      /* Falling Piece 1 Keyframes */
      @keyframes dropPiece {
        0% {
          transform: translate(${fallX}px, ${BOARD_Y - 50}px);
          opacity: 0;
        }
        10% {
          opacity: 1;
        }
        60% {
          transform: translate(${fallX}px, ${landY}px);
          opacity: 1;
        }
        68% {
          transform: translate(${fallX}px, ${landY - 3}px);
        }
        75% {
          transform: translate(${fallX}px, ${landY}px);
          opacity: 1;
        }
        90% {
          opacity: 1;
        }
        100% {
          transform: translate(${fallX}px, ${landY}px);
          opacity: 0;
        }
      }

      .falling-tetromino {
        animation: dropPiece 5.5s cubic-bezier(0.25, 1, 0.5, 1) infinite;
      }

      /* Falling Piece 2 Keyframes */
      @keyframes dropPiece2 {
        0% {
          transform: translate(${fallX2}px, ${BOARD_Y - 70}px);
          opacity: 0;
        }
        25% {
          opacity: 0;
        }
        35% {
          opacity: 1;
        }
        75% {
          transform: translate(${fallX2}px, ${landY2}px);
          opacity: 1;
        }
        82% {
          transform: translate(${fallX2}px, ${landY2 - 2}px);
        }
        88% {
          transform: translate(${fallX2}px, ${landY2}px);
          opacity: 1;
        }
        100% {
          transform: translate(${fallX2}px, ${landY2}px);
          opacity: 0;
        }
      }

      .falling-tetromino-2 {
        animation: dropPiece2 6.8s cubic-bezier(0.3, 1, 0.4, 1) infinite;
      }

      /* Line Clear Laser Flash */
      @keyframes lineClearAnim {
        0%, 65% {
          opacity: 0;
          transform: scaleX(0);
        }
        70% {
          opacity: 0.9;
          transform: scaleX(1);
        }
        80% {
          opacity: 0.7;
          transform: scaleX(1);
        }
        90%, 100% {
          opacity: 0;
          transform: scaleX(1);
        }
      }

      .line-clear-beam {
        transform-origin: center;
        animation: lineClearAnim 5.5s ease-in-out infinite;
      }

      /* Pulse & Floating Sparkles */
      @keyframes pulseGlow {
        0%, 100% { opacity: 0.8; }
        50% { opacity: 1; filter: drop-shadow(0 0 6px #8B5CF6); }
      }

      .pulse-item {
        animation: pulseGlow 2.5s ease-in-out infinite;
      }

      @keyframes floatParticle {
        0% { transform: translateY(0px); opacity: 0.3; }
        50% { transform: translateY(-8px); opacity: 0.9; }
        100% { transform: translateY(0px); opacity: 0.3; }
      }

      .particle {
        animation: floatParticle 3s ease-in-out infinite;
      }
    </style>
  </defs>

  <!-- Background Container -->
  <rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" rx="12" fill="url(#bg-grad)" stroke="#1E293B" stroke-width="1.5" />

  <!-- Subtle Matrix Circuit Grid Backdrop -->
  <g opacity="0.12">
    <line x1="0" y1="50" x2="${SVG_WIDTH}" y2="50" stroke="#38BDF8" stroke-width="0.5" stroke-dasharray="4 4" />
    <line x1="0" y1="${SVG_HEIGHT - 30}" x2="${SVG_WIDTH}" y2="${SVG_HEIGHT - 30}" stroke="#38BDF8" stroke-width="0.5" stroke-dasharray="4 4" />
    <line x1="${BOARD_X + BOARD_WIDTH + 12}" y1="0" x2="${BOARD_X + BOARD_WIDTH + 12}" y2="${SVG_HEIGHT}" stroke="#8B5CF6" stroke-width="0.5" stroke-dasharray="4 4" />
  </g>

  <!-- ==================== HEADER BAR ==================== -->
  <g transform="translate(30, 36)">
    <!-- Game Icon & Title -->
    <rect x="0" y="-16" width="26" height="26" rx="5" fill="#8B5CF6" opacity="0.2" />
    <text x="5" y="2" font-size="16">🧱</text>
    <text x="35" y="1" font-size="15" fill="#F8FAFC" class="retro-title">GITHUB // CONTRIBUTION TETRIS</text>
    <text x="365" y="1" font-size="11" fill="#64748B" font-weight="600">• TIMELINE MATRIX</text>

    <!-- Right-aligned Status Badge -->
    <rect x="${SVG_WIDTH - 230}" y="-16" width="140" height="24" rx="12" fill="#1E293B" stroke="#334155" stroke-width="1" />
    <circle cx="${SVG_WIDTH - 218}" cy="-4" r="4" fill="#22C55E" class="pulse-item" />
    <text x="${SVG_WIDTH - 206}" y="0" font-size="10" fill="#94A3B8" font-weight="700">STATUS: ACTIVE</text>
  </g>

  <!-- ==================== TETRIS GAME BOARD ==================== -->
  <!-- Outer Matrix Board Bezel -->
  <rect x="${BOARD_X - 6}" y="${BOARD_Y - 6}" width="${BOARD_WIDTH + 12}" height="${BOARD_HEIGHT + 12}" rx="8" fill="#070A12" stroke="#334155" stroke-width="1.5" />

  <!-- Base Grid Cells -->
  <g>
    ${gridLines}
  </g>

  <!-- Historical Contribution Stack Blocks -->
  <g id="tetris-stack">
    ${matrixBlocks}
  </g>

  <!-- Active Line Clear Laser Sweep -->
  ${lineClearSVG}

  <!-- Active Falling Tetris Pieces -->
  ${fallingPieceSVG}
  ${fallingPiece2SVG}

  <!-- Timeline Axis Labels below Board -->
  <g transform="translate(${BOARD_X}, ${BOARD_Y + BOARD_HEIGHT + 18})">
    <text x="0" y="0" font-size="9.5" fill="#64748B" font-weight="600">◀ OLDER COMMITS</text>
    <text x="${BOARD_WIDTH / 2 - 40}" y="0" font-size="9.5" fill="#475569" font-weight="600">• • • 24 DAYS TIMELINE • • •</text>
    <text x="${BOARD_WIDTH - 90}" y="0" font-size="9.5" fill="#38BDF8" font-weight="700">RECENT ACTIVITY ▶</text>
  </g>

  <!-- ==================== HUD SIDE PANEL ==================== -->
  <g transform="translate(${HUD_X}, ${HUD_Y})">
    <!-- HUD Backdrop Card -->
    <rect x="0" y="0" width="${HUD_WIDTH}" height="${BOARD_HEIGHT}" rx="8" fill="url(#panel-grad)" stroke="#1E293B" stroke-width="1.5" />

    <!-- Section 1: Player & Score -->
    <g transform="translate(16, 26)">
      <text x="0" y="0" font-size="9" fill="#94A3B8" font-weight="700" letter-spacing="1">PLAYER</text>
      <text x="0" y="16" font-size="13" fill="#F1F5F9" font-weight="800">@${USERNAME}</text>

      <line x1="0" y1="26" x2="${HUD_WIDTH - 32}" y2="26" stroke="#1E293B" stroke-width="1" />
    </g>

    <!-- Section 2: Contribution Stats -->
    <g transform="translate(16, 80)">
      <text x="0" y="0" font-size="9" fill="#94A3B8" font-weight="700" letter-spacing="1">TOTAL SCORE</text>
      <text x="0" y="18" font-size="18" fill="#38BDF8" font-weight="800">${totalContribs.toLocaleString()}</text>
      <text x="0" y="32" font-size="9.5" fill="#64748B">Contributions</text>

      <line x1="0" y1="42" x2="${HUD_WIDTH - 32}" y2="42" stroke="#1E293B" stroke-width="1" />
    </g>

    <!-- Section 3: Streaks -->
    <g transform="translate(16, 150)">
      <text x="0" y="0" font-size="9" fill="#94A3B8" font-weight="700" letter-spacing="1">CURRENT STREAK</text>
      <text x="0" y="18" font-size="15" fill="#22C55E" font-weight="800">🔥 ${currentStreak} Days</text>
      <text x="0" y="32" font-size="9.5" fill="#64748B">Best: ${maxStreak} Days</text>

      <line x1="0" y1="42" x2="${HUD_WIDTH - 32}" y2="42" stroke="#1E293B" stroke-width="1" />
    </g>

    <!-- Section 4: Next Piece Preview -->
    <g transform="translate(16, 218)">
      <text x="0" y="0" font-size="9" fill="#94A3B8" font-weight="700" letter-spacing="1">NEXT PIECE</text>
      
      <!-- Mini Preview Box -->
      <rect x="0" y="8" width="80" height="42" rx="4" fill="#070A12" stroke="#334155" stroke-width="1" />
      
      <!-- Mini Tetromino in Box (L-Piece) -->
      <g transform="translate(24, 16)">
        <rect x="0" y="0" width="8" height="8" fill="#F97316" rx="1" />
        <rect x="0" y="9" width="8" height="8" fill="#F97316" rx="1" />
        <rect x="0" y="18" width="8" height="8" fill="#F97316" rx="1" />
        <rect x="9" y="18" width="8" height="8" fill="#F97316" rx="1" />
      </g>

      <text x="92" y="24" font-size="9" fill="#A855F7" font-weight="700">LEVEL</text>
      <text x="92" y="40" font-size="12" fill="#EC4899" font-weight="800">AIML // TS</text>
    </g>

    <!-- Section 5: Block Legend / Intensity -->
    <g transform="translate(16, 282)">
      <text x="0" y="0" font-size="8.5" fill="#64748B" font-weight="600">INTENSITY</text>
      <g transform="translate(0, 8)">
        <rect x="0" y="0" width="10" height="10" fill="#0E4429" rx="1" />
        <rect x="14" y="0" width="10" height="10" fill="#006D32" rx="1" />
        <rect x="28" y="0" width="10" height="10" fill="#22C55E" rx="1" />
        <rect x="42" y="0" width="10" height="10" fill="#A855F7" rx="1" />
        <rect x="56" y="0" width="10" height="10" fill="#00F0FF" rx="1" />
        <text x="74" y="9" font-size="8.5" fill="#94A3B8">16+ Boost</text>
      </g>
    </g>
  </g>

  <!-- ==================== AMBIENT PARTICLES ==================== -->
  <g>
    <circle cx="120" cy="180" r="1.5" fill="#38BDF8" class="particle" style="animation-delay: 0.3s;" />
    <circle cx="280" cy="140" r="1.5" fill="#A855F7" class="particle" style="animation-delay: 1.2s;" />
    <circle cx="430" cy="190" r="2" fill="#22C55E" class="particle" style="animation-delay: 2.1s;" />
    <circle cx="510" cy="110" r="1.5" fill="#FACC15" class="particle" style="animation-delay: 0.8s;" />
    <circle cx="780" cy="80" r="1.5" fill="#EC4899" class="particle" style="animation-delay: 1.7s;" />
  </g>

</svg>
  `.trim();

  return svg;
}

// Fallback data generator for local testing
function generateFallbackDays() {
  const days = [];
  const now = Date.now();
  for (let i = 45; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    // Simulate real commit distribution
    const count = i % 5 === 0 ? 0 : (i % 7 === 0 ? 18 : (i % 3 === 0 ? 8 : (i % 2 === 0 ? 4 : 2)));
    days.push({
      contributionCount: count,
      date: d.toISOString().split('T')[0],
      weekday: d.getDay()
    });
  }
  return days;
}

async function main() {
  let days = [];
  let totalContribs = 535;

  if (GITHUB_TOKEN) {
    console.log("Fetching real GitHub contribution data via GraphQL...");
    try {
      const data = await fetchContributions();
      const cal = data.data.user.contributionsCollection.contributionCalendar;
      totalContribs = cal.totalContributions || totalContribs;
      const weeks = cal.weeks;
      days = weeks.flatMap(w => w.contributionDays);
      console.log(`Fetched ${days.length} days of data with ${totalContribs} total contributions.`);
    } catch (err) {
      console.warn("Error fetching GraphQL data:", err.message);
      console.log("Falling back to simulated data...");
      days = generateFallbackDays();
    }
  } else {
    console.log("No GITHUB_TOKEN provided, using fallback contribution data.");
    days = generateFallbackDays();
  }

  const svg = generateTetrisSVG(days, totalContribs);

  if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist', { recursive: true });
  }

  fs.writeFileSync('dist/tetris.svg', svg);
  console.log("Successfully generated optimized dist/tetris.svg!");
}

main();
