// =============================================
// Authentication functionality (auth.js)
// =============================================
const API_BASE_URL = 'https://learn.zone01kisumu.ke';
const AUTH_ENDPOINT = '/api/auth/signin';
const GRAPHQL_ENDPOINT = '/api/graphql-engine/v1/graphql';
const TOKEN_KEY = 'auth_token';

// Check if user is logged in
function isLoggedIn() {
    return localStorage.getItem(TOKEN_KEY) !== null;
}

// Logout function
function logout() {
    localStorage.removeItem(TOKEN_KEY);
    const profileView = document.getElementById('profile-view');
    const loginView = document.getElementById('login-view');
    profileView.classList.add('fade-out');
    // After animation, show login view and hide profile view
    setTimeout(() => {
        profileView.classList.remove('fade-out');
        profileView.style.display = 'none';
        loginView.style.display = 'block';
        loginView.classList.remove('fade-in'); // Remove fade-in if present
        document.title = 'Profile - Login';
        reloadPage();
    }, 500); // Match the animation duration
}

function reloadPage() {
    window.location.reload();
}

// Parse JWT token
function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error('Error parsing JWT:', e);
        return null;
    }
}

// =============================================
// GraphQL API functionality (api.js)
// =============================================

// Get the authentication token
function getAuthToken() {
    return localStorage.getItem(TOKEN_KEY);
}

// Get the user ID from JWT token
function getUserId() {
    const token = getAuthToken();
    if (!token) return null;
    
    const decoded = parseJwt(token);
    return decoded?.sub || null;
}

// Function to execute GraphQL queries
async function executeQuery(query, variables = {}) {
    const token = getAuthToken();
    console.log(token)
    
    if (!token) {
        throw new Error('Not authenticated');
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}${GRAPHQL_ENDPOINT}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                query,
                variables
            })
        });
        
        if (!response.ok) {
            throw new Error('GraphQL request failed');
        }
        
        const data = await response.json();
        
        if (data.errors) {
            throw new Error(data.errors[0].message);
        }
        
        return data.data;
    } catch (error) {
        console.error('GraphQL Error:', error);
        throw error;
    }
}

// Query user information
async function fetchUserInfo() {
    const query = `
        {
            user {
                id
                login
            }
        }
    `;
    
    return executeQuery(query);
}

// Query XP information
async function fetchXpData() {
    const query = `
        {
            transaction(where: {type: {_eq: "xp"} eventId: { _eq: 75 }}) {
                id
                amount
                createdAt
                path
                objectId
                object {
                    name
                    type
                }
            }
        }
    `;
    
    return executeQuery(query);
}

// Query progress information
async function fetchProgressData() {
    const query = `
        {
            progress {
                id
                userId
                objectId
                grade
                createdAt
                updatedAt
                path
                object {
                    name
                    type
                }
            }
        }
    `;
    
    return executeQuery(query);
}

// Query result information
async function fetchResultData() {
    const query = `
        {
            result {
                id
                objectId
                userId
                grade
                createdAt
                updatedAt
                path
                object {
                    name
                    type
                }
            }
        }
    `;
    
    return executeQuery(query);
}

// =============================================
// Profile page functionality (profile.js)
// =============================================

// Load and display user information
async function loadUserInfo() {
    try {
        const data = await fetchUserInfo();
        const user = data.user[0];
        
        // Update username in header
        document.getElementById('user-name').textContent = user.login;
        
        // Update user details section
        const userDetails = document.getElementById('user-details');
        userDetails.innerHTML = `
            <div class="user-card">
                <h3>${user.login}</h3>
                <p>User ID: ${user.id}</p>
                <p>Account Status: Active</p>
            </div>
        `;
        
        return user;
    } catch (error) {
        console.error('Error loading user info:', error);
        throw error;
    }
}

// Load and display XP data
async function loadXpData() {
    try {
        const data = await fetchXpData();
        const transactions = data.transaction;
        
        // Calculate total XP
        const totalXP = transactions.reduce((sum, t) => sum + t.amount, 0);
        
        // Group XP by path (project)
        const xpByProject = {};
        transactions.forEach(t => {
            const pathParts = t.path.split('/');
            const project = pathParts[pathParts.length - 1];
            if (!xpByProject[project]) {
                xpByProject[project] = 0;
            }
            xpByProject[project] += t.amount;
        });
        
        // Sort projects by XP
        const sortedProjects = Object.entries(xpByProject)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5); // Top 5 projects
        
        // Update XP details section
        const xpDetails = document.getElementById('xp-details');
        xpDetails.innerHTML = `
            <div class="xp-summary">
                <div class="xp-total">
                    <h3>Total XP</h3>
                    <div class="xp-value">${(totalXP / 1_000_000).toFixed(2)} MB</div>
                </div>
                <div class="xp-projects">
                    <h3>Top Projects by XP</h3>
                    <ul>
                        ${sortedProjects.map(([project, xp]) => 
                            `<li><span>${project}</span>: <strong>${(xp / 1_000_000).toFixed(2)} MB</strong></li>`
                        ).join('')}
                    </ul>
                </div>
            </div>
        `;
        
        // Store XP data for graphs
        window.userData = window.userData || {};
        window.userData.xpData = transactions;
        
        return transactions;
    } catch (error) {
        console.error('Error loading XP data:', error);
        throw error;
    }
}

// Load and display grades data
async function loadGradesData() {
    try {
        const progressData = await fetchProgressData();
        const resultData = await fetchResultData();
        
        const progress = progressData.progress;
        const results = resultData.result;
        
        // Calculate pass/fail ratios
        const passCount = results.filter(r => r.grade > 0).length;
        const failCount = results.filter(r => r.grade === 0).length;
        const passRatio = passCount / (passCount + failCount) * 100 || 0;
        
        // Group by project type
        const projectTypes = {};
        results.forEach(r => {
            const type = r.object?.type || 'unknown';
            if (!projectTypes[type]) {
                projectTypes[type] = { pass: 0, fail: 0 };
            }
            if (r.grade > 0) {
                projectTypes[type].pass++;
            } else {
                projectTypes[type].fail++;
            }
        });
        
        // Update grades details section
        const gradesDetails = document.getElementById('grades-details');
        gradesDetails.innerHTML = `
            <div class="grades-summary">
                <div class="grades-ratio">
                    <h3>Pass/Fail Ratio</h3>
                    <div class="ratio-display">
                        <div class="ratio-bar">
                            <div class="ratio-pass" style="width: ${passRatio}%"></div>
                        </div>
                        <div class="ratio-text">
                            ${passRatio.toFixed(1)}% Pass Rate (${passCount} passed, ${failCount} failed)
                        </div>
                    </div>
                </div>
                <div class="project-types">
                    <h3>Projects by Type</h3>
                    <ul>
                        ${Object.entries(projectTypes).map(([type, counts]) => 
                            `<li>
                                <span>${type}</span>: 
                                <strong class="text-success">${counts.pass} passed</strong>, 
                                <strong class="text-danger">${counts.fail} failed</strong>
                            </li>`
                        ).join('')}
                    </ul>
                </div>
            </div>
        `;
        
        // Store grades data for graphs
        window.userData = window.userData || {};
        window.userData.gradesData = {
            progress,
            results
        };
        
        return { progress, results };
    } catch (error) {
        console.error('Error loading grades data:', error);
        throw error;
    }
}

// Initialize sidebar navigation
function initSidebar() {
    const navLinks = document.querySelectorAll('.sidebar nav a');
    const sections = document.querySelectorAll('section');
    
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Remove active class from all links
            navLinks.forEach(l => l.classList.remove('active'));
            
            // Add active class to clicked link
            link.classList.add('active');
            
            // Get the target section ID
            const targetId = link.getAttribute('href');
            
            // Hide all sections
            sections.forEach(section => {
                section.style.display = 'none';
            });
            
            // Show the target section
            document.querySelector(targetId).style.display = 'block';
        });
    });
    
    // Show the first section by default
    sections.forEach((section, index) => {
        section.style.display = index === 0 ? 'block' : 'none';
    });
}

// Setup graph buttons
function setupGraphButtons() {
    const xpTimeBtn = document.getElementById('xp-time-btn');
    const passFailBtn = document.getElementById('pass-fail-btn');
    
    xpTimeBtn.addEventListener('click', () => {
        drawXpOverTimeGraph();
    });
    
    passFailBtn.addEventListener('click', () => {
        drawPassFailRatioGraph();
    });
}

// =============================================
// SVG Graph functions (graph.js)
// =============================================

// Color constants from our theme
const COLORS = {
    darkBlue: '#22223b',
    blueGray: '#4a4e69',
    mauve: '#9a8c98',
    pinkBeige: '#c9ada7',
    offWhite: '#f2e9e4'
};

// Draw XP over time graph (line chart)
function drawXpOverTimeGraph() {
    if (!window.userData || !window.userData.xpData) {
        console.error('XP data not loaded');
        return;
    }
    
    const transactions = window.userData.xpData;
    const svg = document.getElementById('graph-svg');
    const placeholder = document.getElementById('graph-placeholder');
    
    // Show SVG, hide placeholder
    svg.style.display = 'block';
    placeholder.style.display = 'none';
    
    // Clear previous graph
    svg.innerHTML = '';
    
    // Set dimensions
    const width = svg.clientWidth;
    const height = svg.clientHeight;
    const margin = { top: 40, right: 40, bottom: 60, left: 60 };
    const graphWidth = width - margin.left - margin.right;
    const graphHeight = height - margin.top - margin.bottom;
    
    // Sort transactions by date
    const sortedTransactions = [...transactions].sort((a, b) => 
        new Date(a.createdAt) - new Date(b.createdAt)
    );
    
    // Group by month
    const xpByMonth = {};
    let cumulativeXP = 0;
    
    sortedTransactions.forEach(t => {
        const date = new Date(t.createdAt);
        const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
        
        if (!xpByMonth[monthKey]) {
            xpByMonth[monthKey] = { 
                date: new Date(date.getFullYear(), date.getMonth(), 1),
                xp: 0,
                cumulativeXP: 0
            };
        }
        
        xpByMonth[monthKey].xp += t.amount;
        cumulativeXP += t.amount;
        xpByMonth[monthKey].cumulativeXP = cumulativeXP;
    });
    
    // Convert to array for easier use
    const dataPoints = Object.values(xpByMonth);
    
    // Find min and max dates
    const minDate = dataPoints.length > 0 ? dataPoints[0].date : new Date();
    const maxDate = dataPoints.length > 0 ? dataPoints[dataPoints.length - 1].date : new Date();
    
    // Add one month padding
    minDate.setMonth(minDate.getMonth() - 1);
    maxDate.setMonth(maxDate.getMonth() + 1);
    
    // Find max XP for scaling
    const maxXP = dataPoints.length > 0 ? 
        Math.max(...dataPoints.map(d => d.cumulativeXP)) : 0;
    
    // Create scales
    const xScale = (date) => {
        const range = maxDate - minDate;
        const normalized = (date - minDate) / range;
        return margin.left + (normalized * graphWidth);
    };
    
    const yScale = (value) => {
        return margin.top + graphHeight - (value / maxXP * graphHeight);
    };
    
    // Create main graph group
    const mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(mainGroup);
    
    // Add title
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', width / 2);
    title.setAttribute('y', margin.top / 2);
    title.setAttribute('text-anchor', 'middle');
    title.setAttribute('font-size', '18');
    title.setAttribute('font-weight', 'bold');
    title.setAttribute('fill', COLORS.darkBlue);
    title.textContent = 'Cumulative XP Over Time';
    mainGroup.appendChild(title);
    
    // Draw axes
    // X-axis
    const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    xAxis.setAttribute('x1', margin.left);
    xAxis.setAttribute('y1', margin.top + graphHeight);
    xAxis.setAttribute('x2', margin.left + graphWidth);
    xAxis.setAttribute('y2', margin.top + graphHeight);
    xAxis.setAttribute('stroke', COLORS.darkBlue);
    xAxis.setAttribute('stroke-width', '2');
    mainGroup.appendChild(xAxis);
    
    // Y-axis
    const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    yAxis.setAttribute('x1', margin.left);
    yAxis.setAttribute('y1', margin.top);
    yAxis.setAttribute('x2', margin.left);
    yAxis.setAttribute('y2', margin.top + graphHeight);
    yAxis.setAttribute('stroke', COLORS.darkBlue);
    yAxis.setAttribute('stroke-width', '2');
    mainGroup.appendChild(yAxis);
    
    // X-axis ticks and labels
    const monthDiff = (maxDate.getFullYear() - minDate.getFullYear()) * 12 + 
        (maxDate.getMonth() - minDate.getMonth());
    const tickStep = Math.max(1, Math.ceil(monthDiff / 6)); // At most 6 ticks
    
    for (let m = 0; m <= monthDiff; m += tickStep) {
        const tickDate = new Date(minDate);
        tickDate.setMonth(tickDate.getMonth() + m);
        
        const x = xScale(tickDate);
        
        // Tick mark
        const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        tick.setAttribute('x1', x);
        tick.setAttribute('y1', margin.top + graphHeight);
        tick.setAttribute('x2', x);
        tick.setAttribute('y2', margin.top + graphHeight + 5);
        tick.setAttribute('stroke', COLORS.darkBlue);
        tick.setAttribute('stroke-width', '1');
        mainGroup.appendChild(tick);
        
        // Tick label
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', x);
        label.setAttribute('y', margin.top + graphHeight + 20);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '12');
        label.setAttribute('fill', COLORS.darkBlue);
        label.textContent = `${tickDate.getMonth() + 1}/${tickDate.getFullYear()}`;
        mainGroup.appendChild(label);
    }
    
    // Y-axis ticks and labels
    const yTickCount = 5;
    for (let i = 0; i <= yTickCount; i++) {
        const value = (maxXP / yTickCount) * i;
        const y = yScale(value);
        
        // Tick mark
        const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        tick.setAttribute('x1', margin.left - 5);
        tick.setAttribute('y1', y);
        tick.setAttribute('x2', margin.left);
        tick.setAttribute('y2', y);
        tick.setAttribute('stroke', COLORS.darkBlue);
        tick.setAttribute('stroke-width', '1');
        mainGroup.appendChild(tick);
        
        // Tick label
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', margin.left - 10);
        label.setAttribute('y', y + 4);
        label.setAttribute('text-anchor', 'end');
        label.setAttribute('font-size', '12');
        label.setAttribute('fill', COLORS.darkBlue);
        label.textContent = Math.round(value).toLocaleString();
        mainGroup.appendChild(label);
        
        // Grid line
        const gridLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        gridLine.setAttribute('x1', margin.left);
        gridLine.setAttribute('y1', y);
        gridLine.setAttribute('x2', margin.left + graphWidth);
        gridLine.setAttribute('y2', y);
        gridLine.setAttribute('stroke', '#e0e0e0');
        gridLine.setAttribute('stroke-width', '1');
        gridLine.setAttribute('stroke-dasharray', '4,4');
        mainGroup.appendChild(gridLine);
    }
    
    // X-axis label
    const xLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    xLabel.setAttribute('x', margin.left + graphWidth / 2);
    xLabel.setAttribute('y', margin.top + graphHeight + 40);
    xLabel.setAttribute('text-anchor', 'middle');
    xLabel.setAttribute('font-size', '14');
    xLabel.setAttribute('fill', COLORS.darkBlue);
    xLabel.textContent = 'Time';
    mainGroup.appendChild(xLabel);
    
    // Y-axis label
    const yLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    yLabel.setAttribute('x', margin.left - 40);
    yLabel.setAttribute('y', margin.top + graphHeight / 2);
    yLabel.setAttribute('text-anchor', 'middle');
    yLabel.setAttribute('font-size', '14');
    yLabel.setAttribute('fill', COLORS.darkBlue);
    yLabel.setAttribute('transform', `rotate(-90, ${margin.left - 40}, ${margin.top + graphHeight / 2})`);
    yLabel.textContent = 'Cumulative XP';
    mainGroup.appendChild(yLabel);
    
    // Draw the line
    if (dataPoints.length > 1) {
        // Line path
        let pathD = '';
        
        dataPoints.forEach((point, i) => {
            const x = xScale(point.date);
            const y = yScale(point.cumulativeXP);
            
            if (i === 0) {
                pathD += `M ${x} ${y}`;
            } else {
                pathD += ` L ${x} ${y}`;
            }
        });
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathD);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', COLORS.mauve);
        path.setAttribute('stroke-width', '3');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        mainGroup.appendChild(path);
        
        // Add data points with animation
        dataPoints.forEach((point, index) => {
            const x = xScale(point.date);
            const y = yScale(point.cumulativeXP);
            
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', x);
            circle.setAttribute('cy', y);
            circle.setAttribute('r', '0'); // Start with radius 0 for animation
            circle.setAttribute('fill', COLORS.pinkBeige);
            circle.setAttribute('stroke', COLORS.darkBlue);
            circle.setAttribute('stroke-width', '2');
            
            // Animate the points appearing
            const animateSize = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
            animateSize.setAttribute('attributeName', 'r');
            animateSize.setAttribute('from', '0');
            animateSize.setAttribute('to', '5');
            animateSize.setAttribute('dur', '0.5s');
            animateSize.setAttribute('begin', `${index * 0.1}s`);
            animateSize.setAttribute('fill', 'freeze');
            circle.appendChild(animateSize);
            
            // Interactive tooltip
            circle.addEventListener('mouseover', function() {
                this.setAttribute('r', '7');
                
                const tooltip = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                tooltip.setAttribute('id', 'tooltip');
                
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('x', x + 10);
                rect.setAttribute('y', y - 30);
                rect.setAttribute('width', '160');
                rect.setAttribute('height', '50');
                rect.setAttribute('rx', '5');
                rect.setAttribute('fill', COLORS.offWhite);
                rect.setAttribute('stroke', COLORS.mauve);
                tooltip.appendChild(rect);
                
                const month = point.date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                
                const text1 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text1.setAttribute('x', x + 20);
                text1.setAttribute('y', y - 10);
                text1.setAttribute('fill', COLORS.darkBlue);
                text1.textContent = `Month: ${month}`;
                tooltip.appendChild(text1);
                
                const text2 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text2.setAttribute('x', x + 20);
                text2.setAttribute('y', y + 10);
                text2.setAttribute('fill', COLORS.darkBlue);
                text2.textContent = `XP: ${point.cumulativeXP.toLocaleString()}`;
                tooltip.appendChild(text2);
                
                mainGroup.appendChild(tooltip);
            });
            
            circle.addEventListener('mouseout', function() {
                this.setAttribute('r', '5');
                const tooltip = document.getElementById('tooltip');
                if (tooltip) {
                    tooltip.remove();
                }
            });
            
            mainGroup.appendChild(circle);
        });
    } else {
        // No data message
        const noData = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        noData.setAttribute('x', width / 2);
        noData.setAttribute('y', height / 2);
        noData.setAttribute('text-anchor', 'middle');
        noData.setAttribute('font-size', '16');
        noData.setAttribute('fill', COLORS.mauve);
        noData.textContent = 'No XP data available';
        mainGroup.appendChild(noData);
    }
}

// Draw Pass/Fail ratio graph (pie chart)
function drawPassFailRatioGraph() {
    if (!window.userData || !window.userData.gradesData) {
        console.error('Grades data not loaded');
        return;
    }
    
    const results = window.userData.gradesData.results;
    const svg = document.getElementById('graph-svg');
    const placeholder = document.getElementById('graph-placeholder');
    
    // Show SVG, hide placeholder
    svg.style.display = 'block';
    placeholder.style.display = 'none';
    
    // Clear previous graph
    svg.innerHTML = '';
    
    // Set dimensions
    const width = svg.clientWidth;
    const height = svg.clientHeight;
    const margin = { top: 40, right: 40, bottom: 40, left: 40 };
    const graphWidth = width - margin.left - margin.right;
    const graphHeight = height - margin.top - margin.bottom;
    const radius = Math.min(graphWidth, graphHeight) / 2;
    const centerX = margin.left + graphWidth / 2;
    const centerY = margin.top + graphHeight / 2;
    
    // Calculate pass/fail counts
    const passCount = results.filter(r => r.grade > 0).length;
    const failCount = results.filter(r => r.grade === 0).length;
    const total = passCount + failCount;
    
    // Create main graph group
    const mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(mainGroup);
    
    // Add title
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', width / 2);
    title.setAttribute('y', margin.top / 2);
    title.setAttribute('text-anchor', 'middle');
    title.setAttribute('font-size', '18');
    title.setAttribute('font-weight', 'bold');
    title.setAttribute('fill', COLORS.darkBlue);
    title.textContent = 'Project Pass/Fail Ratio';
    mainGroup.appendChild(title);
    
    if (total > 0) {
        // Calculate angles
        const passAngle = (passCount / total) * 360;
        const failAngle = (failCount / total) * 360;
        
        // Draw pie segments with animation
        if (passCount > 0) {
            const passSegment = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const passStartAngle = 0;
            const passEndAngle = passAngle;
            
            // Start with 0 angle for animation
            let passPath = describeArc(centerX, centerY, radius, passStartAngle, 0);
            passSegment.setAttribute('d', passPath);
            passSegment.setAttribute('fill', COLORS.blueGray);
            passSegment.setAttribute('stroke', 'white');
            passSegment.setAttribute('stroke-width', '2');
            mainGroup.appendChild(passSegment);
            
            // Animate the segment
            const animatePath = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
            animatePath.setAttribute('attributeName', 'd');
            animatePath.setAttribute('from', passPath);
            animatePath.setAttribute('to', describeArc(centerX, centerY, radius, passStartAngle, passEndAngle));
            animatePath.setAttribute('dur', '1s');
            animatePath.setAttribute('fill', 'freeze');
            passSegment.appendChild(animatePath);
        }
        
        if (failCount > 0) {
            const failSegment = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const failStartAngle = passAngle;
            const failEndAngle = 360;
            
            // Start with 0 angle for animation
            let failPath = describeArc(centerX, centerY, radius, failStartAngle, failStartAngle);
            failSegment.setAttribute('d', failPath);
            failSegment.setAttribute('fill', COLORS.pinkBeige);
            failSegment.setAttribute('stroke', 'white');
            failSegment.setAttribute('stroke-width', '2');
            mainGroup.appendChild(failSegment);
            
            // Animate the segment
            const animatePath = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
            animatePath.setAttribute('attributeName', 'd');
            animatePath.setAttribute('from', failPath);
            animatePath.setAttribute('to', describeArc(centerX, centerY, radius, failStartAngle, failEndAngle));
            animatePath.setAttribute('dur', '1s');
            animatePath.setAttribute('begin', '0.5s');
            animatePath.setAttribute('fill', 'freeze');
            failSegment.appendChild(animatePath);
        }
        
        // Add legend
        const legendGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        mainGroup.appendChild(legendGroup);
        
        // Pass legend
        const passRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        passRect.setAttribute('x', centerX + radius + 20);
        passRect.setAttribute('y', centerY - 40);
        passRect.setAttribute('width', '20');
        passRect.setAttribute('height', '20');
        passRect.setAttribute('fill', COLORS.blueGray);
        legendGroup.appendChild(passRect);
        
        const passText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        passText.setAttribute('x', centerX + radius + 50);
        passText.setAttribute('y', centerY - 25);
        passText.setAttribute('fill', COLORS.darkBlue);
        passText.textContent = `Pass: ${passCount} (${(passCount / total * 100).toFixed(1)}%)`;
        legendGroup.appendChild(passText);
        
        // Fail legend
        const failRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        failRect.setAttribute('x', centerX + radius + 20);
        failRect.setAttribute('y', centerY - 10);
        failRect.setAttribute('width', '20');
        failRect.setAttribute('height', '20');
        failRect.setAttribute('fill', COLORS.pinkBeige);
        legendGroup.appendChild(failRect);
        
        const failText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        failText.setAttribute('x', centerX + radius + 50);
        failText.setAttribute('y', centerY + 5);
        failText.setAttribute('fill', COLORS.darkBlue);
        failText.textContent = `Fail: ${failCount} (${(failCount / total * 100).toFixed(1)}%)`;
        legendGroup.appendChild(failText);
        
        // Add center text with counter animation
        const centerText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        centerText.setAttribute('x', centerX);
        centerText.setAttribute('y', centerY + 5);
        centerText.setAttribute('text-anchor', 'middle');
        centerText.setAttribute('font-size', '16');
        centerText.setAttribute('font-weight', 'bold');
        centerText.setAttribute('fill', COLORS.darkBlue);
        centerText.textContent = '0 Projects';
        mainGroup.appendChild(centerText);
        
        // Counter animation for center text
        let count = 0;
        const interval = setInterval(() => {
            count = Math.min(count + Math.ceil(total / 20), total);
            centerText.textContent = `${count} Projects`;
            
            if (count >= total) {
                clearInterval(interval);
            }
        }, 50);
        
        // Add interactivity to the pie segments
        mainGroup.addEventListener('mousemove', (e) => {
            const mouseX = e.clientX - svg.getBoundingClientRect().left;
            const mouseY = e.clientY - svg.getBoundingClientRect().top;
            
            const dx = mouseX - centerX;
            const dy = mouseY - centerY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= radius) {
                // Calculate angle in degrees
                let angle = Math.atan2(dy, dx) * 180 / Math.PI;
                if (angle < 0) angle += 360;
                
                // Adjust angle to match our pie chart system
                angle = (angle + 90) % 360;
                
                let hoveredSegment;
                if (angle <= passAngle) {
                    hoveredSegment = 'pass';
                } else {
                    hoveredSegment = 'fail';
                }
                
                // Remove existing tooltip
                const existingTooltip = document.getElementById('pie-tooltip');
                if (existingTooltip) {
                    existingTooltip.remove();
                }
                
                // Create tooltip
                const tooltip = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                tooltip.setAttribute('id', 'pie-tooltip');
                
                const tipText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                tipText.setAttribute('x', mouseX + 15);
                tipText.setAttribute('y', mouseY);
                tipText.setAttribute('fill', COLORS.darkBlue);
                tipText.setAttribute('font-weight', 'bold');
                
                if (hoveredSegment === 'pass') {
                    tipText.textContent = `Passed: ${passCount} projects`;
                } else {
                    tipText.textContent = `Failed: ${failCount} projects`;
                }
                
                const tipBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                const textLength = tipText.getComputedTextLength() || 150; // Fallback if not available
                tipBg.setAttribute('x', mouseX + 10);
                tipBg.setAttribute('y', mouseY - 15);
                tipBg.setAttribute('width', textLength + 10);
                tipBg.setAttribute('height', '20');
                tipBg.setAttribute('fill', COLORS.offWhite);
                tipBg.setAttribute('opacity', '0.9');
                tipBg.setAttribute('rx', '3');
                
                tooltip.appendChild(tipBg);
                tooltip.appendChild(tipText);
                mainGroup.appendChild(tooltip);
            } else {
                // Remove tooltip when mouse is outside the pie
                const existingTooltip = document.getElementById('pie-tooltip');
                if (existingTooltip) {
                    existingTooltip.remove();
                }
            }
        });
        
        // Remove tooltip when mouse leaves SVG
        svg.addEventListener('mouseleave', () => {
            const existingTooltip = document.getElementById('pie-tooltip');
            if (existingTooltip) {
                existingTooltip.remove();
            }
        });
        
    } else {
        // No data message
        const noData = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        noData.setAttribute('x', width / 2);
        noData.setAttribute('y', height / 2);
        noData.setAttribute('text-anchor', 'middle');
        noData.setAttribute('font-size', '16');
        noData.setAttribute('fill', COLORS.mauve);
        noData.textContent = 'No project data available';
        mainGroup.appendChild(noData);
    }
}

// Helper function to create pie chart arc path
function describeArc(x, y, radius, startAngle, endAngle) {
    const start = polarToCartesian(x, y, radius, endAngle);
    const end = polarToCartesian(x, y, radius, startAngle);
    
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    
    // If it's a full circle
    if (endAngle - startAngle >= 359.99) {
        const mid1 = polarToCartesian(x, y, radius, startAngle + 90);
        const mid2 = polarToCartesian(x, y, radius, startAngle + 180);
        const mid3 = polarToCartesian(x, y, radius, startAngle + 270);
        
        return [
            "M", x, y,
            "L", start.x, start.y,
            "A", radius, radius, 0, 0, 1, mid1.x, mid1.y,
            "A", radius, radius, 0, 0, 1, mid2.x, mid2.y,
            "A", radius, radius, 0, 0, 1, mid3.x, mid3.y,
            "A", radius, radius, 0, 0, 1, start.x, start.y,
            "Z"
        ].join(" ");
    }
    
    return [
        "M", x, y,
        "L", start.x, start.y,
        "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y,
        "Z"
    ].join(" ");
}

// Helper function to convert polar coordinates to cartesian
function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    
    return {
        x: centerX + (radius * Math.cos(angleInRadians)),
        y: centerY + (radius * Math.sin(angleInRadians))
    };
}

// =============================================
// Page switching functionality
// =============================================

// Show login view
function showLoginView() {
    document.getElementById('login-view').style.display = 'block';
    document.getElementById('profile-view').style.display = 'none';
    document.title = 'Profile - Login';
}

// Show profile view
function showProfileView() {
    document.getElementById('login-view').classList.add('fade-out');
    setTimeout(() => {
        document.getElementById('login-view').style.display = 'none';
        document.getElementById('profile-view').style.display = 'block';
        document.getElementById('profile-view').classList.add('fade-in');
        document.title = 'Student Profile';
    }, 500);
}

// Handle login form submission
function setupLoginForm() {
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');
    
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            
            // Clear previous error
            errorMessage.style.display = 'none';
            
            try {
                // Create Basic auth token
                const credentials = btoa(`${username}:${password}`);
                
                const response = await fetch(`${API_BASE_URL}${AUTH_ENDPOINT}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Basic ${credentials}`
                    }
                });
                
                if (!response.ok) {
                    throw new Error('Invalid credentials');
                }
                
                const token = await response.json();
                
                // Store token
                localStorage.setItem(TOKEN_KEY, token);
                
                // Switch to profile view
                showProfileView();
                
                // Load profile data
                initSidebar();
                loadUserInfo()
                    .then(() => loadXpData())
                    .then(() => loadGradesData())
                    .then(() => setupGraphButtons())
                    .catch(error => {
                        console.error('Error loading profile data:', error);
                        if (error.message === 'Not authenticated') {
                            logout();
                        }
                    });
                
            } catch (error) {
                errorMessage.textContent = error.message || 'Failed to login. Please try again.';
                errorMessage.style.display = 'block';
            }
        });
    }
}

// Initialize auth and setup logout button
function initAuth() {
    // Setup logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
    
    // Check if logged in
    if (isLoggedIn()) {
        showProfileView();
        
        // Load profile data
        initSidebar();
        loadUserInfo()
            .then(() => loadXpData())
            .then(() => loadGradesData())
            .then(() => setupGraphButtons())
            .catch(error => {
                console.error('Error loading profile data:', error);
                if (error.message === 'Not authenticated') {
                    logout();
                }
            });
    } else {
        showLoginView();
        setupLoginForm();
    }
}

// Run initialization when DOM is loaded
document.addEventListener('DOMContentLoaded', initAuth); 