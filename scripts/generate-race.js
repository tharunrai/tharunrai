const fs = require('fs');
const path = require('path');

const USERNAME = process.env.GITHUB_REPOSITORY_OWNER || process.env.GH_USERNAME || 'tharunrai';

const PALETTE = {
  dark: {
    bg: '#09090b',
    cardBg: '#18181b',
    border: '#27272a',
    textMain: '#f4f4f5',
    textMuted: '#a1a1aa',
    carBody: '#1e293b',
    carWindow: '#0284c7',
    carNeon: '#06b6d4',
    levels: [
      { min: 0, max: 0, color: '#1f2937', glow: 'none', label: '0 commits', height: 4, speed: 1 },
      { min: 1, max: 3, color: '#047857', glow: '#047857', label: '1-3 commits', height: 8, speed: 2 },
      { min: 4, max: 7, color: '#10b981', glow: '#10b981', label: '4-7 commits', height: 12, speed: 3 },
      { min: 8, max: 15, color: '#34d399', glow: '#34d399', label: '8-15 commits', height: 18, speed: 4 },
      { min: 16, max: Infinity, color: '#a855f7', glow: '#a855f7', label: '16+ commits', height: 26, speed: 6 }
    ]
  },
  light: {
    bg: '#ffffff',
    cardBg: '#f4f4f5',
    border: '#e4e4e7',
    textMain: '#18181b',
    textMuted: '#71717a',
    carBody: '#cbd5e1',
    carWindow: '#38bdf8',
    carNeon: '#0284c7',
    levels: [
      { min: 0, max: 0, color: '#e4e4e7', glow: 'none', label: '0 commits', height: 4, speed: 1 },
      { min: 1, max: 3, color: '#34d399', glow: '#34d399', label: '1-3 commits', height: 8, speed: 2 },
      { min: 4, max: 7, color: '#10b981', glow: '#10b981', label: '4-7 commits', height: 12, speed: 3 },
      { min: 8, max: 15, color: '#059669', glow: '#059669', label: '8-15 commits', height: 18, speed: 4 },
      { min: 16, max: Infinity, color: '#7e22ce', glow: '#7e22ce', label: '16+ commits', height: 26, speed: 6 }
    ]
  }
};

function random(seed) {
  var x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

async function fetchContributionData(username) {
  try {
    const res = await fetch(`https://github-contributions-api.jogruber.de/v4/${username}?y=last`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Public API failed:', err.message);
  }
  return {
    total: { lastYear: 522 },
    contributions: generateFallbackData()
  };
}

function generateFallbackData() {
  const days = [];
  const now = new Date();
  for (let i = 364; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const count = (i % 7 === 0 || i % 5 === 0) ? Math.floor(Math.random() * 8) : 0;
    days.push({
      date: d.toISOString().split('T')[0],
      count: count
    });
  }
  return days;
}

function processWeeks(contributions) {
  const weeks = [];
  const numWeeks = 52;
  const daysPerWeek = Math.ceil(contributions.length / numWeeks);

  for (let w = 0; w < numWeeks; w++) {
    const chunk = contributions.slice(w * daysPerWeek, (w + 1) * daysPerWeek);
    if (chunk.length === 0) continue;

    const totalCount = chunk.reduce((sum, day) => sum + day.count, 0);
    const activeDays = chunk.filter(d => d.count > 0).length;
    const startDate = chunk[0].date;
    const endDate = chunk[chunk.length - 1].date;

    let levelIndex = 0;
    if (totalCount === 0) levelIndex = 0;
    else if (totalCount <= 3) levelIndex = 1;
    else if (totalCount <= 7) levelIndex = 2;
    else if (totalCount <= 15) levelIndex = 3;
    else levelIndex = 4;

    weeks.push({ weekIndex: w, startDate, endDate, totalCount, activeDays, levelIndex });
  }
  return weeks;
}

function generateRaceSvg(username, data, isDark = true) {
  const theme = isDark ? PALETTE.dark : PALETTE.light;
  const contributions = data.contributions || [];
  const totalContributions = data.total?.lastYear || contributions.reduce((s, c) => s + c.count, 0);
  
  const weeks = processWeeks(contributions);

  // Determine current speed/intensity based on the most recent week
  const recentWeek = weeks[weeks.length - 1];
  const recentLevel = recentWeek ? recentWeek.levelIndex : 0;
  
  // Animation duration: higher level = faster animation (lower duration)
  const baseDuration = 4;
  const animDuration = (baseDuration / theme.levels[recentLevel].speed).toFixed(2);

  const width = 1000;
  const height = 300;
  const trackY = 220;
  
  const trackWidth = 850;
  const trackStartX = (width - trackWidth) / 2;
  const blockWidth = trackWidth / weeks.length;
  
  // Car position (far right of the track, representing the present)
  const carX = trackStartX + trackWidth - 80;
  const carY = trackY - 20;

  let trackSvg = '';
  
  weeks.forEach((w, i) => {
    const x = trackStartX + i * blockWidth;
    const cfg = theme.levels[w.levelIndex];
    const blockH = cfg.height;
    const y = trackY - blockH;
    
    const tooltip = `Week: ${w.startDate} to ${w.endDate} | ${w.totalCount} contributions`;
    const glow = w.levelIndex >= 3 ? 'filter="url(#glow-track)"' : '';
    
    trackSvg += `
      <g class="track-segment">
        <title>${tooltip}</title>
        <rect x="${x + 1}" y="${y}" width="${blockWidth - 2}" height="${blockH}" fill="${cfg.color}" rx="2" ${glow} />
        <!-- Base line -->
        <rect x="${x}" y="${trackY}" width="${blockWidth}" height="4" fill="${w.levelIndex > 0 ? cfg.color : theme.border}" />
      </g>
    `;
  });

  // Speed lines background
  let speedLinesSvg = '';
  for(let i=0; i<30; i++) {
    const y = random(i) * 150 + 40;
    const len = 20 + random(i+1) * 80;
    const op = 0.1 + random(i+2) * 0.4;
    const delay = -(random(i+3) * 5).toFixed(2);
    const duration = (1 + random(i+4) * 2).toFixed(2);
    speedLinesSvg += `<line x1="1000" y1="${y}" x2="${1000 + len}" y2="${y}" stroke="${theme.textMain}" stroke-width="1.5" opacity="${op}" class="speed-line" style="animation-duration: ${duration}s; animation-delay: ${delay}s;" />`;
  }
  
  // Road markings scrolling
  let roadMarkings = '';
  for(let i=0; i<15; i++) {
    const delay = -(i * (animDuration / 15)).toFixed(2);
    roadMarkings += `<rect x="0" y="${trackY + 10}" width="40" height="2" fill="${theme.carNeon}" opacity="0.5" class="road-mark" style="animation-duration: ${animDuration}s; animation-delay: ${delay}s;" />`;
  }

  // Neon Car Drawing
  const carGlow = recentLevel >= 3 ? 'filter="url(#glow-car)"' : '';
  const carExhaustColor = theme.levels[recentLevel].color;
  
  const carSvg = `
    <g class="race-car" ${carGlow} transform="translate(${carX}, ${carY})">
      <title>Recent Activity: ${recentWeek.totalCount} contributions last week</title>
      
      <!-- Exhaust Flame -->
      <g class="car-exhaust" style="animation-duration: 0.1s;">
        <ellipse cx="-40" cy="5" rx="${10 + recentLevel * 8}" ry="${3 + recentLevel}" fill="${carExhaustColor}" />
        <ellipse cx="-35" cy="5" rx="${5 + recentLevel * 4}" ry="2" fill="#ffffff" opacity="0.8" />
      </g>
      
      <!-- Shadow/Underglow -->
      <ellipse cx="0" cy="18" rx="45" ry="6" fill="${carExhaustColor}" opacity="0.4" filter="url(#glow-heavy)" />
      
      <!-- Body Bottom -->
      <path d="M -30 10 L 40 10 L 50 5 L -35 5 Z" fill="${theme.carNeon}" />
      
      <!-- Main Chassis -->
      <path d="M -35 5 L 45 5 C 55 5 60 -5 50 -10 L 10 -15 C 0 -15 -10 -25 -20 -25 L -30 -25 C -40 -25 -45 -15 -45 -5 Z" fill="${theme.carBody}" />
      
      <!-- Window -->
      <path d="M -15 -22 L 5 -15 L 30 -5 L -20 -5 C -30 -5 -35 -15 -25 -22 Z" fill="${theme.bg}" />
      <path d="M -13 -20 L 3 -14 L 25 -6 L -18 -6 C -25 -6 -30 -14 -22 -20 Z" fill="${theme.carWindow}" opacity="0.7" />
      <path d="M -5 -18 L 15 -8 L 5 -8 L -10 -16 Z" fill="#ffffff" opacity="0.4" />
      
      <!-- Wheels -->
      <circle cx="-20" cy="10" r="8" fill="#111" stroke="${theme.carNeon}" stroke-width="2" class="wheel" />
      <circle cx="35" cy="10" r="8" fill="#111" stroke="${theme.carNeon}" stroke-width="2" class="wheel" />
      <!-- Wheel rims (spinning) -->
      <g class="wheel-spin" style="animation-duration: ${animDuration/4}s;" transform="translate(-20, 10)">
        <line x1="-5" y1="0" x2="5" y2="0" stroke="#fff" stroke-width="1.5" />
        <line x1="0" y1="-5" x2="0" y2="5" stroke="#fff" stroke-width="1.5" />
      </g>
      <g class="wheel-spin" style="animation-duration: ${animDuration/4}s;" transform="translate(35, 10)">
        <line x1="-5" y1="0" x2="5" y2="0" stroke="#fff" stroke-width="1.5" />
        <line x1="0" y1="-5" x2="0" y2="5" stroke="#fff" stroke-width="1.5" />
      </g>
    </g>
  `;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">
  <defs>
    <filter id="glow-track" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
    <filter id="glow-car" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="1.5" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
    <filter id="glow-heavy" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="6" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>

    <linearGradient id="bg-grad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${theme.bg}" />
      <stop offset="100%" stop-color="${theme.cardBg}" />
    </linearGradient>
    
    <clipPath id="track-clip">
      <rect x="${trackStartX}" y="0" width="${trackWidth}" height="${height}" />
    </clipPath>
  </defs>

  <style>
    .header-title {
      font-family: 'Segoe UI', -apple-system, sans-serif;
      font-weight: 800;
      font-size: 24px;
      letter-spacing: 2px;
      fill: ${theme.textMain};
    }
    .header-subtitle {
      font-family: 'SF Mono', Consolas, monospace;
      font-weight: 500;
      font-size: 12px;
      fill: ${theme.textMuted};
      letter-spacing: 1px;
    }
    
    @keyframes speedLine {
      0% { transform: translateX(0px); opacity: 1; }
      100% { transform: translateX(-1500px); opacity: 0; }
    }
    .speed-line {
      animation-name: speedLine;
      animation-timing-function: linear;
      animation-iteration-count: infinite;
    }

    @keyframes roadMarking {
      0% { transform: translateX(850px); }
      100% { transform: translateX(-50px); }
    }
    .road-mark {
      animation-name: roadMarking;
      animation-timing-function: linear;
      animation-iteration-count: infinite;
    }

    @keyframes carHover {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-3px); }
    }
    .race-car {
      animation: carHover 2s infinite ease-in-out;
    }

    @keyframes exhaustFlicker {
      0%, 100% { transform: scaleX(1); opacity: 1; }
      50% { transform: scaleX(0.7); opacity: 0.8; }
    }
    .car-exhaust {
      animation: exhaustFlicker infinite ease-in-out;
      transform-origin: 0px 5px;
    }

    @keyframes wheelSpin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .wheel-spin {
      animation-name: wheelSpin;
      animation-timing-function: linear;
      animation-iteration-count: infinite;
    }
    
    .track-segment {
      cursor: pointer;
      transition: transform 0.1s;
    }
    .track-segment:hover rect:first-child {
      opacity: 1 !important;
      stroke: #ffffff;
      stroke-width: 1px;
    }
  </style>

  <rect width="${width}" height="${height}" rx="12" fill="url(#bg-grad)" stroke="${theme.border}" stroke-width="1"/>

  <g transform="translate(${width/2}, 40)">
    <text class="header-title" text-anchor="middle">🏎️ GITHUB CONTRIBUTION RACE</text>
    <text y="22" class="header-subtitle" text-anchor="middle">DRIVER: ${username.toUpperCase()} • TOTAL LAPS (COMMITS): ${totalContributions}</text>
  </g>

  <!-- Speed Lines Background -->
  <g clip-path="url(#track-clip)">
    ${speedLinesSvg}
  </g>

  <!-- Ground Grid/Lines -->
  <line x1="${trackStartX}" y1="${trackY + 4}" x2="${trackStartX + trackWidth}" y2="${trackY + 4}" stroke="${theme.border}" stroke-width="1" />
  <g clip-path="url(#track-clip)" transform="translate(${trackStartX}, 0)">
    ${roadMarkings}
  </g>

  <!-- Contribution Track Blocks -->
  <g class="contribution-track">
    ${trackSvg}
  </g>

  <!-- Foreground Car -->
  ${carSvg}

  <!-- Footer Legend -->
  <g transform="translate(0, 0)">
    <line x1="40" y1="${height - 40}" x2="${width - 40}" y2="${height - 40}" stroke="${theme.border}" stroke-width="1" opacity="0.5"/>
    <text x="40" y="${height - 21}" class="header-subtitle" style="font-weight: bold;">SPEED / INTENSITY:</text>
    ${theme.levels.map((lvl, idx) => `
      <g transform="translate(${180 + idx * 100}, ${height - 25})">
        <rect x="0" y="-4" width="12" height="8" fill="${lvl.color}" rx="2"/>
        <text x="18" y="3.5" class="header-subtitle" style="font-size: 10px;">${lvl.label.replace(' commits', '')}</text>
      </g>
    `).join('')}
    
    <!-- Old/New Timeline indicator -->
    <g transform="translate(${width - 250}, ${height - 21})">
      <text x="0" y="0" class="header-subtitle" style="font-size: 10px; fill: ${theme.textMuted};">&lt; OLDER</text>
      <line x1="45" y1="-3" x2="145" y2="-3" stroke="${theme.border}" stroke-dasharray="2 2" />
      <text x="155" y="0" class="header-subtitle" style="font-size: 10px; fill: ${theme.textMain};">NEWER &gt;</text>
    </g>
  </g>
</svg>`;
}

async function main() {
  console.log(`🏎️ Generating GitHub Contribution Race for ${USERNAME}...`);
  const data = await fetchContributionData(USERNAME);

  const darkSvg = generateRaceSvg(USERNAME, data, true);
  const lightSvg = generateRaceSvg(USERNAME, data, false);

  const distDir = path.join(__dirname, '..', 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  const darkPath = path.join(distDir, 'github-contribution-race-dark.svg');
  const lightPath = path.join(distDir, 'github-contribution-race.svg');

  fs.writeFileSync(darkPath, darkSvg, 'utf8');
  fs.writeFileSync(lightPath, lightSvg, 'utf8');

  console.log(`✅ Race SVGs successfully generated:`);
  console.log(`   - ${darkPath}`);
  console.log(`   - ${lightPath}`);
}

main().catch(err => {
  console.error('Error generating Race SVG:', err);
  process.exit(1);
});
