/**
 * Hnefatafl - Viking Chess
 * Game Logic
 */

// --- UI Helpers ---
window.showToast = function (message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Constants
const BOARD_SIZE = 11;
const TYPE_EMPTY = 0;
const TYPE_KING = 1;
const TYPE_DEFENDER = 2;
const TYPE_ATTACKER = 3;
const TYPE_ATTACKER_ELITE = 4;

// Special squares
const CORNERS = [
    { r: 0, c: 0 },
    { r: 0, c: 10 },
    { r: 10, c: 0 },
    { r: 10, c: 10 }
];
const THRONE = { r: 5, c: 5 };

// Game State
let board = []; // 2D array
let turn = 'attackers'; // or 'defenders'
let selectedCell = null; // {r, c}
let validMoves = []; // Array of {r, c}
let gameActive = true;
let moveCount = 0;
let capturedAttackers = 0;
let capturedDefenders = 0;
let currentScore = 0;
const LEADERBOARD_KEY = 'hnefatafl_leaderboard';

// New setup state
let gameMode = null; // 'vs-ai', '2p-local', '2p-direct', 'random'
let playerSide = 'defenders'; // 'attackers', 'defenders'
let aiLevel = 'normal';
let isTimerEnabled = false;
let timerDuration = 5; // minutes

// DOM Elements
const boardElement = document.getElementById('game-board');
const currentPlayerElement = document.getElementById('current-player');
const moveCountElement = document.getElementById('move-count');
const capturedAttackersElement = document.getElementById('captured-attackers');
const capturedDefendersElement = document.getElementById('captured-defenders');
const rulesModal = document.getElementById('rules-modal');
const victoryModal = document.getElementById('victory-modal');
const overlay = document.querySelector('.overlay');

// --- Online State ---
let peer = null;
let conn = null;
let isOnline = false;
let myRole = 'host'; // 'host' or 'guest'
let otherSide = 'attackers'; // The side the other player is playing

// --- Timer State ---
let attackerTime = 0; // seconds
let defenderTime = 0; // seconds
let timerInterval = null;

// Initialization
function initGame() {
    // Reset state
    turn = 'attackers';
    selectedCell = null;
    gameActive = true;
    moveCount = 0;
    capturedAttackers = 0;
    capturedDefenders = 0;
    updateUI();

    // Initialize board array
    createBoardArray();

    // Render
    renderBoard();

    // Only proceed with game triggers if a mode is selected
    if (!gameMode) {
        gameActive = false;
        console.log("Game initialized (no mode selected)");
        return;
    }

    // If Direct Online host, init PeerJS
    if (gameMode === '2p-direct' && myRole === 'host') {
        if (!peer) initOnline();
    }

    // If AI's turn at start (Attackers move first)
    if (gameMode === 'vs-ai' && playerSide === 'defenders' && turn === 'attackers') {
        setTimeout(makeAIMove, 1000);
    }

    // Timer Setup
    setupTimerUI();

    console.log("Game Initialized in mode:", gameMode);
}

function setupTimerUI() {
    const timerDisplay = document.getElementById('timer-display-area');
    if (isTimerEnabled) {
        timerDisplay.style.display = 'flex';
        attackerTime = timerDuration * 60;
        defenderTime = timerDuration * 60;
        updateTimerDisplay();

        // Start immediately ONLY if local or vs-ai
        // If online, wait for peer connection
        if (gameMode !== '2p-direct' && gameMode !== 'random') {
            startTimer();
        }
    } else {
        timerDisplay.style.display = 'none';
        stopTimer();
    }
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (!gameActive) {
            stopTimer();
            return;
        }

        if (turn === 'attackers') {
            attackerTime--;
            if (attackerTime <= 0) {
                attackerTime = 0;
                endGame('defenders'); // Attackers lost on time
            }
        } else {
            defenderTime--;
            if (defenderTime <= 0) {
                defenderTime = 0;
                endGame('attackers'); // Defenders lost on time
            }
        }
        updateTimerDisplay();
    }, 1000);
}

function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
}

function updateTimerDisplay() {
    const atkTimer = document.getElementById('attacker-timer');
    const defTimer = document.getElementById('defender-timer');
    const atkBox = document.querySelector('.attacker-timer-box');
    const defBox = document.querySelector('.defender-timer-box');

    if (atkTimer) atkTimer.textContent = formatTime(attackerTime);
    if (defTimer) defTimer.textContent = formatTime(defenderTime);

    if (atkBox && defBox) {
        atkBox.classList.toggle('active', turn === 'attackers');
        defBox.classList.toggle('active', turn === 'defenders');
    }
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function createBoardArray() {
    board = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(TYPE_EMPTY));

    // Place King
    board[5][5] = TYPE_KING;

    // Place Defenders (Cross around center)
    const defenders = [
        { r: 3, c: 5 }, { r: 4, c: 5 }, { r: 5, c: 4 }, { r: 5, c: 3 }, // Top/Left/Mid
        { r: 6, c: 5 }, { r: 7, c: 5 }, { r: 5, c: 6 }, { r: 5, c: 7 }, // Bottom/Right/Mid
        { r: 5, c: 2 }, { r: 5, c: 8 }, { r: 2, c: 5 }, { r: 8, c: 5 }  // Distant tips of cross? No, wait.
        // Standard Copenhagen setup usually:
        // King at 5,5
        // Defenders at:
        // 3,5; 4,5; 5,3; 5,4; 5,6; 5,7; 6,5; 7,5
        // And tips: 
        // 5,3 is covered?
    ];

    // Let's use the standard "Copenhagen" or "Fetlar" setup, commonly used.
    // 11x11
    // King at center.
    // Defenders (12): 
    //   4,5; 5,4; 6,5; 5,6 (Inner cross)
    //   3,5; 5,3; 7,5; 5,7 (Outer cross)
    //   Wait, 12 defenders. The standard is a diamond shape?
    //   Let's use the layout from common Hnefatafl diagrams for 11x11.

    // 12 Defenders:
    // Row 3: 5
    // Row 4: 5
    // Row 5: 3, 4, (K), 6, 7
    // Row 6: 5
    // Row 7: 5
    // That is 6 pieces. Too few.

    // Correct 11x11 setup (often called Brandubh is 7x7, Tawlbwrdd is 11x11)
    // Defenders at:
    // (3,5), (4,4), (4,5), (4,6), (5,3), (5,4), (5,6), (5,7), (6,4), (6,5), (6,6), (7,5)
    // Let's re-verify specific coordinates.
    //      . . . . . . . . . . .
    //      . . . . . . . . . . .
    //      . . . . . . . . . . .
    //      . . . . . A . . . . .
    //      . . . . A A A . . . .
    //      . . . A A K A A . . .
    //      . . . . A A A . . . .
    //      . . . . . A . . . . .

    const defenderCoords = [
        { r: 3, c: 5 },
        { r: 4, c: 4 }, { r: 4, c: 5 }, { r: 4, c: 6 },
        { r: 5, c: 3 }, { r: 5, c: 4 }, { r: 5, c: 6 }, { r: 5, c: 7 },
        { r: 6, c: 4 }, { r: 6, c: 5 }, { r: 6, c: 6 },
        { r: 7, c: 5 }
    ];

    defenderCoords.forEach(pos => {
        board[pos.r][pos.c] = TYPE_DEFENDER;
    });

    // Place Attackers (24)
    // Edges, traditionally T-shapes or lines. 
    // Top: (0, 3..7), (1, 5)
    // Bottom: (10, 3..7), (9, 5)
    // Left: (3..7, 0), (5, 1)
    // Right: (3..7, 10), (5, 9)

    const attackerCoords = [
        // Top
        { r: 0, c: 3 }, { r: 0, c: 4 }, { r: 0, c: 5 }, { r: 0, c: 6 }, { r: 0, c: 7 }, { r: 1, c: 5 },
        // Bottom
        { r: 10, c: 3 }, { r: 10, c: 4 }, { r: 10, c: 5 }, { r: 10, c: 6 }, { r: 10, c: 7 }, { r: 9, c: 5 },
        // Left
        { r: 3, c: 0 }, { r: 4, c: 0 }, { r: 5, c: 0 }, { r: 6, c: 0 }, { r: 7, c: 0 }, { r: 5, c: 1 },
        // Right
        { r: 3, c: 10 }, { r: 4, c: 10 }, { r: 5, c: 10 }, { r: 6, c: 10 }, { r: 7, c: 10 }, { r: 5, c: 9 }
    ];

    attackerCoords.forEach(pos => {
        board[pos.r][pos.c] = TYPE_ATTACKER;
    });

    // Assign Elite status to 4 closest to King
    const kingPos = { r: 5, c: 5 };
    const attackersWithDist = attackerCoords.map(pos => ({
        ...pos,
        dist: Math.sqrt(Math.pow(pos.r - kingPos.r, 2) + Math.pow(pos.c - kingPos.c, 2))
    }));
    attackersWithDist.sort((a, b) => a.dist - b.dist);
    attackersWithDist.slice(0, 4).forEach(pos => {
        board[pos.r][pos.c] = TYPE_ATTACKER_ELITE;
    });
}

function renderBoard() {
    boardElement.innerHTML = '';

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.r = r;
            cell.dataset.c = c;

            // Mark special squares
            if (isCorner(r, c)) cell.classList.add('corner');
            if (r === 5 && c === 5) cell.classList.add('throne');

            // Add piece if present
            const pieceType = board[r][c];
            if (pieceType !== TYPE_EMPTY) {
                const piece = document.createElement('div');
                piece.classList.add('piece');
                if (pieceType === TYPE_KING) piece.classList.add('king');
                if (pieceType === TYPE_DEFENDER) piece.classList.add('defender');
                if (pieceType === TYPE_ATTACKER || pieceType === TYPE_ATTACKER_ELITE) {
                    piece.classList.add('attacker');
                    if (pieceType === TYPE_ATTACKER_ELITE) {
                        piece.classList.add('elite');
                    }
                }
                cell.appendChild(piece);
            }

            // Selection highlights
            if (selectedCell && selectedCell.r === r && selectedCell.c === c) {
                cell.classList.add('selected');
            }

            // Valid move highlights
            const isValid = validMoves.some(m => m.r === r && m.c === c);
            if (isValid) {
                cell.classList.add('valid-move');
            }

            cell.addEventListener('click', () => handleCellClick(r, c));
            boardElement.appendChild(cell);
        }
    }
    updateUI();
}

function isCorner(r, c) {
    return (r === 0 && c === 0) || (r === 0 && c === 10) ||
        (r === 10 && c === 0) || (r === 10 && c === 10);
}

// Game Logic Functions

function isValidMove(from, to) {
    // 1. Check if destination is empty
    if (board[to.r][to.c] !== TYPE_EMPTY) return false;

    // 2. Check orthogonality
    if (from.r !== to.r && from.c !== to.c) return false;

    // 3. Check for obstacles (no jumping)
    const dr = Math.sign(to.r - from.r);
    const dc = Math.sign(to.c - from.c);

    let currR = from.r + dr;
    let currC = from.c + dc;

    while (currR !== to.r || currC !== to.c) {
        if (board[currR][currC] !== TYPE_EMPTY) return false;
        currR += dr;
        currC += dc;
    }

    // 4. Special Squares (Throne, Corners)
    const piece = board[from.r][from.c];

    // Throne (5,5) - Only King can land on it.
    if (to.r === 5 && to.c === 5) {
        if (piece !== TYPE_KING) return false;
    }

    // Corners - Only King can land on them.
    if (isCorner(to.r, to.c)) {
        if (piece !== TYPE_KING) return false;
    }

    // 5. King cannot return to throne once left? (Optional rule, usually allowed unless variant specifies)
    // We will allow it for now as per standard simple rules.

    return true;
}

function movePiece(from, to, isRemote = false) {
    // Move
    const piece = board[from.r][from.c];
    board[to.r][to.c] = piece;
    board[from.r][from.c] = TYPE_EMPTY;

    moveCount++;

    // Check Captures
    checkCaptures(to.r, to.c);

    // Check Win Conditions
    checkWinCondition();

    // Switch Turn
    if (gameActive) {
        turn = turn === 'attackers' ? 'defenders' : 'attackers';
        updateUI();
        if (isTimerEnabled) updateTimerDisplay();

        // If it's Online, send move to peer (only if it's a local move)
        if ((gameMode === '2p-direct' || gameMode === 'random') && conn && conn.open && !isRemote) {
            conn.send({ type: 'move', from, to });
        }

        // If it's VS AI and it's AI's turn
        if (gameMode === 'vs-ai' && turn !== playerSide) {
            showToast("AI is thinking...");
            setTimeout(makeAIMove, 1500);
        }
    }

    // Clear selection and re-render
    selectedCell = null;
    validMoves = []; // Clear valid moves after a move
    renderBoard();

    // Add to history
    addToHistory(from, to, piece === TYPE_KING ? 'K' : ((piece === TYPE_ATTACKER || piece === TYPE_ATTACKER_ELITE) ? 'A' : 'D'));
}

function addToHistory(from, to, pieceChar) {
    const list = document.getElementById('move-history-list');
    const li = document.createElement('li');
    // Notation: A(0,3)-(0,4)
    // Convert to Chess-like? a1..k11
    const cols = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'];
    const row = 11 - to.r; // 1 at bottom
    const col = cols[to.c];

    li.textContent = `${pieceChar} to ${col}${row}`;
    list.prepend(li); // Newest top
}

// Coordinate utilities
function isHostile(r, c, player) {
    // Check bounds
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return false;

    const piece = board[r][c];

    // Empty Throne/Corners act as hostile for EVERYONE (usually)
    // Or do they act as friendly for the King?
    // Standard rules: 
    // - Throne is hostile to attackers. 
    // - Corners are hostile to attackers.
    // - For defenders/King: Throne is friendly? 
    // Let's stick to the prompt: "hostile squares: throne and corners act as enemy pieces for capture purposes when empty"

    const isThrone = (r === 5 && c === 5);
    const isCornerSq = isCorner(r, c);

    if (piece === TYPE_EMPTY) {
        if (isThrone || isCornerSq) return true; // Act as hostile for capture
        return false;
    }

    if (player === 'attackers') {
        // Hostile: Defenders, King
        return piece === TYPE_DEFENDER || piece === TYPE_KING;
    } else { // player === 'defenders'
        // Hostile: Attackers
        return piece === TYPE_ATTACKER || piece === TYPE_ATTACKER_ELITE;
    }
}


function checkCaptures(r, c) {
    const player = turn; // Current player who just moved
    const piece = board[r][c];

    const directions = [
        { dr: -1, dc: 0 }, // Up
        { dr: 1, dc: 0 },  // Down
        { dr: 0, dc: -1 }, // Left
        { dr: 0, dc: 1 }   // Right
    ];

    directions.forEach(dir => {
        const adjR = r + dir.dr;
        const adjC = c + dir.dc;

        const farR = r + (dir.dr * 2);
        const farC = c + (dir.dc * 2);

        // Check bounds for far cell
        if (farR >= 0 && farR < BOARD_SIZE && farC >= 0 && farC < BOARD_SIZE) {
            const adjacentPiece = board[adjR][adjC];

            // If adjacent is an enemy
            if (isHostile(adjR, adjC, player)) {

                // Special King Capture Rules require 4 sides normally, 
                // OR 3 sides if against throne/edge? Prompt says:
                // "King... requires 4 pieces to be captured (or 3 if against throne/corner)"
                // Normal pieces are captured by 2.

                if (adjacentPiece === TYPE_KING) {
                    checkKingCapture(adjR, adjC);
                    return;
                }

                // Normal Capture Logic (Sandwich)
                // We need a friendly piece (or hostile square) on the other side
                // It is friendly if it contains a friendly piece, OR if it is a hostile square (throne/corner)
                // Prompt: "hostile squares: throne and corners act as enemy pieces for capture purposes when empty"
                // This usually means they act as the "other piece" for the sandwich.
                // So if I am Attacker, and I push a Defender against a Corner, the Defender is captured.
                // So the Corner acts as an Attacker.
                // If I am Defender, does the Corner act as Defender? Usually yes.
                // The prompt says "act as enemy pieces".
                // This implies they are hostile to the VICTIM.
                // So for the VICTIM (the adjacent piece), the squashing block must be hostile to IT.

                let isAnvil = false;

                // If far cell has a piece belonging to current player
                if (!isHostile(farR, farC, player) && board[farR][farC] !== TYPE_EMPTY) {
                    isAnvil = true;
                }
                // Or if far cell is throne/corner (which are hostile to everyone when empty)
                else if (board[farR][farC] === TYPE_EMPTY && ((isCorner(farR, farC) || (farR === 5 && farC === 5)))) {
                    isAnvil = true;
                }

                if (isAnvil) {
                    // Capture!
                    board[adjR][adjC] = TYPE_EMPTY;
                    // stats
                    if (turn === 'attackers') capturedDefenders++;
                    else capturedAttackers++;

                    // Visual feedback (crude)
                    console.log("Captured!");
                }
            }
        }
    });
}

function checkKingCapture(r, c) {
    // r,c is King position
    // King is captured if surrounded on 4 sides by attackers/hostile squares
    // OR 3 sides if against throne/corner?

    const kingSurroundings = [
        { r: r - 1, c: c },
        { r: r + 1, c: c },
        { r: r, c: c - 1 },
        { r: r, c: c + 1 }
    ];

    // Count hostile neighbors (Attackers or Throne/Corner/Edge?)
    // Prompt says: "requires 4 pieces to be captured (or 3 if against throne/corner)"
    // It doesn't mention Edge.

    let hostileCount = 0;

    kingSurroundings.forEach(pos => {
        // If off board, it's an edge. Does edge count? usually no, King wins on edge usually.
        // But King wins on CORNER.
        if (pos.r < 0 || pos.r >= BOARD_SIZE || pos.c < 0 || pos.c >= BOARD_SIZE) return;

        const piece = board[pos.r][pos.c];

        // Attackers are hostile
        if (piece === TYPE_ATTACKER || piece === TYPE_ATTACKER_ELITE) {
            hostileCount++;
        }
        // Throne/Corner are hostile if empty (or occupied by attacker? Attacker can't be on throne)
        else if (piece === TYPE_EMPTY && ((pos.r === 5 && pos.c === 5) || isCorner(pos.r, pos.c))) {
            hostileCount++;
        }
    });

    // Check if King is ON the throne?
    // If King is on Throne (5,5), he needs 4 attackers.
    // If King is adjacent to Throne, needs 3 attackers + Throne.

    if (r === 5 && c === 5) {
        if (hostileCount === 4) endGame('attackers');
    } else {
        // If adjacent to throne or corner??
        // Logic: If surrounded on all functional sides.
        // Basically if all available orthogonal moves are blocked by hostiles.
        // Simplified: 4 sides always, where Throne/Corner count as one side.

        if (hostileCount === 4) endGame('attackers');
    }
}

function checkWinCondition() {
    // 1. King reached corner?
    // Find King
    let kingPos = null;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] === TYPE_KING) {
                kingPos = { r, c };
                break;
            }
        }
    }

    if (!kingPos) {
        // King is gone (Captured) - Should satisfy Attacker win, but safeguard
        endGame('attackers');
        return;
    }

    if (isCorner(kingPos.r, kingPos.c)) {
        endGame('defenders');
    }
}

function calculateScore(winner) {
    let score = 0;

    if (winner === 'defenders') {
        score += 500; // King escaped
        score += capturedAttackers * 40;
        // Count remaining defenders
        let remainingDefenders = 0;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (board[r][c] === TYPE_DEFENDER || board[r][c] === TYPE_KING) remainingDefenders++;
            }
        }
        score += remainingDefenders * 20;
    } else {
        score += 500; // King captured
        score += capturedDefenders * 40;
    }

    score -= moveCount * 2;
    return Math.max(0, score);
}

async function saveScore(name, score) {
    const finalName = (window.currentUser && window.currentUser.displayName) ? window.currentUser.displayName : (name || "The Foreign Viking [ ]");
    const uid = window.currentUser ? window.currentUser.uid : "guest_" + name;

    if (window.isFirebaseEnabled && window.db) {
        try {
            const heroesRef = window.db.collection("hall_of_heroes");
            // Check if player already exists in leaderboard
            const query = window.currentUser
                ? heroesRef.where("uid", "==", window.currentUser.uid)
                : heroesRef.where("name", "==", finalName);

            const snapshot = await query.get();

            if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                const existingData = doc.data();
                const updates = {
                    totalXP: (existingData.totalXP || 0) + score,
                    name: finalName,
                    date: firebase.firestore.FieldValue.serverTimestamp()
                };

                if (score > (existingData.score || 0)) {
                    updates.score = score;
                    showToast("New high score!");
                } else {
                    showToast("Score added to your total XP!");
                }

                await heroesRef.doc(doc.id).update(updates);
            } else {
                await heroesRef.add({
                    name: finalName,
                    score: score,
                    totalXP: score,
                    uid: window.currentUser ? window.currentUser.uid : "anonymous",
                    date: firebase.firestore.FieldValue.serverTimestamp()
                });
                showToast("Score recorded in the sagas!");
            }
            updateLeaderboardUI();
        } catch (error) {
            console.error("Error saving score:", error);
            showToast("Error saving score.");
        }
    } else {
        // Fallback to localStorage
        let leaderboard = loadLeaderboard();
        const existingIndex = leaderboard.findIndex(e => e.name === finalName);

        if (existingIndex !== -1) {
            leaderboard[existingIndex].totalXP = (leaderboard[existingIndex].totalXP || 0) + score;
            if (score > leaderboard[existingIndex].score) {
                leaderboard[existingIndex].score = score;
                leaderboard[existingIndex].date = new Date().toLocaleDateString();
                showToast("New high score!");
            } else {
                showToast("Score added to your total XP!");
            }
        } else {
            leaderboard.push({ name: finalName, score, totalXP: score, date: new Date().toLocaleDateString() });
            showToast("Score recorded locally!");
        }

        leaderboard.sort((a, b) => b.score - a.score);
        leaderboard = leaderboard.slice(0, 50);
        localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(leaderboard));
        updateLeaderboardUI();
    }
}

function loadLeaderboard() {
    // If firebase is enabled, Firestore handles the persistent data
    // This local function will only be used for the local storage fallback
    const data = localStorage.getItem(LEADERBOARD_KEY);
    return data ? JSON.parse(data) : [];
}

function updateLeaderboardUI() {
    const list = document.getElementById('leaderboard-list');

    if (window.isFirebaseEnabled && window.db) {
        window.db.collection("hall_of_heroes")
            .orderBy("score", "desc")
            .limit(10)
            .get()
            .then(querySnapshot => {
                const leaderboard = [];
                querySnapshot.forEach(doc => leaderboard.push(doc.data()));
                renderLeaderboardList(list, leaderboard);
            });
    } else {
        const leaderboard = loadLeaderboard();
        renderLeaderboardList(list, leaderboard);
    }
}

function renderLeaderboardList(list, leaderboard) {
    if (leaderboard.length === 0) {
        list.innerHTML = '<li class="empty-msg">No legends yet...</li>';
        return;
    }

    list.innerHTML = leaderboard.map((entry, index) => `
        <li>
            <span class="rank">#${index + 1}</span>
            <span class="name">${entry.name}</span>
            <span class="score">${entry.score}</span>
        </li>
    `).join('');
}

function endGame(winner) {
    gameActive = false;
    const title = document.getElementById('victory-title');
    const msg = document.getElementById('victory-message');
    const scoreVal = document.getElementById('final-score');
    const scoreSaveContainer = document.getElementById('score-save-container');

    currentScore = calculateScore(winner);
    scoreVal.textContent = currentScore;
    scoreSaveContainer.classList.remove('hidden-soft');

    const nameInput = document.getElementById('player-name');
    if (window.currentUser && window.currentUser.displayName) {
        nameInput.value = window.currentUser.displayName;
        nameInput.disabled = true;
    } else {
        nameInput.value = "The Foreign Viking [ ]";
        nameInput.disabled = false;
        // Place cursor inside brackets
        setTimeout(() => {
            const pos = nameInput.value.indexOf('[') + 1;
            nameInput.setSelectionRange(pos, pos);
            nameInput.focus();
        }, 100);
    }

    if (winner === 'defenders') {
        title.textContent = "Defenders Win!";
        title.style.color = "var(--color-defender)";
        msg.textContent = "The King has escaped to safety!";
    } else {
        title.textContent = "Attackers Win!";
        title.style.color = "var(--color-attacker)";
        msg.textContent = "The King has been captured!";
        title.style.textShadow = "0 0 5px white";
    }

    // Track daily challenge wins
    if ((winner === 'attackers' && playerSide === 'attackers') || (winner === 'defenders' && playerSide === 'defenders')) {
        trackWin();
    }

    victoryModal.classList.remove('hidden');
}

function handleCellClick(r, c) {
    if (!gameActive) return;

    const piece = board[r][c];

    // If selecting a piece
    if (piece !== TYPE_EMPTY) {
        // Check if it belongs to current player
        const isAttackerPiece = (piece === TYPE_ATTACKER || piece === TYPE_ATTACKER_ELITE);
        const isDefenderPiece = (piece === TYPE_DEFENDER || piece === TYPE_KING);

        const isMyTurn = (turn === 'attackers' && isAttackerPiece) ||
            (turn === 'defenders' && isDefenderPiece);

        // --- NEW: Role-based restrictions ---
        let canIControl = true;

        if (gameMode === 'vs-ai') {
            // Can only control my side
            if (turn !== playerSide) canIControl = false;
        } else if (gameMode === '2p-direct' || gameMode === 'random') {
            // Can only control my side
            if (turn !== playerSide) canIControl = false;
        }

        if (isMyTurn && canIControl) {
            selectedCell = { r, c };
            highlightValidMoves(r, c); // This will call renderBoard
        } else {
            // Clicked on opponent's piece or empty cell when a piece is selected
            // If a piece is selected, and we click on an empty cell, try to move
            if (selectedCell && piece === TYPE_EMPTY) {
                if (isValidMove(selectedCell, { r, c })) {
                    movePiece(selectedCell, { r, c });
                } else {
                    console.log("Invalid move");
                    selectedCell = null;
                    validMoves = [];
                    renderBoard();
                }
            } else {
                // Clicked on opponent's piece or empty cell with no selection
                selectedCell = null;
                validMoves = [];
                renderBoard();
            }
        }
    } else {
        // Moving to empty cell
        if (selectedCell) {
            if (isValidMove(selectedCell, { r, c })) {
                movePiece(selectedCell, { r, c });
            } else {
                // Invalid move logic (maybe shake animation or sound)
                console.log("Invalid move");
                selectedCell = null;
                validMoves = [];
                renderBoard();
            }
        } else {
            // Clicked on empty cell with no selection
            selectedCell = null;
            validMoves = [];
            renderBoard();
        }
    }
}

function highlightValidMoves(r, c) {
    validMoves = [];
    const pieceType = board[r][c];

    const directions = [
        { dr: -1, dc: 0 }, { dr: 1, dc: 0 },
        { dr: 0, dc: -1 }, { dr: 0, dc: 1 }
    ];

    directions.forEach(dir => {
        let currR = r + dir.dr;
        let currC = c + dir.dc;

        while (currR >= 0 && currR < BOARD_SIZE && currC >= 0 && currC < BOARD_SIZE) {
            // Check if the current cell is a valid destination
            if (isValidMove({ r, c }, { r: currR, c: currC })) {
                validMoves.push({ r: currR, c: currC });
            }

            // If the current cell is not empty, it's an obstacle, stop scanning in this direction
            // This also covers cases where isValidMove returned false because of a piece at currR, currC
            if (board[currR][currC] !== TYPE_EMPTY) {
                break;
            }

            // Special rule: non-King pieces cannot move through the Throne or Corner squares
            // If the current cell is a special square and the piece is not the King, stop scanning
            // (isValidMove already prevents landing, this prevents moving *through* it)
            const isSpecialSquare = (currR === THRONE.r && currC === THRONE.c) || isCorner(currR, currC);
            if (isSpecialSquare && pieceType !== TYPE_KING) {
                break;
            }

            currR += dir.dr;
            currC += dir.dc;
        }
    });

    renderBoard();
}

function updateUI() {
    currentPlayerElement.textContent = turn.charAt(0).toUpperCase() + turn.slice(1);
    currentPlayerElement.style.color = turn === 'attackers' ? 'var(--color-text-main)' : 'var(--color-gold)';
    moveCountElement.textContent = moveCount;
    capturedAttackersElement.textContent = capturedAttackers;
    capturedDefendersElement.textContent = capturedDefenders;
}


// Event Listeners
document.getElementById('new-game-btn').addEventListener('click', () => {
    myRole = 'host';
    document.getElementById('setup-modal').classList.remove('hidden');
});

document.getElementById('rules-btn').addEventListener('click', () => {
    rulesModal.classList.remove('hidden');
});

document.querySelector('.close-modal').addEventListener('click', () => {
    rulesModal.classList.add('hidden');
});

document.getElementById('play-again-btn').addEventListener('click', () => {
    victoryModal.classList.add('hidden');
    initGame();
});

document.getElementById('save-score-btn').addEventListener('click', () => {
    const nameInput = document.getElementById('player-name');
    const name = nameInput.value.trim();
    saveScore(name, currentScore);
    document.getElementById('score-save-container').classList.add('hidden-soft');
    nameInput.value = '';
});

// --- AI Logic (Advanced Minimax) ---
function makeAIMove() {
    if (!gameActive || gameMode !== 'vs-ai') return;

    const depth = 3; // Balance between speed and strength
    const bestMove = getBestMove(depth);

    if (bestMove) {
        movePiece(bestMove.from, bestMove.to);
    }
}

function getBestMove(depth) {
    let aiPlayer = turn;
    let bestScore = -Infinity;
    let bestMove = null;

    const moves = getAllValidMoves(board, aiPlayer);

    // Sort moves to help with alpha-beta pruning (captures first)
    moves.sort((a, b) => {
        const aCapture = wouldCaptureInState(board, a.from, a.to, aiPlayer) ? 1 : 0;
        const bCapture = wouldCaptureInState(board, b.from, b.to, aiPlayer) ? 1 : 0;
        return bCapture - aCapture;
    });

    for (const move of moves) {
        const boardCopy = board.map(row => [...row]);
        applyMoveToState(boardCopy, move.from, move.to);

        const score = minimax(boardCopy, depth - 1, -Infinity, Infinity, false, aiPlayer);

        if (score > bestScore) {
            bestScore = score;
            bestMove = move;
        }
    }
    return bestMove;
}

function minimax(simBoard, depth, alpha, beta, isMaximizing, aiPlayer) {
    const gameState = checkWinnerInState(simBoard);
    if (gameState) {
        if (gameState === aiPlayer) return 10000 + depth;
        if (gameState === (aiPlayer === 'attackers' ? 'defenders' : 'attackers')) return -10000 - depth;
        return 0; // Draw
    }

    if (depth === 0) {
        return evaluateBoard(simBoard, aiPlayer);
    }

    const currentPlayer = isMaximizing ? aiPlayer : (aiPlayer === 'attackers' ? 'defenders' : 'attackers');
    const moves = getAllValidMoves(simBoard, currentPlayer);

    if (isMaximizing) {
        let maxEval = -Infinity;
        for (const move of moves) {
            const boardCopy = simBoard.map(row => [...row]);
            applyMoveToState(boardCopy, move.from, move.to);
            const evaluation = minimax(boardCopy, depth - 1, alpha, beta, false, aiPlayer);
            maxEval = Math.max(maxEval, evaluation);
            alpha = Math.max(alpha, evaluation);
            if (beta <= alpha) break;
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (const move of moves) {
            const boardCopy = simBoard.map(row => [...row]);
            applyMoveToState(boardCopy, move.from, move.to);
            const evaluation = minimax(boardCopy, depth - 1, alpha, beta, true, aiPlayer);
            minEval = Math.min(minEval, evaluation);
            beta = Math.min(beta, evaluation);
            if (beta <= alpha) break;
        }
        return minEval;
    }
}

function evaluateBoard(simBoard, aiPlayer) {
    let score = 0;
    const opponent = aiPlayer === 'attackers' ? 'defenders' : 'attackers';

    // Find King
    let kingPos = null;
    let attackersCount = 0;
    let defendersCount = 0;

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const piece = simBoard[r][c];
            if (piece === TYPE_KING) kingPos = { r, c };
            else if (piece === TYPE_ATTACKER || piece === TYPE_ATTACKER_ELITE) attackersCount++;
            else if (piece === TYPE_DEFENDER) defendersCount++;
        }
    }

    // Material Balance
    if (aiPlayer === 'attackers') {
        score += (attackersCount * 20) - (defendersCount * 30);
    } else {
        score += (defendersCount * 30) - (attackersCount * 20);
    }

    // King Safety / Escape
    if (kingPos) {
        const distFromCenter = Math.abs(kingPos.r - THRONE.r) + Math.abs(kingPos.c - THRONE.c);
        const distToCorner = Math.min(
            kingPos.r + kingPos.c,
            kingPos.r + (BOARD_SIZE - 1 - kingPos.c),
            (BOARD_SIZE - 1 - kingPos.r) + kingPos.c,
            (BOARD_SIZE - 1 - kingPos.r) + (BOARD_SIZE - 1 - kingPos.c)
        );

        if (aiPlayer === 'defenders') {
            score += distFromCenter * 5; // Encourage movement
            score -= distToCorner * 10; // Closer to corner is good
        } else {
            score -= distFromCenter * 5;
            score += distToCorner * 10;
        }
    }

    return score;
}

// --- Helper Functions for AI ---
function getAllValidMoves(stateBoard, player) {
    const moves = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const piece = stateBoard[r][c];
            const isPlayerPiece = (player === 'attackers' && (piece === TYPE_ATTACKER || piece === TYPE_ATTACKER_ELITE)) ||
                (player === 'defenders' && (piece === TYPE_DEFENDER || piece === TYPE_KING));

            if (isPlayerPiece) {
                const directions = [{ dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 }];
                directions.forEach(dir => {
                    let currR = r + dir.dr;
                    let currC = c + dir.dc;
                    while (currR >= 0 && currR < BOARD_SIZE && currC >= 0 && currC < BOARD_SIZE) {
                        if (isValidMoveInState(stateBoard, { r, c }, { r: currR, c: currC })) {
                            moves.push({ from: { r, c }, to: { r: currR, c: currC } });
                        }
                        if (stateBoard[currR][currC] !== TYPE_EMPTY) break;
                        currR += dir.dr;
                        currC += dir.dc;
                    }
                });
            }
        }
    }
    return moves;
}

function isValidMoveInState(stateBoard, from, to) {
    const piece = stateBoard[from.r][from.c];
    if (stateBoard[to.r][to.c] !== TYPE_EMPTY) return false;

    // Normal pieces cannot land on Throne or Corners
    const isSpecial = (to.r === THRONE.r && to.c === THRONE.c) || isCorner(to.r, to.c);
    if (isSpecial && piece !== TYPE_KING) return false;

    // Movement must be in a straight line (already handled by the direction loop in getAllValidMoves)
    return true;
}

function applyMoveToState(stateBoard, from, to) {
    const piece = stateBoard[from.r][from.c];
    stateBoard[to.r][to.c] = piece;
    stateBoard[from.r][from.c] = TYPE_EMPTY;

    // Simple capture check for simulation
    const player = (piece === TYPE_ATTACKER || piece === TYPE_ATTACKER_ELITE) ? 'attackers' : 'defenders';
    checkCapturesInState(stateBoard, to, player);
}

function checkCapturesInState(stateBoard, to, player) {
    const directions = [{ dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 }];
    directions.forEach(dir => {
        const adjR = to.r + dir.dr;
        const adjC = to.c + dir.dc;
        const farR = to.r + dir.dr * 2;
        const farC = to.c + dir.dc * 2;

        if (farR >= 0 && farR < BOARD_SIZE && farC >= 0 && farC < BOARD_SIZE) {
            const victim = stateBoard[adjR][adjC];
            if (victim !== TYPE_EMPTY && victim !== TYPE_KING) {
                // Check if victim is from opponent side
                const victimIsOpponent = (player === 'attackers' && victim === TYPE_DEFENDER) ||
                    (player === 'defenders' && (victim === TYPE_ATTACKER || victim === TYPE_ATTACKER_ELITE));

                if (victimIsOpponent) {
                    // Hostile square check
                    const farPiece = stateBoard[farR][farC];
                    const farIsHostile = (player === 'attackers' && (farPiece === TYPE_ATTACKER || farPiece === TYPE_ATTACKER_ELITE)) ||
                        (player === 'defenders' && (farPiece === TYPE_DEFENDER || farPiece === TYPE_KING)) ||
                        (farR === THRONE.r && farC === THRONE.c) || isCorner(farR, farC);

                    if (farIsHostile) {
                        stateBoard[adjR][adjC] = TYPE_EMPTY;
                    }
                }
            }
        }
    });
}

function wouldCaptureInState(stateBoard, from, to, player) {
    const tempBoard = stateBoard.map(row => [...row]);
    const piece = tempBoard[from.r][from.c];
    tempBoard[to.r][to.c] = piece;
    tempBoard[from.r][from.c] = TYPE_EMPTY;

    let captures = 0;
    const directions = [{ dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 }];
    directions.forEach(dir => {
        const adjR = to.r + dir.dr;
        const adjC = to.c + dir.dc;
        const farR = to.r + dir.dr * 2;
        const farC = to.c + dir.dc * 2;
        if (farR >= 0 && farR < BOARD_SIZE && farC >= 0 && farC < BOARD_SIZE) {
            const victim = tempBoard[adjR][adjC];
            if (victim !== TYPE_EMPTY && victim !== TYPE_KING) {
                const victimIsOpponent = (player === 'attackers' && victim === TYPE_DEFENDER) ||
                    (player === 'defenders' && (victim === TYPE_ATTACKER || victim === TYPE_ATTACKER_ELITE));
                if (victimIsOpponent) {
                    const farPiece = tempBoard[farR][farC];
                    const farIsHostile = (player === 'attackers' && (farPiece === TYPE_ATTACKER || farPiece === TYPE_ATTACKER_ELITE)) ||
                        (player === 'defenders' && (farPiece === TYPE_DEFENDER || farPiece === TYPE_KING)) ||
                        (farR === THRONE.r && farC === THRONE.c) || isCorner(farR, farC);
                    if (farIsHostile) captures++;
                }
            }
        }
    });
    return captures > 0;
}

function checkWinnerInState(stateBoard) {
    // Escape check
    if (isCorner(0, 0) && stateBoard[0][0] === TYPE_KING) return 'defenders';
    if (isCorner(0, 10) && stateBoard[0][10] === TYPE_KING) return 'defenders';
    if (isCorner(10, 0) && stateBoard[10][0] === TYPE_KING) return 'defenders';
    if (isCorner(10, 10) && stateBoard[10][10] === TYPE_KING) return 'defenders';

    // Capturing King check
    let kingAlive = false;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (stateBoard[r][c] === TYPE_KING) kingAlive = true;
        }
    }
    if (!kingAlive) return 'attackers';

    return null;
}

// --- Daily Challenges System ---
const CHALLENGES_KEY = 'viking_daily_challenges';

function loadChallenges() {
    const today = new Date().toLocaleDateString();
    let data = JSON.parse(localStorage.getItem(CHALLENGES_KEY)) || { date: today, wins: 0, invite: false, level: 1 };

    if (data.date !== today) {
        // Reset daily but keep level
        data = { date: today, wins: 0, invite: false, level: data.level || 1 };
        saveChallenges(data);
    }
    return data;
}

function saveChallenges(data) {
    localStorage.setItem(CHALLENGES_KEY, JSON.stringify(data));
    updateChallengesUI(data);
}

function updateChallengesUI(data) {
    const winProgress = document.getElementById('win-challenge-progress');
    const winText = document.getElementById('win-challenge-text');
    const inviteStatus = document.getElementById('invite-challenge-status');

    if (winProgress) {
        const percent = Math.min((data.wins / 10) * 100, 100);
        winProgress.style.width = percent + '%';
        winText.textContent = `${data.wins}/10`;
    }

    if (inviteStatus) {
        if (data.invite) {
            inviteStatus.textContent = "Complete!";
            inviteStatus.className = "challenge-stat status-complete";
        } else {
            inviteStatus.textContent = "Incomplete";
            inviteStatus.className = "challenge-stat status-incomplete";
        }
    }
}

function trackWin() {
    const data = loadChallenges();
    data.wins++;
    if (data.wins === 10) {
        data.level++;
        showToast("Challenge Complete: 10 wins! Level up!");
    }
    saveChallenges(data);
}

function trackInvite() {
    const data = loadChallenges();
    if (!data.invite) {
        data.invite = true;
        data.level++;
        showToast("Challenge Complete: Invited a friend! Level up!");
        saveChallenges(data);
    }
}

// --- Online Logic (PeerJS) ---
function initOnline() {
    peer = new Peer();

    peer.on('open', (id) => {
        document.getElementById('peer-id-display').value = id;
        document.getElementById('online-status').textContent = "Status: Waiting for opponent...";
        showToast("Invite code generated!");
    });

    peer.on('connection', (c) => {
        conn = c;
        setupConnection();
    });

    peer.on('error', (err) => {
        console.error("PeerJS error:", err);
        document.getElementById('online-status').textContent = "Status: Error " + err.type;
    });
}

function connectToPeer() {
    const peerId = document.getElementById('join-id-input').value.trim();
    if (!peerId) return;

    if (!peer || peer.destroyed) {
        initOnline();
        peer.on('open', () => {
            conn = peer.connect(peerId);
            setupConnection();
        });
    } else {
        conn = peer.connect(peerId);
        setupConnection();
    }
}

function setupConnection() {
    // Challenge: Invite friend
    trackInvite();

    conn.on('open', () => {
        document.getElementById('online-status').textContent = "Status: Connected!";
        showToast("Opponent connected! May the gods be with you.");

        // --- NEW: Start timer when opponent connects ---
        if (isTimerEnabled && myRole === 'host') {
            startTimer();
        }

        // If I am guest, host is attackers, I am defenders (or vice versa based on setup)
        if (myRole === 'guest') {
            // Send request for setup
            conn.send({ type: 'request-setup' });
        }
    });

    conn.on('data', (data) => {
        if (data.type === 'move') {
            movePiece(data.from, data.to, true); // true = isRemote
        } else if (data.type === 'request-setup') {
            conn.send({ type: 'setup', playerSide, isTimerEnabled, timerDuration });
            initGame(); // Host starts here
        } else if (data.type === 'setup') {
            // Apply setup from host
            playerSide = data.playerSide === 'attackers' ? 'defenders' : 'attackers';
            isTimerEnabled = data.isTimerEnabled;
            timerDuration = data.timerDuration;
            initGame();
            // --- NEW: Guest starts timer after init (since they are already connected) ---
            if (isTimerEnabled) startTimer();
        }
    });
}

document.getElementById('connect-btn').addEventListener('click', () => {
    myRole = 'guest';
    connectToPeer();
    showToast("Connecting to opponent...");
});

document.getElementById('copy-id-btn').addEventListener('click', () => {
    const idInput = document.getElementById('peer-id-display');
    idInput.select();
    document.execCommand('copy');
});

// Setup Modal Logic
// ... (previous logic for buttons)
const modeButtons = document.querySelectorAll('.mode-btn');
const sideButtons = document.querySelectorAll('.side-btn');
const timerToggle = document.getElementById('timer-enabled');
const timerSelect = document.getElementById('timer-duration');

modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        modeButtons.forEach(b => b.classList.remove('active-mode'));
        btn.classList.add('active-mode');
        gameMode = btn.id.replace('mode-', '');

        // Show/hide sections
        document.getElementById('online-section').style.display = gameMode === '2p-direct' ? 'block' : 'none';
        document.getElementById('side-selection').style.display = (gameMode === 'vs-ai' || gameMode === '2p-direct') ? 'block' : 'none';

        // Update side help text
        const sideHelp = document.getElementById('side-help-text');
        if (gameMode === '2p-local') {
            sideHelp.textContent = "Local players: Attackers move first.";
            document.getElementById('side-selection').style.display = 'none';
        } else if (gameMode === 'vs-ai') {
            sideHelp.textContent = "Vs AI: Choose your side. Attackers move first.";
        } else if (gameMode === '2p-direct' || gameMode === 'random') {
            sideHelp.textContent = "Online: Side will be assigned automatically (Host = Attackers).";
            document.getElementById('side-selection').style.display = 'none';
            // EVERYONE needs a peer object for online play
            if (!peer || peer.destroyed) {
                initOnline();
            }
        }
    });
});

sideButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        sideButtons.forEach(b => b.classList.remove('active-side'));
        btn.classList.add('active-side');
        playerSide = btn.id.replace('side-', '');
    });
});

timerToggle.addEventListener('change', () => {
    isTimerEnabled = timerToggle.checked;
    timerSelect.disabled = !isTimerEnabled;
});

timerSelect.addEventListener('change', () => {
    timerDuration = parseInt(timerSelect.value);
});

// Setup Modal Listeners
document.getElementById('start-game-btn').addEventListener('click', () => {
    document.getElementById('setup-modal').classList.add('hidden');

    if (gameMode === 'random') {
        startMatchmaking();
    } else {
        initGame();
    }
});

// --- Matchmaking Logic ---
async function startMatchmaking() {
    if (!window.db || !window.isFirebaseEnabled) {
        showToast("Erreur: Firebase n'est pas configuré.");
        return;
    }

    showToast("Recherche d'un adversaire...");
    document.getElementById('online-status').textContent = "Status: Matching...";

    // Ensure peer is ready
    if (!peer || !peer.id) {
        console.log("Waiting for PeerID...");
        await new Promise(resolve => {
            if (peer && peer.id) resolve();
            else peer.on('open', resolve);
        });
    }

    const myId = peer.id;
    const myName = (window.currentUser && window.currentUser.displayName) ? window.currentUser.displayName : "Viking Anonyme";

    try {
        const queueRef = window.db.collection("matchmaking_queue");

        // Try to find someone waiting (limit to 1)
        const snapshot = await queueRef.limit(1).get();

        if (!snapshot.empty) {
            // Found someone!
            const opponent = snapshot.docs[0];
            const opponentData = opponent.data();

            // Delete their entry (we've claimed them)
            await queueRef.doc(opponent.id).delete();

            console.log("Found opponent:", opponentData.name);
            showToast(`Adversaire trouvé: ${opponentData.name}`);

            myRole = 'guest';
            playerSide = 'defenders'; // Guest is Defenders

            // Connect
            conn = peer.connect(opponentData.peerId);
            setupConnection();
        } else {
            // No one waiting, add self to queue
            console.log("No opponent found, waiting...");
            myRole = 'host';
            playerSide = 'attackers'; // Host is Attackers

            const myEntry = await queueRef.add({
                peerId: myId,
                name: myName,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Cleanup on page close
            window.addEventListener('beforeunload', () => {
                queueRef.doc(myEntry.id).delete();
            });

            showToast("En attente d'un adversaire...");
        }
    } catch (e) {
        console.error("Matchmaking error:", e);
        showToast("Erreur lors de la recherche.");
    }
}

document.getElementById('cancel-setup-btn').addEventListener('click', () => {
    document.getElementById('setup-modal').classList.add('hidden');
});

document.getElementById('close-setup-modal').addEventListener('click', () => {
    document.getElementById('setup-modal').classList.add('hidden');
});

// Start
updateLeaderboardUI();
initGame();
updateChallengesUI(loadChallenges());
