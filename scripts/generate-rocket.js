const fs = require('fs');
const path = require('path');

const USERNAME = process.env.GITHUB_REPOSITORY_OWNER || process.env.GH_USERNAME || 'tharunrai';

// Color definitions for contribution intensity (GitHub green + space cyan/magenta)
const PALETTE = {
  dark: {
    bg: '#0d1117',
    cardBg: '#161b22',
    border: '#30363d',
    textMain: '#e6edf3',
    textMuted: '#8b949e',
    rocketBody: '#ffffff',
    rocketWindow: '#0ea5e9',
    rocketFins: '#3b82f6',
    exhaust: [
      { min: 0, max: 0, color: '#1f2937', glow: 'none', label: '0 commits', scale: 0.3, particleCount: 2 },
      { min: 1, max: 3, color: '#0e4429', glow: '#0e4429', label: '1-3 commits', scale: 0.6, particleCount: 5 },
      { min: 4, max: 7, color: '#006d32', glow: '#006d32', label: '4-7 commits', scale: 0.8, particleCount: 8 },
      { min: 8, max: 15, color: '#26a641', glow: '#26a641', label: '8-15 commits', scale: 1.0, particleCount: 12 },
      { min: 16, max: Infinity, color: '#39d353', glow: '#39d353', label: '16+ commits', scale: 1.3, particleCount: 18 }
    ],
    flame: [
      { color1: '#4b5563', color2: '#1f2937', length: 15 }, // idle
      { color1: '#f59e0b', color2: '#d97706', length: 30 }, // level 1
      { color1: '#f97316', color2: '#ea580c', length: 50 }, // level 2
      { color1: '#ef4444', color2: '#dc2626', length: 80 }, // level 3
      { color1: '#a855f7', color2: '#ec4899', length: 120 }  // level 4 (warp/power)
    ]
  },
  light: {
    bg: '#ffffff',
    cardBg: '#f6f8fa',
    border: '#d0d7de',
    textMain: '#1f2328',
    textMuted: '#656d76',
    rocketBody: '#e2e8f0',
    rocketWindow: '#0284c7',
    rocketFins: '#2563eb',
    exhaust: [
      { min: 0, max: 0, color: '#ebedf0', glow: 'none', label: '0 commits', scale: 0.3, particleCount: 2 },
      { min: 1, max: 3, color: '#9be9a8', glow: '#9be9a8', label: '1-3 commits', scale: 0.6, particleCount: 5 },
      { min: 4, max: 7, color: '#40c463', glow: '#40c463', label: '4-7 commits', scale: 0.8, particleCount: 8 },
      { min: 8, max: 15, color: '#319246', glow: '#319246', label: '8-15 commits', scale: 1.0, particleCount: 12 },
      { min: 16, max: Infinity, color: '#216e39', glow: '#216e39', label: '16+ commits', scale: 1.3, particleCount: 18 }
    ],
    flame: [
      { color1: '#9ca3af', color2: '#6b7280', length: 15 },
      { color1: '#fbbf24', color2: '#f59e0b', length: 30 },
      { color1: '#fb923c', color2: '#f97316', length: 50 },
      { color1: '#f87171', color2: '#ef4444', length: 80 },
      { color1: '#c084fc', color2: '#f472b6', length: 120 }
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

function generateRocketSvg(username, data, isDark = true) {
  const theme = isDark ? PALETTE.dark : PALETTE.light;
  const contributions = data.contributions || [];
  const totalContributions = data.total?.lastYear || contributions.reduce((s, c) => s + c.count, 0);
  const activeDaysCount = contributions.filter(c => c.count > 0).length;
  
  const weeks = processWeeks(contributions);

  // Engine flame based on most recent week
  const recentWeek = weeks[weeks.length - 1];
  const recentLevel = recentWeek ? recentWeek.levelIndex : 0;
  const flameCfg = theme.flame[recentLevel];

  const width = 850;
  const height = 900; // Taller to fit rocket and trail
  const cx = width / 2;
  
  // Rocket Y coordinates
  const rocketTipY = 100;
  const rocketBaseY = 240;
  const trailStartY = 260;
  const trailEndY = 820;
  
  let exhaustSvg = '';
  
  // We have ~52 weeks. Map them from trailStartY to trailEndY.
  // week 51 (newest) is at trailStartY. week 0 (oldest) is at trailEndY.
  weeks.reverse().forEach((w, i) => {
    const y = trailStartY + (i / (weeks.length - 1)) * (trailEndY - trailStartY);
    const cfg = theme.exhaust[w.levelIndex];
    
    // Spread increases as it goes down
    const spread = 20 + (i / weeks.length) * 120;
    
    const seed = i * 42;
    const tooltip = `Week: ${w.startDate} to ${w.endDate} | ${w.totalCount} contributions`;
    
    // Create particles for this week
    let particles = '';
    for (let p = 0; p < cfg.particleCount; p++) {
      const px = cx + (random(seed + p) - 0.5) * spread;
      const py = y + (random(seed + p + 100) - 0.5) * 15;
      const r = (3 + random(seed + p + 200) * 4) * cfg.scale;
      const op = 0.4 + random(seed + p + 300) * 0.6;
      
      const glowFilter = w.levelIndex >= 3 ? 'filter="url(#glow-exhaust)"' : '';
      const animDelay = -(random(seed + p + 400) * 3).toFixed(2);
      
      particles += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${r.toFixed(1)}" fill="${cfg.color}" opacity="${op.toFixed(2)}" class="exhaust-particle" style="animation-delay: ${animDelay}s;" ${glowFilter} />`;
    }
    
    exhaustSvg += `
      <g class="exhaust-week">
        <title>${tooltip}</title>
        ${particles}
        <!-- Invisible hover target for tooltip -->
        <rect x="${cx - spread/2 - 20}" y="${y - 10}" width="${spread + 40}" height="20" fill="transparent" />
      </g>
    `;
  });

  // Background Stars
  let starsSvg = '';
  for (let i = 0; i < 200; i++) {
    const x = random(i * 10) * width;
    const y = random(i * 20) * height;
    const r = random(i * 30) * 1.5;
    const op = random(i * 40) * 0.5;
    const delay = -(random(i * 50) * 5).toFixed(2);
    starsSvg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${theme.textMain}" opacity="${op.toFixed(2)}" class="bg-star" style="animation-delay: ${delay}s;" />`;
  }

  // Rocket Drawing
  const rocketSvg = `
    <g class="rocket-container">
      <title>Recent Activity: ${recentWeek.totalCount} contributions last week</title>
      
      <!-- Flame -->
      <g class="rocket-flame">
        <ellipse cx="${cx}" cy="${rocketBaseY + flameCfg.length/2 - 5}" rx="12" ry="${flameCfg.length/2}" fill="url(#flame-grad)" filter="url(#glow-flame)" />
        <ellipse cx="${cx}" cy="${rocketBaseY + flameCfg.length/3 - 5}" rx="6" ry="${flameCfg.length/3}" fill="#ffffff" opacity="0.8" />
      </g>

      <!-- Fins -->
      <path d="M ${cx - 20} ${rocketBaseY - 40} L ${cx - 50} ${rocketBaseY + 10} L ${cx - 20} ${rocketBaseY} Z" fill="${theme.rocketFins}" />
      <path d="M ${cx + 20} ${rocketBaseY - 40} L ${cx + 50} ${rocketBaseY + 10} L ${cx + 20} ${rocketBaseY} Z" fill="${theme.rocketFins}" />
      <path d="M ${cx} ${rocketBaseY - 30} L ${cx} ${rocketBaseY + 10} L ${cx - 5} ${rocketBaseY} Z" fill="${theme.rocketWindow}" opacity="0.8" />

      <!-- Main Body -->
      <path d="M ${cx} ${rocketTipY} Q ${cx - 30} ${rocketTipY + 40} ${cx - 25} ${rocketBaseY - 10} L ${cx + 25} ${rocketBaseY - 10} Q ${cx + 30} ${rocketTipY + 40} ${cx} ${rocketTipY}" fill="${theme.rocketBody}" />
      
      <!-- Body details & shading -->
      <path d="M ${cx} ${rocketTipY} Q ${cx + 30} ${rocketTipY + 40} ${cx + 25} ${rocketBaseY - 10} L ${cx} ${rocketBaseY - 10} Z" fill="#000000" opacity="0.15" />
      
      <!-- Window -->
      <circle cx="${cx}" cy="${rocketTipY + 55}" r="12" fill="${theme.bg}" stroke="${theme.rocketWindow}" stroke-width="3" />
      <circle cx="${cx + 2}" cy="${rocketTipY + 53}" r="4" fill="#ffffff" opacity="0.6" />
      
      <!-- Engine Nozzle -->
      <path d="M ${cx - 18} ${rocketBaseY - 10} L ${cx + 18} ${rocketBaseY - 10} L ${cx + 14} ${rocketBaseY} L ${cx - 14} ${rocketBaseY} Z" fill="#4b5563" />
    </g>
  `;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">
  <defs>
    <filter id="glow-flame" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="6" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
    <filter id="glow-exhaust" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>

    <linearGradient id="bg-grad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${theme.bg}" />
      <stop offset="100%" stop-color="${theme.cardBg}" />
    </linearGradient>

    <linearGradient id="flame-grad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${flameCfg.color1}" />
      <stop offset="100%" stop-color="${flameCfg.color2}" />
    </linearGradient>
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
    
    @keyframes bgTwinkle {
      0%, 100% { opacity: 0.8; transform: scale(1); }
      50% { opacity: 0.2; transform: scale(0.6); }
    }
    .bg-star {
      animation: bgTwinkle 3s infinite ease-in-out;
    }

    @keyframes rocketHover {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-8px); }
    }
    @keyframes flameFlicker {
      0%, 100% { transform: scaleY(1); opacity: 1; }
      50% { transform: scaleY(0.85); opacity: 0.8; }
    }
    
    .rocket-container {
      animation: rocketHover 4s infinite ease-in-out;
    }
    .rocket-flame {
      animation: flameFlicker 0.2s infinite ease-in-out;
      transform-origin: ${cx}px ${rocketBaseY}px;
    }

    @keyframes exhaustDrift {
      0% { transform: translateY(0px); opacity: 1; }
      100% { transform: translateY(20px); opacity: 0; }
    }
    .exhaust-particle {
      animation: exhaustDrift 3s infinite linear;
    }
    
    .exhaust-week {
      cursor: pointer;
    }
    .exhaust-week:hover .exhaust-particle {
      opacity: 1 !important;
      stroke: #ffffff;
      stroke-width: 1px;
    }
  </style>

  <rect width="${width}" height="${height}" rx="12" fill="url(#bg-grad)" stroke="${theme.border}" stroke-width="1"/>

  <g transform="translate(${cx}, 40)">
    <text class="header-title" text-anchor="middle">🚀 GITHUB CONTRIBUTION ROCKET</text>
    <text y="22" class="header-subtitle" text-anchor="middle">PILOT: ${username.toUpperCase()} • CONTRIBUTIONS: ${totalContributions}</text>
  </g>

  <!-- Background Layer -->
  ${starsSvg}

  <!-- Trail Layer -->
  <g class="exhaust-container">
    ${exhaustSvg}
  </g>

  <!-- Foreground Layer -->
  ${rocketSvg}

  <!-- Footer Legend -->
  <g transform="translate(0, 0)">
    <line x1="40" y1="${height - 40}" x2="${width - 40}" y2="${height - 40}" stroke="${theme.border}" stroke-width="1" opacity="0.5"/>
    <text x="40" y="${height - 21}" class="header-subtitle" style="font-weight: bold;">INTENSITY LEGEND:</text>
    ${theme.exhaust.map((lvl, idx) => `
      <g transform="translate(${180 + idx * 100}, ${height - 25})">
        <circle cx="0" cy="0" r="${lvl.scale * 4}" fill="${lvl.color}" />
        <text x="12" y="3.5" class="header-subtitle" style="font-size: 10px;">${lvl.label.replace(' commits', '')}</text>
      </g>
    `).join('')}
  </g>
</svg>`;
}

async function main() {
  console.log(`🚀 Generating GitHub Contribution Rocket for ${USERNAME}...`);
  const data = await fetchContributionData(USERNAME);

  const darkSvg = generateRocketSvg(USERNAME, data, true);
  const lightSvg = generateRocketSvg(USERNAME, data, false);

  const distDir = path.join(__dirname, '..', 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  const darkPath = path.join(distDir, 'github-contribution-rocket-dark.svg');
  const lightPath = path.join(distDir, 'github-contribution-rocket.svg');

  fs.writeFileSync(darkPath, darkSvg, 'utf8');
  fs.writeFileSync(lightPath, lightSvg, 'utf8');

  console.log(`✅ Rocket SVGs successfully generated:`);
  console.log(`   - ${darkPath}`);
  console.log(`   - ${lightPath}`);
}

main().catch(err => {
  console.error('Error generating Rocket SVG:', err);
  process.exit(1);
});
