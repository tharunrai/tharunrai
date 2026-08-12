const fs = require('fs');
const https = require('https');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const USERNAME = 'tharunrai';

const CELL_SIZE = 10;
const CELL_GAP = 3;
const CELL_STEP = CELL_SIZE + CELL_GAP;
const WIDTH = 53 * CELL_STEP + 40;
const HEIGHT = 7 * CELL_STEP + 40;

function getColor(count) {
    if (count === 0) return '#161b22';
    if (count <= 3) return '#0e4429';
    if (count <= 7) return '#006d32';
    if (count <= 15) return '#26a641';
    return '#39d353';
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

function generateSVG(weeksData) {
    let gridSVG = '';
    let targets = [];

    // Offset for the grid rendering
    const OFFSET_X = 20;
    const OFFSET_Y = 20;

    weeksData.forEach((week, wIdx) => {
        week.contributionDays.forEach((day) => {
            const x = OFFSET_X + wIdx * CELL_STEP;
            const y = OFFSET_Y + day.weekday * CELL_STEP;
            const color = getColor(day.contributionCount);
            
            gridSVG += `<rect x="${x}" y="${y}" width="${CELL_SIZE}" height="${CELL_SIZE}" fill="${color}" rx="2" />\n`;
            
            if (day.contributionCount > 0) {
                targets.push({ x: x + CELL_SIZE/2, y: y + CELL_SIZE/2, wIdx, weekday: day.weekday });
            }
        });
    });

    // Sort targets to sweep left-to-right, snaking up and down
    targets.sort((a, b) => {
        if (a.wIdx !== b.wIdx) return a.wIdx - b.wIdx;
        return a.wIdx % 2 === 0 ? a.weekday - b.weekday : b.weekday - a.weekday;
    });

    // Generate Path
    let pathD = `M ${OFFSET_X - 20} ${OFFSET_Y + 3 * CELL_STEP}`; // start outside left, middle
    let currentPos = { x: OFFSET_X - 20, y: OFFSET_Y + 3 * CELL_STEP };

    targets.forEach(target => {
        // Move horizontally then vertically to create L-shaped turns (looks better for a car)
        if (currentPos.x !== target.x) {
            pathD += ` L ${target.x} ${currentPos.y}`;
        }
        if (currentPos.y !== target.y) {
            pathD += ` L ${target.x} ${target.y}`;
        }
        currentPos = target;
    });

    // Exit right
    pathD += ` L ${WIDTH + 20} ${currentPos.y}`;

    const carSVG = `
    <g id="car">
        <!-- Wheels -->
        <rect x="-5" y="-6" width="4" height="2" fill="#000" rx="1" />
        <rect x="2" y="-6" width="4" height="2" fill="#000" rx="1" />
        <rect x="-5" y="4" width="4" height="2" fill="#000" rx="1" />
        <rect x="2" y="4" width="4" height="2" fill="#000" rx="1" />
        <!-- Body -->
        <path d="M-6,-4 L3,-4 L7,0 L3,4 L-6,4 Z" fill="#ffffff" />
        <!-- Window -->
        <path d="M-2,-3 L2,-3 L4,0 L2,3 L-2,3 Z" fill="#0D1117" />
        <!-- Spoiler -->
        <rect x="-7" y="-4" width="2" height="8" fill="#ff5e00" />
        <!-- Neon Trail -->
        <path d="M-20,0 L-7,0" stroke="#00ffff" stroke-width="1.5" stroke-dasharray="3 2" opacity="0.6">
            <animate attributeName="stroke-dashoffset" from="5" to="0" dur="0.2s" repeatCount="indefinite" />
        </path>
    </g>
    `;

    // Calculate animation duration based on path length (rough estimate)
    // For 52 weeks, the car traverses roughly 52 columns + vertical zig zags.
    // Let's set a fixed duration of around 15 seconds for a smooth continuous run.
    const duration = "15s";

    const svg = `
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg" style="background-color: #0D1117;">
    <style>
        .title { font-family: 'Segoe UI', Arial, sans-serif; fill: #c9d1d9; font-size: 14px; font-weight: 600; }
        .grid { opacity: 0.8; }
    </style>
    
    <!-- Background Grid -->
    <g class="grid">
        ${gridSVG}
    </g>

    <!-- Invisible Path for the car to follow -->
    <path id="route" d="${pathD}" fill="none" stroke="none" />
    
    <!-- The Car -->
    ${carSVG}
    
    <!-- Animate the Car along the Path -->
    <use href="#car">
        <animateMotion dur="${duration}" repeatCount="indefinite" rotate="auto">
            <mpath href="#route" />
        </animateMotion>
    </use>
</svg>
    `;

    return svg.trim();
}

// Fallback data for testing if no GITHUB_TOKEN is present
function getDummyData() {
    const weeks = [];
    for (let w = 0; w < 53; w++) {
        const days = [];
        for (let d = 0; d < 7; d++) {
            days.push({
                contributionCount: Math.random() > 0.6 ? Math.floor(Math.random() * 10) : 0,
                weekday: d
            });
        }
        weeks.push({ contributionDays: days });
    }
    return weeks;
}

async function main() {
    let weeksData = getDummyData();
    
    if (GITHUB_TOKEN) {
        console.log("Fetching contributions from GitHub...");
        try {
            const data = await fetchContributions();
            weeksData = data.data.user.contributionsCollection.contributionCalendar.weeks;
            console.log(`Fetched data successfully.`);
        } catch (error) {
            console.error("Error fetching data:", error);
            console.log("Using fallback data...");
        }
    } else {
        console.log("No GITHUB_TOKEN found, using generated fallback data.");
    }

    const svg = generateSVG(weeksData);
    
    if (!fs.existsSync('dist')) {
        fs.mkdirSync('dist');
    }
    fs.writeFileSync('dist/grid-race.svg', svg);
    console.log("Successfully generated dist/grid-race.svg");
}

main();
