/**
 * Hnefatafl - Viking Chess
 * Authentication Logic (Firebase Integration)
 */

// --- Firebase Configuration ---
// REPLACE THIS WITH YOUR OWN FIREBASE CONFIG
const firebaseConfig = {
    apiKey: "AIzaSyDGOobY_Um4v4KH7C99aWy7LSOLyj4hCww",
    authDomain: "hnefatafl-399d4.firebaseapp.com",
    projectId: "hnefatafl-399d4",
    storageBucket: "hnefatafl-399d4.firebasestorage.app",
    messagingSenderId: "1013459573122",
    appId: "1:1013459573122:web:744dd4e12b1cbde6fd179b",
    measurementId: "G-29NEEDDEK1"
};

// --- EmailJS Configuration (For Real Email Verification) ---
// Create a free account at https://www.emailjs.com/
const EMAILJS_PUBLIC_KEY = "OJDb8_3rj7F9ufYYb"; // PASTE YOUR PUBLIC KEY HERE
const EMAILJS_SERVICE_ID = "service_vc58q7f"; // PASTE YOUR SERVICE ID HERE
const EMAILJS_TEMPLATE_ID = "template_6706i9r"; // PASTE YOUR TEMPLATE ID HERE

if (EMAILJS_PUBLIC_KEY) {
    emailjs.init(EMAILJS_PUBLIC_KEY);
}

// Initialize Firebase (Compatibility mode)
window.isFirebaseEnabled = false;
try {
    firebase.initializeApp(firebaseConfig);
    window.isFirebaseEnabled = true;
} catch (e) {
    console.warn("Firebase not initialized. Running in Mock Mode for UI demonstration.");
}

const auth = window.isFirebaseEnabled ? firebase.auth() : null;
window.db = window.isFirebaseEnabled ? firebase.firestore() : null;
const storage = window.isFirebaseEnabled ? firebase.storage() : null;

// --- State Management ---
window.currentUser = null;
let simulatedCode = "";

// --- UI Elements ---
const authModal = document.getElementById('auth-modal');
const closeAuthBtn = document.getElementById('close-auth-modal');
const authEntryBtn = document.getElementById('auth-entry-btn');
const logoutBtn = document.getElementById('logout-btn');
const loggedOutView = document.getElementById('logged-out-view');
const loggedInView = document.getElementById('logged-in-view');
const userAvatar = document.getElementById('user-avatar');
const userDisplayName = document.getElementById('user-display-name');

// State Containers
const states = {
    login: document.getElementById('auth-state-login'),
    signup: document.getElementById('auth-state-signup'),
    verify: document.getElementById('auth-state-verify'),
    profile: document.getElementById('auth-state-profile'),
    reset: document.getElementById('auth-state-reset')
};

// --- Helper Functions ---
function switchState(target) {
    Object.values(states).forEach(el => el.classList.add('hidden-soft'));
    states[target].classList.remove('hidden-soft');
}

function showAuthModal(state = 'login') {
    switchState(state);
    authModal.classList.remove('hidden');
}

function hideAuthModal() {
    authModal.classList.add('hidden');
}

// --- Auth Operations ---

// Sign Up with Email
async function handleSignUp() {
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;

    if (!name || !email || !password) return console.warn("Fields missing");

    // Simulation: Generate a 6-digit code
    simulatedCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Real Email Sending via EmailJS
    if (EMAILJS_PUBLIC_KEY && EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID) {
        // Calculate expiration time (current time + 15 mins)
        const expiryDate = new Date(Date.now() + 15 * 60000);
        const timeString = expiryDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        console.log("Sending email to:", email, "with code:", simulatedCode);
        emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
            to_name: name,
            to_email: email,
            passcode: simulatedCode, // Changed to match your template {{passcode}}
            time: timeString         // Added to match your template {{time}}
        }).then((response) => {
            console.log("EmailJS Success:", response.status, response.text);
            if (window.showToast) window.showToast("Email de vérification envoyé !");
        }).catch((err) => {
            console.error("EmailJS Full Error:", err);
            // If it's a 422, let's see why
            if (err.text) console.error("EmailJS Error Detail:", err.text);
            if (window.showToast) window.showToast("Erreur lors de l'envoi de l'email (voir console).");
        });
    } else {
        // Fallback to simulation toast if no keys
        if (window.showToast) {
            window.showToast(`[MOCK] Code envoyé à ${email} : ${simulatedCode}`);
        }
    }

    console.log(`A verification code (${simulatedCode}) was "sent" to your email.`);
    switchState('verify');
}

// Verify Code
async function handleVerify() {
    const code = document.getElementById('verify-code').value.trim();
    if (code !== simulatedCode) return console.warn("Invalid code");

    // If Firebase is enabled, we'd create the user here
    if (isFirebaseEnabled) {
        try {
            const email = document.getElementById('signup-email').value;
            const password = document.getElementById('signup-password').value;
            const cred = await auth.createUserWithEmailAndPassword(email, password);
            await cred.user.updateProfile({ displayName: document.getElementById('signup-name').value });
        } catch (e) {
            return alert(e.message);
        }
    }

    switchState('profile');
}

// Email Login
async function handleLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) return;

    if (isFirebaseEnabled) {
        try {
            await auth.signInWithEmailAndPassword(email, password);
            hideAuthModal();
        } catch (e) {
            alert(e.message);
        }
    } else {
        // Mock login
        onAuthStateChanged({ displayName: email.split('@')[0], email: email });
        hideAuthModal();
    }
}

// Forgot Password
async function handleForgotPassword() {
    const email = document.getElementById('reset-email').value.trim();
    if (!email) {
        if (window.showToast) window.showToast("Veuillez entrer votre email.");
        return;
    }

    if (isFirebaseEnabled && auth) {
        try {
            await auth.sendPasswordResetEmail(email);
            if (window.showToast) window.showToast("Lien de réinitialisation envoyé !");
            switchState('login');
        } catch (e) {
            console.error("Firebase Password Reset Error:", e.message);
            alert("Erreur Firebase: " + e.message);
        }
    } else {
        if (window.showToast) window.showToast(`[MOCK] Lien envoyé à ${email}`);
        switchState('login');
    }
}

// Profile Setup
async function handleProfileSetup() {
    const username = document.getElementById('setup-username').value.trim();
    if (!username) return console.warn("Username required");

    // Real update
    if (isFirebaseEnabled && auth.currentUser) {
        await auth.currentUser.updateProfile({ displayName: username });
        // Handle image upload if needed
    }

    // Update UI
    userDisplayName.textContent = username;
    hideAuthModal();
    onAuthStateChanged(isFirebaseEnabled ? auth.currentUser : { displayName: username, photoURL: 'roi.png' });
}

// OAuth Logins
async function handleOAuth(providerName) {
    if (!isFirebaseEnabled) {
        // Mock login
        onAuthStateChanged({ displayName: `Viking ${providerName}`, photoURL: 'roi.png' });
        hideAuthModal();
        return;
    }

    let provider;
    if (providerName === 'google') provider = new firebase.auth.GoogleAuthProvider();

    try {
        const result = await auth.signInWithPopup(provider);
        onAuthStateChanged(result.user);
        hideAuthModal();
    } catch (e) {
        console.error("Auth error:", e.message);
        // Optionally show on UI if we had a dedicated error label
    }
}

// Auth State Observer
async function onAuthStateChanged(user) {
    window.currentUser = user;
    if (user) {
        loggedOutView.classList.add('hidden-soft');
        loggedInView.classList.remove('hidden-soft');

        // Fetch Level from Daily Challenges system (LocalStorage for now)
        let level = 1;
        const challengesData = localStorage.getItem('viking_daily_challenges');
        if (challengesData) {
            try {
                level = JSON.parse(challengesData).level || 1;
            } catch (e) { console.error("Error parsing challenges:", e); }
        }

        userDisplayName.innerHTML = `Viking (Niv. ${level})`;

        if (user.photoURL) userAvatar.src = user.photoURL;
    } else {
        loggedOutView.classList.remove('hidden-soft');
        loggedInView.classList.add('hidden-soft');
    }
    // Update leaderboard to show potentially restricted personal scores
    if (window.updateLeaderboardUI) window.updateLeaderboardUI();
}

// --- Event Listeners ---
authEntryBtn.addEventListener('click', () => showAuthModal());
closeAuthBtn.addEventListener('click', hideAuthModal);
logoutBtn.addEventListener('click', () => {
    if (isFirebaseEnabled) auth.signOut();
    onAuthStateChanged(null);
});

document.getElementById('goto-signup').addEventListener('click', (e) => { e.preventDefault(); switchState('signup'); });
document.getElementById('goto-login').addEventListener('click', (e) => { e.preventDefault(); switchState('login'); });
document.getElementById('goto-reset').addEventListener('click', (e) => { e.preventDefault(); switchState('reset'); });
document.getElementById('goto-login-from-reset').addEventListener('click', (e) => { e.preventDefault(); switchState('login'); });

document.getElementById('email-login-btn').addEventListener('click', handleLogin);
document.getElementById('send-code-btn').addEventListener('click', handleSignUp);
document.getElementById('verify-btn').addEventListener('click', handleVerify);
document.getElementById('finish-profile-btn').addEventListener('click', handleProfileSetup);
document.getElementById('send-reset-btn').addEventListener('click', handleForgotPassword);

document.getElementById('google-login-btn').addEventListener('click', () => handleOAuth('google'));

// Avatar Upload Preview
document.getElementById('avatar-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (re) => {
            document.getElementById('setup-avatar-preview').src = re.target.result;
            userAvatar.src = re.target.result;
        };
        reader.readAsDataURL(file);
    }
});

// Initialize State
if (isFirebaseEnabled) {
    auth.onAuthStateChanged(onAuthStateChanged);
}
