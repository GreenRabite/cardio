const SHEET_ID = '1FqFJqc9eYzOLVMbT0EGwMr13EDYr_lEOKQhDlptkldQ';
const SHEET_GID = '0';
const MAX_WEEK = 4; // Total number of weeks in the challenge

// Week date ranges - populated from spreadsheet header row
let weekDates = [''];
let weekInitialized = false;

let currentWeek = 1;
let currentParticipants = [];
let sortColumn = 'percent';
let sortAsc = false;

// Parse date string (MM/DD) into a Date object for current year
function parseWeekDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.trim().split('-');
    if (parts.length !== 2) return null;
    const month = parseInt(parts[0], 10) - 1; // 0-indexed
    const day = parseInt(parts[1], 10);
    const year = new Date().getFullYear();
    return new Date(year, month, day);
}

// Determine which week we're in based on the dates from spreadsheet
function determineCurrentWeek() {
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Compare dates only
    
    for (let week = 1; week <= MAX_WEEK; week++) {
        const dateRange = weekDates[week];
        if (!dateRange) continue;
        
        const [startStr, endStr] = dateRange.split(' to ');
        const startDate = parseWeekDate(startStr);
        const endDate = parseWeekDate(endStr);

        if (startDate && endDate) {
            endDate.setHours(23, 59, 59, 999); // Include full end day
            if (now >= startDate && now <= endDate) {
                return week;
            }
        }
    }
    
    // If not in any week range, check if before or after
    const firstStart = parseWeekDate(weekDates[1]?.split(' to ')[0]);
    if (firstStart && now < firstStart) return 1;
    
    return MAX_WEEK; // Default to last week if after
}

// Get column indices for a given week
// Week 1: columns 2, 3, 4, 5 (Run, Swim, Bike, %)
// Week 2+: starts at column 7, then 5 columns per week (4 data + 1 separator)
function getWeekColumns(week) {
    if (week === 1) {
        return { run: 2, swim: 3, bike: 4, percent: 5 };
    }
    const baseCol = 7 + (week - 2) * 5;
    return { run: baseCol, swim: baseCol + 1, bike: baseCol + 2, percent: baseCol + 3 };
}

// Get date column indices for a given week
// Week 1: cols 3 & 4, Week 2: cols 8 & 9, etc. (offset by 5 each week)
function getWeekDateColumns(week) {
    const baseCol = 3 + (week - 1) * 5;
    return { start: baseCol, end: baseCol + 1 };
}

// Format date from spreadsheet (handles Date objects or strings)
function formatDate(value) {
    if (!value) return '';
    if (value instanceof Date) {
        return `${String(value.getMonth() + 1).padStart(2, '0')}/${String(value.getDate()).padStart(2, '0')}`;
    }
    // If it's already a formatted string, return as-is
    return String(value);
}

// Update week title and subtitle
function updateWeekDisplay(week) {
    document.getElementById('week-title').textContent = `Week ${week}`;
    document.getElementById('week-subtitle').textContent = weekDates[week] || '';
}

// Change week and reload standings
function changeWeek(delta) {
    const newWeek = currentWeek + delta;
    if (newWeek < 1 || newWeek > MAX_WEEK) return;
    
    currentWeek = newWeek;
    updateWeekDisplay(currentWeek);
    
    // Update chevron states
    document.getElementById('week-prev').classList.toggle('disabled', currentWeek === 1);
    document.getElementById('week-next').classList.toggle('disabled', currentWeek === MAX_WEEK);
    
    loadStandings();
}

// Generate skeleton loading HTML
function getSkeletonHTML(rows = 6, excludeHeaders = false) {
    const skeletonRows = Array.from({ length: rows }, () => `
            <tr class="skeleton-row">
                <td><div class="skeleton-bar name"></div></td>
                <td><div class="skeleton-bar number"></div></td>
                <td><div class="skeleton-bar number"></div></td>
                <td><div class="skeleton-bar number"></div></td>
                <td><div class="skeleton-bar percent"></div></td>
                <td></td>
            </tr>
        `).join('');

    const headers = `<thead>
                <tr>
                    <th>Name</th>
                    <th>🏃</th>
                    <th>🏊</th>
                    <th>🚴</th>
                    <th>%</th>
                    <th></th>
                </tr>
            </thead>`;
    return `
        <table class="standings-table">
            ${excludeHeaders ? '' : headers}
            <tbody>
                ${skeletonRows}
            </tbody>
        </table>
    `;
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

function sortBy(column) {
    sortColumn = column;
    sortAsc = false;
    renderStandings();
}

function renderStandings() {
    const container = document.getElementById('standings-list');
    const sorted = [...currentParticipants].sort((a, b) => {
        let cmp;
        if (sortColumn === 'name') {
            cmp = a.name.localeCompare(b.name);
        } else {
            cmp = a[sortColumn] - b[sortColumn];
        }
        return sortAsc ? cmp : -cmp;
    });

    let html = `
        <table class="standings-table">
            <thead>
                <tr>
                    <th class="sortable sort-name${sortColumn === 'name' ? ' active' : ''}" onclick="sortBy('name')">Name</th>
                    <th class="sortable${sortColumn === 'run' ? ' active' : ''}" onclick="sortBy('run')">🏃</th>
                    <th class="sortable${sortColumn === 'swim' ? ' active' : ''}" onclick="sortBy('swim')">🏊</th>
                    <th class="sortable${sortColumn === 'bike' ? ' active' : ''}" onclick="sortBy('bike')">🚴</th>
                    <th class="sortable${sortColumn === 'percent' ? ' active' : ''}" onclick="sortBy('percent')">%</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
    `;

    sorted.forEach((p) => {
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
                <td></td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html || '<div class="standings-error">No data found</div>';
}

async function loadStandings() {
    const container = document.getElementById('standings-list');
    const combinedContainer = document.getElementById('combined-list');
    container.innerHTML = getSkeletonHTML(7);
    combinedContainer.innerHTML = getSkeletonHTML(1, true);
    
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

        // Parse dates from header row (row 0) for all weeks
        const headerRow = rows[0]?.c || [];
        weekDates = [''];  // Reset, index 0 is placeholder
        for (let week = 1; week <= MAX_WEEK; week++) {
            const dateCols = getWeekDateColumns(week);
            const startDate = headerRow[dateCols.start]?.f;
            const endDate = headerRow[dateCols.end]?.f;
            
            if (startDate && endDate) {
                weekDates[week] = `${formatDate(startDate)} to ${formatDate(endDate)}`;
            } else {
                weekDates[week] = '';
            }
        }
        
        // On first load, determine correct week based on current date
        if (!weekInitialized) {
            weekInitialized = true;
            const detectedWeek = determineCurrentWeek();
            if (detectedWeek !== currentWeek) {
                currentWeek = detectedWeek;
                // Update chevron states
                document.getElementById('week-prev').classList.toggle('disabled', currentWeek === 1);
                document.getElementById('week-next').classList.toggle('disabled', currentWeek === MAX_WEEK);
                // Re-load with correct week's data
                updateWeekDisplay(currentWeek);
                return loadStandings();
            }
        }
        
        // Update week title and subtitle
        updateWeekDisplay(currentWeek);
        
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
        
        currentParticipants = participants;
        sortColumn = 'percent';
        sortAsc = false;
        renderStandings();
        
        // Render combined table
        if (combined) {
            const runClass = combined.run > 0 ? '' : 'zero';
            const swimClass = combined.swim > 0 ? '' : 'zero';
            const bikeClass = combined.bike > 0 ? '' : 'zero';
            
            const combinedBattery = combined.percent >= 1
                ? '<img src="./assets/cloud.gif" class="battery-sprite" alt="100%">'
                : '<img src="./assets/nu.gif" class="battery-sprite nu-sprite" alt="">';
            combinedContainer.innerHTML = `
                <table class="standings-table">
                    <tbody>
                        <tr>
                            <td class="standing-name">${combined.name}</td>
                            <td class="standing-miles ${runClass}">${combined.run.toFixed(1)}</td>
                            <td class="standing-miles ${swimClass}">${combined.swim.toFixed(2)}</td>
                            <td class="standing-miles ${bikeClass}">${combined.bike.toFixed(1)}</td>
                            <td class="standing-percent" style="color: ${getPercentColor(combined.percent)}">${(combined.percent * 100).toFixed(0)}%</td>
                            <td class="standing-battery">${combinedBattery}</td>
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

// Register service worker for offline support and auto-updates
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('Service worker registered'))
        .catch((err) => console.log('Service worker registration failed:', err));
}
