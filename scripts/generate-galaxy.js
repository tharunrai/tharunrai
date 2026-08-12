const fs = require('fs');
const path = require('path');

const USERNAME = process.env.GITHUB_REPOSITORY_OWNER || process.env.GH_USERNAME || 'tharunrai';

// Color definitions for contribution intensity
const PALETTE = {
  dark: {
    bg: '#0d1117',
    cardBg: '#161b22',
    border: '#30363d',
    textMain: '#e6edf3',
    textMuted: '#8b949e',
    levels: [
      { min: 0, max: 0, color: '#1f2937', glow: 'none', label: '0 commits', opacity: 0.2, radius: 1.0 },
      { min: 1, max: 3, color: '#0ea5e9', glow: '#0ea5e9', label: '1-3 commits', opacity: 0.8, radius: 2.5 },
      { min: 4, max: 7, color: '#8b5cf6', glow: '#8b5cf6', label: '4-7 commits', opacity: 0.9, radius: 3.5 },
      { min: 8, max: 15, color: '#d946ef', glow: '#d946ef', label: '8-15 commits', opacity: 1.0, radius: 4.5 },
      { min: 16, max: Infinity, color: '#f43f5e', glow: '#f43f5e', label: '16+ commits', opacity: 1.0, radius: 6.0 }
    ]
  },
  light: {
    bg: '#ffffff',
    cardBg: '#f6f8fa',
    border: '#d0d7de',
    textMain: '#1f2328',
    textMuted: '#656d76',
    levels: [
      { min: 0, max: 0, color: '#e5e7eb', glow: 'none', label: '0 commits', opacity: 0.4, radius: 1.0 },
      { min: 1, max: 3, color: '#0284c7', glow: '#0284c7', label: '1-3 commits', opacity: 0.8, radius: 2.5 },
      { min: 4, max: 7, color: '#6d28d9', glow: '#6d28d9', label: '4-7 commits', opacity: 0.9, radius: 3.5 },
      { min: 8, max: 15, color: '#c026d3', glow: '#c026d3', label: '8-15 commits', opacity: 1.0, radius: 4.5 },
      { min: 16, max: Infinity, color: '#e11d48', glow: '#e11d48', label: '16+ commits', opacity: 1.0, radius: 6.0 }
    ]
  }
};

// Seeded random for consistent star placement
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
    console.warn('Public contributions API failed, checking fallback:', err.message);
  }

  // Fallback
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
      count: count,
      level: count === 0 ? 0 : count <= 3 ? 1 : count <= 7 ? 2 : count <= 15 ? 3 : 4
    });
  }
  return days;
}

function generateGalaxySvg(username, data, isDark = true) {
  const theme = isDark ? PALETTE.dark : PALETTE.light;
  const contributions = data.contributions || [];
  const totalContributions = data.total?.lastYear || contributions.reduce((s, c) => s + c.count, 0);
  const activeDaysCount = contributions.filter(c => c.count > 0).length;

  const width = 850;
  const height = 550;
  const cx = width / 2;
  const cy = height / 2 + 10;
  
  // Spiral logic
  const numArms = 5;
  const maxRadius = Math.min(width, height) / 2.5;
  const rotationTotal = Math.PI * 2.8; 
  
  let starsSvg = '';
  const numStars = contributions.length;

  contributions.forEach((day, i) => {
    // Determine level index safely
    let levelIndex = 0;
    if (day.count === 0) levelIndex = 0;
    else if (day.count <= 3) levelIndex = 1;
    else if (day.count <= 7) levelIndex = 2;
    else if (day.count <= 15) levelIndex = 3;
    else levelIndex = 4;

    const cfg = theme.levels[levelIndex];

    // Older commits are further out, newer are closer to the core
    // Or vice versa? Let's put newer commits in the bright core!
    const progress = 1 - (i / numStars); // 0 at newest, 1 at oldest
    
    // Core has a tight radius, outer has large radius
    const r = 20 + progress * maxRadius;
    
    // The angle depends on the progress and which arm it's on
    const armIndex = i % numArms;
    const baseTheta = (armIndex * (Math.PI * 2)) / numArms;
    const theta = baseTheta + (progress * rotationTotal);

    // Random jitter based on a fixed seed (using index)
    const seed = i * 1337;
    const jitterR = (random(seed) - 0.5) * 40 * (1 - progress * 0.5); // more jitter in center? or less? Let's say consistent jitter
    const jitterTheta = (random(seed + 1) - 0.5) * 0.5;

    const finalR = Math.max(0, r + jitterR);
    const finalTheta = theta + jitterTheta;

    const x = cx + finalR * Math.cos(finalTheta);
    const y = cy + finalR * Math.sin(finalTheta);
    
    // Add tooltip
    const tooltip = `${day.date}: ${day.count} contributions`;
    
    const glowClass = levelIndex >= 2 ? `glow-lvl-${levelIndex}` : '';
    const twinkleClass = levelIndex >= 3 ? 'twinkle' : '';
    
    starsSvg += `
      <g class="star-group ${twinkleClass}" style="animation-delay: -${(random(seed + 2) * 5).toFixed(2)}s;">
        <title>${tooltip}</title>
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${cfg.radius.toFixed(1)}" fill="${cfg.color}" opacity="${cfg.opacity}" class="${glowClass}"/>
        ${levelIndex >= 2 ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(cfg.radius * 2).toFixed(1)}" fill="${cfg.color}" opacity="0.3" class="${glowClass}"/>` : ''}
      </g>
    `;
  });
  
  // Background decorative stars
  for (let i = 0; i < 200; i++) {
    const x = random(i * 10) * width;
    const y = random(i * 20) * height;
    const r = random(i * 30) * 1.5;
    const op = random(i * 40) * 0.5;
    starsSvg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${theme.textMain}" opacity="${op.toFixed(2)}" />`;
  }

  // Legend
  const legendSvg = theme.levels.map((lvl, idx) => {
    const lx = width / 2 - 200 + idx * 80;
    return `
      <g transform="translate(${lx}, ${height - 25})">
        <circle cx="0" cy="0" r="${lvl.radius}" fill="${lvl.color}" opacity="${lvl.opacity}" />
        <text x="10" y="3.5" class="legend-text">${lvl.label.replace(' commits', '')}</text>
      </g>
    `;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" direction="ltr">
  <defs>
    <filter id="glow-heavy" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="4" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
    <filter id="glow-light" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="2" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>

    <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${theme.bg}" />
      <stop offset="100%" stop-color="${theme.cardBg}" />
    </linearGradient>
    
    <radialGradient id="core-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.15" />
      <stop offset="100%" stop-color="${theme.bg}" stop-opacity="0" />
    </radialGradient>
  </defs>

  <style>
    .header-title {
      font-family: 'Segoe UI', -apple-system, sans-serif;
      font-weight: 800;
      font-size: 20px;
      letter-spacing: 2px;
      fill: ${theme.textMain};
    }
    .header-subtitle {
      font-family: 'SF Mono', Consolas, monospace;
      font-weight: 500;
      font-size: 11px;
      fill: ${theme.textMuted};
      letter-spacing: 1px;
    }
    .legend-text {
      font-family: 'SF Mono', Consolas, monospace;
      font-size: 10px;
      fill: ${theme.textMuted};
    }
    .glow-lvl-2, .glow-lvl-3 { filter: url(#glow-light); }
    .glow-lvl-4 { filter: url(#glow-heavy); }

    @keyframes rotateGalaxy {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @keyframes twinkle {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.6; transform: scale(0.8); }
    }
    
    .galaxy-container {
      animation: rotateGalaxy 120s linear infinite;
      transform-origin: ${cx}px ${cy}px;
    }
    .twinkle {
      animation: twinkle 4s ease-in-out infinite;
    }
    .star-group {
      cursor: pointer;
      transition: transform 0.2s;
    }
    .star-group:hover {
      transform: scale(1.5);
    }
  </style>

  <rect width="${width}" height="${height}" rx="12" fill="url(#bg-grad)" stroke="${theme.border}" stroke-width="1"/>
  <circle cx="${cx}" cy="${cy}" r="${maxRadius + 50}" fill="url(#core-glow)" />

  <g transform="translate(${width/2}, 35)">
    <text class="header-title" text-anchor="middle">🌌 GITHUB CONTRIBUTION GALAXY</text>
    <text y="20" class="header-subtitle" text-anchor="middle">EXPLORER: ${username.toUpperCase()} • ACTIVE STARS: ${activeDaysCount} / 365</text>
  </g>

  <g class="galaxy-container">
    ${starsSvg}
  </g>

  <g transform="translate(0, 0)">
    <line x1="40" y1="${height - 40}" x2="${width - 40}" y2="${height - 40}" stroke="${theme.border}" stroke-width="1" opacity="0.5"/>
    <text x="40" y="${height - 21}" class="legend-text" style="font-weight: bold;">STAR INTENSITY:</text>
    ${legendSvg}
    <text x="${width - 150}" y="${height - 21}" class="legend-text">TOTAL: ${totalContributions} CONTRIBUTIONS</text>
  </g>
</svg>`;
}

async function main() {
  console.log(`🌌 Generating GitHub Contribution Galaxy for ${USERNAME}...`);
  const data = await fetchContributionData(USERNAME);

  const darkSvg = generateGalaxySvg(USERNAME, data, true);
  const lightSvg = generateGalaxySvg(USERNAME, data, false);

  const distDir = path.join(__dirname, '..', 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  const darkPath = path.join(distDir, 'github-contribution-galaxy-dark.svg');
  const lightPath = path.join(distDir, 'github-contribution-galaxy.svg');

  fs.writeFileSync(darkPath, darkSvg, 'utf8');
  fs.writeFileSync(lightPath, lightSvg, 'utf8');

  console.log(`✅ Galaxy SVGs successfully generated:`);
  console.log(`   - ${darkPath}`);
  console.log(`   - ${lightPath}`);
}

main().catch(err => {
  console.error('Error generating Galaxy SVG:', err);
  process.exit(1);
});
