const fs = require('fs');
const https = require('https');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const USERNAME = 'tharunrai';

// Map contribution counts to visual/speed properties
function getLevel(count) {
    if (count === 0) return { level: 0, color: '#161b22', glow: '#161b22', speed: 0.5, name: 'idle' };
    if (count <= 3) return { level: 1, color: '#0e4429', glow: '#0e4429', speed: 1.0, name: 'low' };
    if (count <= 7) return { level: 2, color: '#006d32', glow: '#006d32', speed: 1.5, name: 'medium' };
    if (count <= 15) return { level: 3, color: '#8b5cf6', glow: '#8b5cf6', speed: 2.0, name: 'high' };
    return { level: 4, color: '#39d353', glow: '#39d353', speed: 3.0, name: 'boost' };
}

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
                'User-Agent': 'GitHub-Race-Action'
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

function generateSVG(days) {
    const WIDTH = 1000;
    const HEIGHT = 150;
    const TRACK_START = 50;
    const TRACK_END = 950;
    const TRACK_WIDTH = TRACK_END - TRACK_START;
    
    // Determine how many days to show (e.g. last 45 days)
    const displayDays = days.slice(-45);
    const SEGMENT_WIDTH = TRACK_WIDTH / displayDays.length;

    let timeCostSum = 0;
    const segmentData = displayDays.map((day, i) => {
        const props = getLevel(day.contributionCount);
        // Base time cost is 1 unit. Faster speed means less time cost
        const timeCost = 1.0 / props.speed;
        timeCostSum += timeCost;
        return { ...day, ...props, x: TRACK_START + (i * SEGMENT_WIDTH), width: SEGMENT_WIDTH, timeCost };
    });

    let currentAccumulatedTime = 0;
    let keyframes = `@keyframes carMove {\n`;
    
    // Track SVG elements
    let trackSVG = '';

    segmentData.forEach((seg, i) => {
        // Keyframes for car
        const percentStart = (currentAccumulatedTime / timeCostSum) * 100;
        keyframes += `  ${percentStart.toFixed(2)}% { transform: translateX(${seg.x.toFixed(2)}px); }\n`;
        
        currentAccumulatedTime += seg.timeCost;
        
        const percentEnd = (currentAccumulatedTime / timeCostSum) * 100;
        if (i === segmentData.length - 1) {
            keyframes += `  100% { transform: translateX(${(seg.x + seg.width).toFixed(2)}px); }\n`;
        }

        // Draw track segment
        let strokeWidth = seg.level >= 3 ? 6 : 4;
        let yPos = HEIGHT - 40;
        trackSVG += `<line x1="${seg.x}" y1="${yPos}" x2="${seg.x + seg.width}" y2="${yPos}" stroke="${seg.color}" stroke-width="${strokeWidth}" stroke-linecap="butt" />\n`;
        
        // Add glow / boost pads for high activity
        if (seg.level >= 3) {
            trackSVG += `<line x1="${seg.x}" y1="${yPos}" x2="${seg.x + seg.width}" y2="${yPos}" stroke="${seg.glow}" stroke-width="${strokeWidth + 4}" stroke-linecap="butt" opacity="0.6" filter="url(#glow)" />\n`;
            // Boost arrows
            let arrowX = seg.x + (seg.width / 2);
            trackSVG += `<path d="M ${arrowX-5} ${yPos-10} L ${arrowX+5} ${yPos} L ${arrowX-5} ${yPos+10}" fill="none" stroke="${seg.glow}" stroke-width="2" opacity="0.8" />\n`;
            trackSVG += `<path d="M ${arrowX-10} ${yPos-10} L ${arrowX} ${yPos} L ${arrowX-10} ${yPos+10}" fill="none" stroke="${seg.glow}" stroke-width="2" opacity="0.5" />\n`;
        } else if (seg.level > 0) {
            trackSVG += `<line x1="${seg.x}" y1="${yPos}" x2="${seg.x + seg.width}" y2="${yPos}" stroke="${seg.glow}" stroke-width="${strokeWidth + 2}" stroke-linecap="butt" opacity="0.3" filter="url(#glow)" />\n`;
        }

        // Add subtle grid/milestone markers
        if (i % 5 === 0) {
            trackSVG += `<line x1="${seg.x}" y1="${yPos - 5}" x2="${seg.x}" y2="${yPos + 5}" stroke="#444" stroke-width="2" />\n`;
        }
    });

    keyframes += `}\n`;

    // Car SVG definition
    const carSVG = `
    <g id="car" transform="translate(${TRACK_START}, ${HEIGHT - 50})">
        <!-- Underglow -->
        <rect x="-18" y="8" width="40" height="4" fill="#00ffff" opacity="0.7" filter="url(#glow)" />
        <!-- Car Body -->
        <path d="M -15 -10 Q 0 -15 15 -10 L 25 0 L 25 5 L -20 5 Z" fill="#ffffff" />
        <!-- Cockpit -->
        <path d="M -5 -10 Q 5 -12 12 -5 L 5 0 L -5 0 Z" fill="#0D1117" opacity="0.9" />
        <!-- Wheels -->
        <circle cx="-10" cy="5" r="4" fill="#333" />
        <circle cx="-10" cy="5" r="2" fill="#00ffff" />
        <circle cx="15" cy="5" r="4" fill="#333" />
        <circle cx="15" cy="5" r="2" fill="#00ffff" />
        <!-- Exhaust / Speed Lines (Static tail) -->
        <path d="M -20 2 L -35 2 M -20 5 L -45 5 M -20 0 L -30 0" stroke="#00ffff" stroke-width="1.5" stroke-dasharray="4 2" opacity="0.6">
            <animate attributeName="stroke-dashoffset" from="10" to="0" dur="0.2s" repeatCount="indefinite" />
        </path>
    </g>
    `;

    // Create the final SVG
    const svg = `
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg" style="background-color: #0D1117;">
    <defs>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <style>
            ${keyframes}
            #car {
                /* Total duration approx 8 seconds for a lap */
                animation: carMove 8s linear infinite;
            }
            .title {
                font-family: 'Segoe UI', Arial, sans-serif;
                fill: #c9d1d9;
                font-size: 16px;
                font-weight: 600;
            }
            .subtitle {
                font-family: 'Segoe UI', Arial, sans-serif;
                fill: #8b949e;
                font-size: 12px;
            }
        </style>
    </defs>
    
    <!-- Title -->
    <text x="50" y="30" class="title">🏎️ My Coding Race</text>
    <text x="50" y="50" class="subtitle">Every contribution moves me forward. Every commit is another lap.</text>
    
    <!-- Background Grid / Lines -->
    <line x1="50" y1="${HEIGHT - 40}" x2="950" y2="${HEIGHT - 40}" stroke="#1f242e" stroke-width="2" />
    
    <!-- The Track -->
    ${trackSVG}
    
    <!-- The Car -->
    ${carSVG}
    
</svg>
    `;

    return svg.trim();
}

// Fallback data for testing if no GITHUB_TOKEN is present
const dummyData = Array.from({ length: 45 }).map((_, i) => ({
    contributionCount: Math.floor(Math.random() * (i > 35 ? 20 : 5)),
    date: new Date(Date.now() - (44 - i) * 86400000).toISOString().split('T')[0]
}));

async function main() {
    let days = dummyData;
    
    if (GITHUB_TOKEN) {
        console.log("Fetching contributions from GitHub...");
        try {
            const data = await fetchContributions();
            const weeks = data.data.user.contributionsCollection.contributionCalendar.weeks;
            days = weeks.flatMap(w => w.contributionDays);
            console.log(`Fetched ${days.length} days of data.`);
        } catch (error) {
            console.error("Error fetching data:", error);
            console.log("Using fallback data...");
        }
    } else {
        console.log("No GITHUB_TOKEN found, using generated fallback data.");
    }

    const svg = generateSVG(days);
    
    if (!fs.existsSync('dist')) {
        fs.mkdirSync('dist');
    }
    fs.writeFileSync('dist/race.svg', svg);
    console.log("Successfully generated dist/race.svg");
}

main();
