const SHEET_ID = '1FqFJqc9eYzOLVMbT0EGwMr13EDYr_lEOKQhDlptkldQ';
const SHEET_GID = '0';
const MAX_WEEK = 6; // Total number of weeks in the challenge
const GOOGLE_CLIENT_ID =
  "1007696024316-hcqq52qbrp4l5fl8mna3aq5juegbscts.apps.googleusercontent.com";

const EMAIL_TO_NAME = {
    'green.rabite@gmail.com': 'Andy',
    'christopherkha@gmail.com': 'Ckha',
    'amchu3@gmail.com': 'Amanda',
    'harrisonseung@gmail.com': 'Harrison',
    'dgcho8@gmail.com': 'Dcho',
    'spencerla@gmail.com': 'Spencer',
    'chanmaricela@gmail.com': 'Maricela'
};

function getSignedInName() {
    const saved = localStorage.getItem('cardio_user');
    if (!saved) return null;
    const user = JSON.parse(saved);
    return EMAIL_TO_NAME[user.email] || null;
}

// Week date ranges - populated from spreadsheet header row
let weekDates = [''];
let weekInitialized = false;

let currentWeek = 1;
let currentParticipants = [];
let sortColumn = 'activeDays';
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
// NOTE: These are 0-based indices into rows[i].c from the gviz response.
// Week 1: indices 6,7,8 (run equivalent miles, Active Days, %)
// Week 2+: starts at index 13,14,15, then 5 columns per week (5 data + 1 separator)
function getWeekColumns(week) {
    if (week === 1) {
        return { run: 6, swim: -1, bike: -1, activeDays: 7, percent: 8 };
    }
    const baseCol = 13 + (week - 2) * 7;
    return {
        run: baseCol,
        swim: -1,
        bike: -1,
        activeDays: baseCol + 1,
        percent: baseCol + 2
    };
}

// Get date column indices for a given week
// NOTE: These are 0-based indices into rows[0].c from the gviz response.
// Week 1: indices 4 & 5, Week 2: 11 & 12, Week 3: 18 & 19, etc (offset by 6 each week)
function getWeekDateColumns(week) {
    const baseCol = 4 + (week - 1) * 7;
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
            </tr>
        `).join('');

    const headers = `<thead>
                <tr>
                    <th>Name</th>
                    <th>Run Eq Mi</th>
                    <th>Active</th>
                    <th>🔋</th>
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
    sortAsc = column === 'name';
    renderStandings();
}

function getBatteryRank(percent, activeDays) {
    if (percent >= 1 && activeDays >= 3) return 2; // full
    if (activeDays <= 1 && percent < 0.2) return 0; // low
    return 1; // charging/in progress
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
        const primary = sortAsc ? cmp : -cmp;
        if (primary !== 0 || sortColumn === 'name') return primary;
        return a.name.localeCompare(b.name);
    });

    let html = `
        <table class="standings-table">
            <thead>
                <tr>
                    <th class="sortable sort-name${sortColumn === 'name' ? ' active' : ''}" onclick="sortBy('name')">Name</th>
                    <th class="sortable${sortColumn === 'run' ? ' active' : ''}" onclick="sortBy('run')">Run Eq Mi</th>
                    <th class="sortable active-days-header${sortColumn === 'activeDays' ? ' active' : ''}" onclick="sortBy('activeDays')">Active</th>
                    <th class="sortable${sortColumn === 'batteryRank' ? ' active' : ''}" onclick="sortBy('batteryRank')">🔋</th>
                </tr>
            </thead>
            <tbody>
    `;

    const signedInName = getSignedInName();

    sorted.forEach((p) => {
        const runClass = p.run > 0 ? '' : 'zero';
        const activeDaysClass = p.activeDays >= 3 ? 'good' : (p.activeDays > 0 ? '' : 'zero');
        const fullBattery = p.batteryRank === 2;
        const emptyBattery = p.batteryRank === 0;
        const batteryEmoji = fullBattery ? '🔋' : (emptyBattery ? '🪫' : '⚡');
        const batteryClass = fullBattery ? 'full' : (emptyBattery ? 'empty' : 'progress');
        const isMe = signedInName && p.name === signedInName;

        html += `
            <tr class="${isMe ? 'highlight-me' : ''}">
                <td class="standing-name">${p.name}</td>
                <td class="standing-miles ${runClass}">${p.run.toFixed(1)}</td>
                <td class="standing-active-days ${activeDaysClass}">${p.activeDays.toFixed(0)}</td>
                <td class="standing-battery-emoji ${batteryClass}">${batteryEmoji}</td>
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
                const activeDays = parseFloat(row[cols.activeDays]?.v) || 0;
                const percent = parseFloat(row[cols.percent]?.v) || 0;
                const batteryRank = getBatteryRank(percent, activeDays);
                
                // Capture Combined row
                if (name === 'Combined') {
                    combined = { name, run, activeDays, percent, batteryRank };
                    continue;
                }
                
                // Skip non-participant rows
                const skipNames = ['Log Your Activity', 'Log Your Acitivity', ''];
                if (name && !skipNames.includes(name)) {
                    participants.push({ name, run, activeDays, percent, batteryRank });
                }
            }
        }
        
        currentParticipants = participants;
        sortColumn = 'activeDays';
        sortAsc = false;
        renderStandings();
        
        // Render combined table
        if (combined) {
            const runClass = combined.run > 0 ? '' : 'zero';
            const activeDaysClass = combined.activeDays >= 3 ? 'good' : (combined.activeDays > 0 ? '' : 'zero');
            const everyoneFullBattery = participants.length > 0 && participants.every((p) => p.batteryRank === 2);
            const combinedBatterySprite = everyoneFullBattery
                ? '<img src="./assets/cloud.gif" class="battery-sprite" alt="Everyone full battery">'
                : '<img src="./assets/nu.gif" class="battery-sprite nu-sprite" alt="Not everyone full battery">';
            combinedContainer.innerHTML = `
                <table class="standings-table">
                    <tbody>
                        <tr>
                            <td class="standing-name">${combined.name}</td>
                            <td class="standing-miles ${runClass}">${combined.run.toFixed(1)}</td>
                            <td class="standing-active-days ${activeDaysClass}">${combined.activeDays.toFixed(0)}</td>
                            <td class="standing-battery">${combinedBatterySprite}</td>
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

// Google Sign-In
function decodeJwt(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(atob(base64).split('').map(
        c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
    ).join('')));
}

function showUserProfile(user) {
    document.getElementById('google-signin-btn').classList.add('hidden');
    const profile = document.getElementById('user-profile');
    profile.classList.remove('hidden');
    document.getElementById('user-avatar').src = user.picture;
    document.getElementById('user-name').textContent = user.name;
}

function showSignInButton() {
    document.getElementById('user-profile').classList.add('hidden');
    const btnContainer = document.getElementById('google-signin-btn');
    btnContainer.classList.remove('hidden');
    btnContainer.innerHTML = '';
    if (typeof google !== 'undefined') {
        google.accounts.id.renderButton(btnContainer, {
            theme: 'filled_black',
            size: 'medium',
            shape: 'pill',
            width: 200
        });
    }
}

function handleCredentialResponse(response) {
    const user = decodeJwt(response.credential);
    const userData = { name: user.name, picture: user.picture, email: user.email };
    localStorage.setItem('cardio_user', JSON.stringify(userData));
    showUserProfile(userData);
    updateQuickLogState();
    if (currentParticipants.length) renderStandings();
    document.getElementById('update-modal').classList.add('hidden');
}

function signOut() {
    localStorage.removeItem('cardio_user');
    if (typeof google !== 'undefined') {
        google.accounts.id.disableAutoSelect();
    }
    showSignInButton();
    updateQuickLogState();
    if (currentParticipants.length) renderStandings();
}

const SPINNER_HTML = '<div class="signin-spinner"></div>';

function showSpinners() {
    const header = document.getElementById('google-signin-btn');
    if (!header.querySelector('.signin-spinner') && !header.classList.contains('hidden')) {
        header.innerHTML = SPINNER_HTML;
    }
}

function initGoogleSignIn() {
    const savedUser = localStorage.getItem('cardio_user');
    if (savedUser) {
        showUserProfile(JSON.parse(savedUser));
        return;
    }

    showSpinners();

    if (typeof google === 'undefined') {
        setTimeout(initGoogleSignIn, 100);
        return;
    }
    google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        auto_select: true
    });

    showSignInButton();
}

document.getElementById('sign-out-btn').addEventListener('click', signOut);
initGoogleSignIn();

// Update modal
function showUpdateModal() {
    const isLoggedIn = localStorage.getItem('cardio_user');
    const shouldHide = localStorage.getItem('shouldHideModal');
    if (isLoggedIn || shouldHide) return;

    const modal = document.getElementById('update-modal');
    modal.classList.remove('hidden');

    const modalBtn = document.getElementById('modal-signin-btn');
    if (typeof google !== 'undefined') {
        google.accounts.id.renderButton(modalBtn, {
            theme: 'filled_black',
            size: 'large',
            shape: 'pill',
            width: 250
        });
    } else {
        modalBtn.innerHTML = SPINNER_HTML;
        const waitForGoogle = setInterval(() => {
            if (typeof google !== 'undefined') {
                clearInterval(waitForGoogle);
                modalBtn.innerHTML = '';
                google.accounts.id.renderButton(modalBtn, {
                    theme: 'filled_black',
                    size: 'large',
                    shape: 'pill',
                    width: 250
                });
            }
        }, 100);
    }

    document.getElementById('modal-close').addEventListener('click', () => {
        if (document.getElementById('modal-dont-show').checked) {
            localStorage.setItem('shouldHideModal', 'true');
        }
        modal.classList.add('hidden');
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            if (document.getElementById('modal-dont-show').checked) {
                localStorage.setItem('shouldHideModal', 'true');
            }
            modal.classList.add('hidden');
        }
    });
}

showUpdateModal();

// Toast
function showToast(message, duration = 2500) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.classList.add('hidden'), 300);
    }, duration);
}

function updateQuickLogState() {
    const btn = document.getElementById('quick-log-btn');
    const isLoggedIn = !!localStorage.getItem('cardio_user');
    btn.disabled = !isLoggedIn;
    btn.title = isLoggedIn ? 'Log activity' : 'Sign in to use Quick Log';
}

// Quick Log modal — posts to Apps Script → spreadsheet
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbzx3lznvrc4EpRkFVQM8KZe9bDtxVqh9KG8J-UL2o4yVwLQ9kLLto_oBfCPxGgUrRMm/exec";

(function initQuickLog() {
    const modal = document.getElementById('quick-log-modal');
    const openBtn = document.getElementById('quick-log-btn');
    const closeBtn = document.getElementById('quick-log-close');
    const form = document.getElementById('quick-log-form');
    const activityInput = document.getElementById('log-activity');
    const milesInput = document.getElementById('log-miles');
    const dateInput = document.getElementById('log-date');
    const submitBtn = document.getElementById('quick-log-submit');
    const statusEl = document.getElementById('form-status');

    function getLocalDateInputValue(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    dateInput.value = getLocalDateInputValue();

    updateQuickLogState();

    document.querySelectorAll('.activity-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.activity-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            activityInput.value = btn.dataset.value;
        });
    });

    function openModal() {
        if (openBtn.disabled) return;
        modal.classList.remove('hidden');
    }

    function closeModal() {
        modal.classList.add('hidden');
    }

    function resetForm() {
        form.reset();
        dateInput.value = getLocalDateInputValue();
        document.querySelectorAll('.activity-btn').forEach(b => b.classList.remove('selected'));
        activityInput.value = '';
        statusEl.classList.add('hidden');
        statusEl.className = 'form-status hidden';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit';
    }

    openBtn.addEventListener('click', openModal);
    openBtn.parentElement.addEventListener('click', () => {
        if (openBtn.disabled) showToast('Sign in to log activity');
    });
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!activityInput.value) {
            statusEl.textContent = 'Please select an activity.';
            statusEl.className = 'form-status error';
            statusEl.classList.remove('hidden');
            return;
        }

        const milesRaw = milesInput.value.trim();
        const miles = milesRaw === '' ? '' : parseFloat(milesRaw);
        if (milesRaw !== '' && (!Number.isFinite(miles) || miles <= 0)) {
            statusEl.textContent = 'Please enter a valid distance.';
            statusEl.className = 'form-status error';
            statusEl.classList.remove('hidden');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting…';
        statusEl.classList.add('hidden');

        const user = JSON.parse(localStorage.getItem('cardio_user'));
        const [y, m, d] = dateInput.value.split('-');
        const dateFormatted = `${parseInt(m)}/${parseInt(d)}/${y}`;

        try {
            const res = await fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({
                    email: user.email,
                    activity: activityInput.value,
                    miles: miles,
                    date: dateFormatted,
                }),
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);

            statusEl.textContent = 'Activity logged!';
            statusEl.className = 'form-status success';
            statusEl.classList.remove('hidden');
            submitBtn.textContent = 'Submitted';
            setTimeout(() => {
                closeModal();
                resetForm();
            }, 1200);
        } catch {
            statusEl.textContent = 'Something went wrong. Try again.';
            statusEl.className = 'form-status error';
            statusEl.classList.remove('hidden');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit';
        }
    });
})();

// Swim Calculator modal
(function initSwimCalc() {
    const modal = document.getElementById('swim-calc-modal');
    const openBtn = document.getElementById('swim-calc-btn');
    const closeBtn = document.getElementById('swim-calc-close');
    const yardInput = document.getElementById('swim-yard-per-lap');
    const lapInput = document.getElementById('swim-laps');
    const resultEl = document.getElementById('swim-result');
    const milesEl = document.getElementById('swim-miles');
    const copyBtn = document.getElementById('swim-copy');

    function calculate() {
        const yards = parseInt(yardInput.value) || 0;
        const laps = parseInt(lapInput.value) || 0;
        if (laps > 0 && yards > 0) {
            const miles = (yards * laps) / 1760;
            milesEl.textContent = miles.toFixed(2);
            resultEl.classList.remove('hidden');
        } else {
            resultEl.classList.add('hidden');
        }
    }

    yardInput.addEventListener('input', calculate);
    lapInput.addEventListener('input', calculate);

    openBtn.addEventListener('click', () => modal.classList.remove('hidden'));
    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    });

    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(milesEl.textContent).then(() => {
            showToast('Copied to clipboard');
        });
    });
})();

// Register service worker for offline support and auto-updates
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('Service worker registered'))
        .catch((err) => console.log('Service worker registration failed:', err));
}
