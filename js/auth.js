// =============================================
// AUTHENTICATION UI HANDLERS
// =============================================

import { signIn, signUp, signOut, getCurrentUser, onAuthStateChange } from './supabase.js';

// Open auth modal
window.openAuthModal = function () {
    const modal = document.getElementById('auth-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

// Close auth modal
window.closeAuthModal = function () {
    const modal = document.getElementById('auth-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
};

// Switch between login and signup tabs
window.switchAuthTab = function (tab) {
    const loginTab = document.getElementById('login-tab');
    const signupTab = document.getElementById('signup-tab');
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');

    if (tab === 'login') {
        // Show login
        loginTab.classList.add('border-white');
        loginTab.classList.remove('text-gray-400');
        signupTab.classList.remove('border-white');
        signupTab.classList.add('border-transparent', 'text-gray-400');

        loginForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
    } else {
        // Show signup
        signupTab.classList.add('border-white');
        signupTab.classList.remove('text-gray-400');
        loginTab.classList.remove('border-white');
        loginTab.classList.add('border-transparent', 'text-gray-400');

        signupForm.classList.remove('hidden');
        loginForm.classList.add('hidden');
    }
};

// Handle login form submit
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    // Show loading state
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Signing in...';
    submitBtn.disabled = true;

    const { data, error } = await signIn(email, password);

    if (error) {
        alert(`Login failed: ${error.message}`);
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    } else {
        // Success!
        closeAuthModal();
        showToast('Welcome back!', 'success');
        updateUserUI(data.user);
    }
});

// Handle signup form submit
document.getElementById('signup-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('signup-username').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;

    // Show loading state
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Creating account...';
    submitBtn.disabled = true;

    const { data, error } = await signUp(email, password, username);

    if (error) {
        alert(`Signup failed: ${error.message}`);
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    } else {
        // Success!
        closeAuthModal();
        showToast('Account created! Please check your email to confirm.', 'success', 5000);
        // Note: User needs to confirm email before they can login
    }
});

// Update UI based on auth state
function updateUserUI(user) {
    const userIndicator = document.getElementById('user-indicator');

    if (user) {
        // User is logged in
        if (userIndicator) {
            userIndicator.innerHTML = `
                <div class="flex items-center gap-2">
                    <span class="hidden sm:inline text-sm text-white">${user.email}</span>
                    <button onclick="handleSignOut()" 
                            class="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold transition">
                        Sign Out
                    </button>
                </div>
            `;
        }
    } else {
        // User is not logged in
        if (userIndicator) {
            userIndicator.innerHTML = `
                <button onclick="openAuthModal()" 
                        class="px-4 py-2 rounded-full bg-white text-black font-semibold hover:bg-gray-200 transition">
                    Sign In
                </button>
            `;
        }
    }
}

// Handle sign out
window.handleSignOut = async function () {
    const { error } = await signOut();
    if (!error) {
        showToast('Signed out successfully', 'success');
        updateUserUI(null);
    }
};

// Listen to auth state changes
onAuthStateChange((event, session) => {
    console.log('Auth state changed:', event, session);
    if (event === 'SIGNED_IN') {
        updateUserUI(session.user);
    } else if (event === 'SIGNED_OUT') {
        updateUserUI(null);
    }
});

// Initialize auth UI on page load
(async function initAuth() {
    try {
        const user = await getCurrentUser();
        console.log('Current user on init:', user);
        updateUserUI(user);
    } catch (error) {
        console.error('Auth init error:', error);
        // If there's an error, still show the sign in button
        updateUserUI(null);
    }
})();

// Also ensure user indicator exists
window.addEventListener('DOMContentLoaded', () => {
    const userIndicator = document.getElementById('user-indicator');
    if (userIndicator && !userIndicator.innerHTML.trim()) {
        // If empty, show sign in button
        userIndicator.innerHTML = `
            <button onclick="openAuthModal()" 
                    class="btn-secondary btn-sm px-4 py-2">
                Sign In
            </button>
        `;
    }
});

// Handle email verification redirect
window.addEventListener('hashchange', handleEmailVerification);
window.addEventListener('load', handleEmailVerification);

async function handleEmailVerification() {
    const hash = window.location.hash;

    // Check if this is an email verification redirect
    if (hash.includes('access_token') && hash.includes('type=signup')) {
        console.log('Email verification detected');

        // Wait a moment for Supabase to process
        setTimeout(async () => {
            const user = await getCurrentUser();
            if (user) {
                updateUserUI(user);
                alert('✅ Email verified! Welcome to Wallpaper Studio Pro!');

                // Clean up URL
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        }, 1000);
    }
}
