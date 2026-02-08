const SHEET_ID = '1FqFJqc9eYzOLVMbT0EGwMr13EDYr_lEOKQhDlptkldQ';
const SHEET_GID = '0';
const MAX_WEEK = 4; // Total number of weeks in the challenge

let currentWeek = 1;

// Get column indices for a given week
// Week 1: columns 2, 3, 4, 5 (Run, Swim, Bike, %)
// Week 2+: starts at column 7, then 4 columns per week
function getWeekColumns(week) {
    if (week === 1) {
        return { run: 2, swim: 3, bike: 4, percent: 5 };
    }
    const baseCol = 7 + (week - 2) * 4;
    return { run: baseCol, swim: baseCol + 1, bike: baseCol + 2, percent: baseCol + 3 };
}

// Change week and reload standings
function changeWeek(delta) {
    const newWeek = currentWeek + delta;
    if (newWeek < 1 || newWeek > MAX_WEEK) return;
    
    currentWeek = newWeek;
    document.getElementById('week-title').textContent = `Week ${currentWeek}`;
    
    // Update chevron states
    document.getElementById('week-prev').classList.toggle('disabled', currentWeek === 1);
    document.getElementById('week-next').classList.toggle('disabled', currentWeek === MAX_WEEK);
    
    loadStandings();
}

// Returns a color from red (0%) to green (100%)
function getPercentColor(percent) {
    // Clamp percent between 0 and 1
    const p = Math.max(0, Math.min(1, percent));
    // Red: #ef4444 (239, 68, 68), Green: #22c55e (34, 197, 94)
    const r = Math.round(239 + (34 - 239) * p);
    const g = Math.round(68 + (197 - 68) * p);
    const b = Math.round(68 + (94 - 68) * p);
    return `rgb(${r}, ${g}, ${b})`;
}

async function loadStandings() {
    const container = document.getElementById('standings-list');
    const combinedContainer = document.getElementById('combined-list');
    container.innerHTML = '<div class="standings-loading">Loading standings...</div>';
    combinedContainer.innerHTML = '';
    
    try {
        // Fetch data using Google Visualization API (requires sheet to be published)
        const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${SHEET_GID}`;
        const response = await fetch(url);
        const text = await response.text();
        
        // Parse the JSONP-like response
        const jsonString = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?/);
        if (!jsonString) {
            throw new Error('Could not parse response. Make sure the sheet is published to web.');
        }
        
        const data = JSON.parse(jsonString[1]);
        const rows = data.table.rows;
        
        // Get column indices for current week
        const cols = getWeekColumns(currentWeek);
        
        // Row 0 is header, rows 1+ are participants
        const participants = [];
        let combined = null;
        
        for (let i = 1; i < rows.length; i++) {
            if (rows[i] && rows[i].c && rows[i].c[0]) {
                const row = rows[i].c;
                const name = row[0]?.v || '';
                const run = parseFloat(row[cols.run]?.v) || 0;
                const swim = parseFloat(row[cols.swim]?.v) || 0;
                const bike = parseFloat(row[cols.bike]?.v) || 0;
                const percent = parseFloat(row[cols.percent]?.v) || 0;
                
                // Capture Combined row
                if (name === 'Combined') {
                    combined = { name, run, swim, bike, percent };
                    continue;
                }
                
                // Skip non-participant rows
                const skipNames = ['Log Your Activity', 'Log Your Acitivity', ''];
                if (name && !skipNames.includes(name)) {
                    participants.push({ name, run, swim, bike, percent });
                }
            }
        }
        
        // Sort by percentage descending, then alphabetically by name
        participants.sort((a, b) => {
            if (b.percent !== a.percent) return b.percent - a.percent;
            return a.name.localeCompare(b.name);
        });
        
        // Render standings table
        let html = `
            <table class="standings-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>🏃</th>
                        <th>🏊</th>
                        <th>🚴</th>
                        <th>%</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        participants.forEach((p) => {
            const runClass = p.run > 0 ? '' : 'zero';
            const swimClass = p.swim > 0 ? '' : 'zero';
            const bikeClass = p.bike > 0 ? '' : 'zero';
            
            html += `
                <tr>
                    <td class="standing-name">${p.name}</td>
                    <td class="standing-miles ${runClass}">${p.run.toFixed(1)}</td>
                    <td class="standing-miles ${swimClass}">${p.swim.toFixed(2)}</td>
                    <td class="standing-miles ${bikeClass}">${p.bike.toFixed(1)}</td>
                    <td class="standing-percent" style="color: ${getPercentColor(p.percent)}">${(p.percent * 100).toFixed(0)}%</td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
        
        container.innerHTML = html || '<div class="standings-error">No data found</div>';
        
        // Render combined table
        if (combined) {
            const runClass = combined.run > 0 ? '' : 'zero';
            const swimClass = combined.swim > 0 ? '' : 'zero';
            const bikeClass = combined.bike > 0 ? '' : 'zero';
            
            combinedContainer.innerHTML = `
                <table class="standings-table">
                    <tbody>
                        <tr>
                            <td class="standing-name">${combined.name}</td>
                            <td class="standing-miles ${runClass}">${combined.run.toFixed(1)}</td>
                            <td class="standing-miles ${swimClass}">${combined.swim.toFixed(2)}</td>
                            <td class="standing-miles ${bikeClass}">${combined.bike.toFixed(1)}</td>
                            <td class="standing-percent" style="color: ${getPercentColor(combined.percent)}">${(combined.percent * 100).toFixed(0)}%</td>
                        </tr>
                    </tbody>
                </table>
            `;
        }
        
    } catch (error) {
        console.error('Error loading standings:', error);
        container.innerHTML = `
            <div class="standings-error">
                Unable to load standings.<br>
                <small>Sheet must be published to web:<br>
                File → Share → Publish to web</small>
            </div>
        `;
    }
}

// Initialize on page load
loadStandings();

// Attach event listeners
document.getElementById('week-prev').addEventListener('click', () => changeWeek(-1));
document.getElementById('week-next').addEventListener('click', () => changeWeek(1));
document.getElementById('refresh-btn').addEventListener('click', loadStandings);

// Initialize chevron states
document.getElementById('week-prev').classList.add('disabled');

// Register service worker for offline support and auto-updates
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('Service worker registered'))
        .catch((err) => console.log('Service worker registration failed:', err));
}
