// --- START OF FILE app.js ---

// Wallpaper Studio Pro - Main Application
import { GENRES, STYLES, COLOR_BIASES, RANDOM_MODIFIERS, PROMPT_TEMPLATES, API_CONFIG, APP_CONFIG } from './config.js';
import { uploadWallpaper, getCurrentUser, saveWallpaperRecord, fetchWallpapers, deleteWallpaper, onAuthStateChange, supabase } from './supabase.js';
import { showToast } from './toast.js';

// ============================================================================
// STATE MANAGEMENT & GLOBALS
// ============================================================================
const state = {
    activeGenreIndex: 0,
    activeStyleIndex: 0,
    selectedColorBias: null,
    isDesktopMode: false,
    customColor: null,
    favorites: JSON.parse(localStorage.getItem('wallpaper_favorites') || '[]'),
    advancedMode: false,
    seed: null,
    numSteps: 4,
    historyFilter: 'all',
    isPromptManuallyEdited: false,
    currentParentId: null // Category C: Track remix parent
};

// Global WebGL Variables
let targetColor = new THREE.Color(0x444444);
let particleMaterial = null;

// Global Timer for Typewriter Effect
let typewriterTimeout = null;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function isMobileDevice() {
    return window.innerWidth < 768;
}

// showToast is now imported from toast.js

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!', 'success');
    } catch (err) {
        showToast('Failed to copy', 'error');
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================
window.onload = () => {
    if (window.lucide) lucide.createIcons();

    // 1. Initial State Setup
    loadPreferences();

    // 2. Parse URL Parameters (Remix Support)
    const urlParams = new URLSearchParams(window.location.search);
    const remixGenre = urlParams.get('genre');
    const remixStyle = urlParams.get('style');
    const remixPrompt = urlParams.get('prompt');
    const remixSeed = urlParams.get('seed');

    if (remixGenre) {
        const index = GENRES.findIndex(g => g.id === remixGenre || g.name === remixGenre);
        if (index !== -1) state.activeGenreIndex = index;
    }
    if (remixStyle) {
        const index = STYLES.findIndex(s => s.id === remixStyle || s.name === remixStyle);
        if (index !== -1) state.activeStyleIndex = index;
    }
    if (remixPrompt) {
        state.isPromptManuallyEdited = true;
        document.getElementById('custom-prompt').value = decodeURIComponent(remixPrompt);
    }
    if (remixSeed) {
        state.seed = parseInt(remixSeed);
        document.getElementById('seed-input').value = remixSeed;
    }
    const remixParent = urlParams.get('parentId');
    if (remixParent) state.currentParentId = remixParent;

    // 3. Auth Listener & Initial Sync
    onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
            console.log('User signed in, refreshing history');
            renderHistory();
            renderRecentHistory();
        } else if (event === 'SIGNED_OUT') {
            renderHistory();
            renderRecentHistory();
        }
    });

    // 4. UI Initialization
    initCarousel();
    initSwipeGestures();
    initParallax();
    initWebGL();

    initMagneticButtons();
    initShinyBorders();

    initKeyboardNavigation();
    renderHistory();
    renderRecentHistory();
    renderFavorites();
    updateTime();

    const generateBtn = document.getElementById('generate-button');
    if (generateBtn) generateBtn.addEventListener('click', handleGenerate);

    const promptInput = document.getElementById('custom-prompt');
    if (promptInput) {
        promptInput.addEventListener('input', () => {
            state.isPromptManuallyEdited = true;
        });
    }

    updateCarouselUI();

    if (urlParams.has('remix')) {
        showToast('Settings loaded. Feel free to remix!', 'success', 4000);
    }
};

function loadPreferences() {
    const saved = localStorage.getItem('wallpaper_preferences');
    if (saved) {
        try {
            const prefs = JSON.parse(saved);
            state.activeGenreIndex = prefs.genreIndex || 0;
            state.activeStyleIndex = prefs.styleIndex || 0;
        } catch (e) {
            console.error("Error loading preferences", e);
        }
    }
}

function savePreferences() {
    localStorage.setItem('wallpaper_preferences', JSON.stringify({
        genreIndex: state.activeGenreIndex,
        styleIndex: state.activeStyleIndex
    }));
}

// ============================================================================
// CAROUSEL & UI LOGIC
// ============================================================================
function initCarousel() {
    const genreTrack = document.getElementById('genre-track');
    const styleTrack = document.getElementById('style-track');

    if (!GENRES || !STYLES) return;

    const buildSlides = (items, track) => {
        track.innerHTML = '';
        items.forEach((item) => {
            const el = document.createElement('div');
            el.className = 'carousel-item';
            el.style.backgroundImage = `url('${item.image}')`;
            el.innerHTML = `<div class="w-full h-full carousel-overlay"></div>`;
            track.appendChild(el);
        });
    };

    buildSlides(GENRES, genreTrack);
    buildSlides(STYLES, styleTrack);
}

function updateCarouselUI() {
    if (!GENRES || !STYLES) return;

    const genreTrack = document.getElementById('genre-track');
    const styleTrack = document.getElementById('style-track');

    if (genreTrack) genreTrack.style.transform = `translateX(-${state.activeGenreIndex * 100}%)`;
    if (styleTrack) styleTrack.style.transform = `translateX(-${state.activeStyleIndex * 100}%)`;

    // Active Slide Classes
    if (genreTrack) {
        Array.from(genreTrack.children).forEach((child, index) => {
            if (index === state.activeGenreIndex) child.classList.add('is-active');
            else child.classList.remove('is-active');
        });
    }

    if (styleTrack) {
        Array.from(styleTrack.children).forEach((child, index) => {
            if (index === state.activeStyleIndex) child.classList.add('is-active');
            else child.classList.remove('is-active');
        });
    }

    // Update Labels
    const genreLabel = document.getElementById('genre-label');
    const styleLabel = document.getElementById('style-label');
    if (genreLabel) genreLabel.innerText = GENRES[state.activeGenreIndex].name;
    if (styleLabel) styleLabel.innerText = STYLES[state.activeStyleIndex].name;

    // Aurora Background Logic
    const colorHex = GENRES[state.activeGenreIndex].color || 0x444444;
    const color = new THREE.Color(colorHex);
    targetColor.copy(color);

    const aurora1 = document.getElementById('aurora-1');
    const aurora2 = document.getElementById('aurora-2');
    if (aurora1) aurora1.style.backgroundColor = `rgba(${color.r * 255}, ${color.g * 255}, ${color.b * 255}, 0.3)`;
    if (aurora2) {
        const styleColor = new THREE.Color(STYLES[state.activeStyleIndex].color || 0x888888);
        aurora2.style.backgroundColor = `rgba(${styleColor.r * 255}, ${styleColor.g * 255}, ${styleColor.b * 255}, 0.2)`;
    }

    updateCustomPromptPlaceholder();
    savePreferences();
}

// Category A: Update CSS Variables for Aurora Background
function updateAuroraColors(hexColor) {
    const color = new THREE.Color(hexColor);
    const r = color.r * 255;
    const g = color.g * 255;
    const b = color.b * 255;

    // Set CSS variable for gradients if supported in CSS
    document.documentElement.style.setProperty('--aurora-color', `rgba(${r}, ${g}, ${b}, 0.4)`);
    document.documentElement.style.setProperty('--aurora-color-secondary', `rgba(${r}, ${g}, ${b}, 0.1)`);
}

// Category B: Typewriter Effect for Prompt
function updateCustomPromptPlaceholder() {
    if (!GENRES || !STYLES) return;

    const genre = GENRES[state.activeGenreIndex].prompt;
    const style = STYLES[state.activeStyleIndex].prompt;
    const color = state.selectedColorBias ? `, ${state.selectedColorBias} color palette` : '';
    const customColorText = state.customColor ? `, ${state.customColor} tones` : '';
    const text = `${genre}, ${style}${color}${customColorText}.wallpaper, highly detailed.`;

    const area = document.getElementById('custom-prompt');
    if (!area) return;

    area.placeholder = text;

    if (!state.isPromptManuallyEdited) {
        // Clear previous timeout to avoid overlapping typing
        if (typewriterTimeout) clearTimeout(typewriterTimeout);

        let i = 0;
        area.value = "";
        const speed = 10; // ms per char

        function type() {
            if (i < text.length) {
                area.value += text.charAt(i);
                i++;
                typewriterTimeout = setTimeout(type, speed);
            }
        }
        type();
    }
}

// ============================================================================
// MICRO-INTERACTIONS (CATEGORY B)
// ============================================================================

// B5: Magnetic Buttons
function initMagneticButtons() {
    if (isMobileDevice()) return;

    const btns = document.querySelectorAll('.btn-haptic, button');

    btns.forEach(btn => {
        btn.addEventListener('mousemove', (e) => {
            const rect = btn.getBoundingClientRect();
            // Calculate distance from center
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;

            // Move button slightly towards mouse (Magnetic effect)
            btn.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px)`;
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'translate(0px, 0px)';
        });

        // B8: Interactive Squeeze Click
        btn.addEventListener('mousedown', () => {
            btn.style.transform = 'scale(0.95, 0.95)';
        });

        btn.addEventListener('mouseup', () => {
            btn.style.transform = 'scale(1.05, 1.05)';
            setTimeout(() => btn.style.transform = 'translate(0,0)', 150);
        });
    });
}

// A4: Shiny Borders (Glassmorphic Glow)
function initShinyBorders() {
    const cards = document.querySelectorAll('.split-card-container, #advanced-controls');

    document.addEventListener('mousemove', (e) => {
        cards.forEach(card => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
        });
    });
}

// B6: Confetti Success
function triggerConfetti() {
    const count = 100;
    const origin = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    for (let i = 0; i < count; i++) {
        const particle = document.createElement('div');
        particle.classList.add('confetti'); // Ensure this class is defined in CSS (position fixed, etc)

        // Random properties
        const angle = Math.random() * Math.PI * 2;
        const velocity = 2 + Math.random() * 6;
        const tx = Math.cos(angle) * velocity * 100;
        const ty = Math.sin(angle) * velocity * 100;
        const color = ['#ff0', '#f0f', '#0ff', '#0f0', '#fff'][Math.floor(Math.random() * 5)];

        particle.style.cssText = `
            position: fixed;
            left: ${origin.x}px;
            top: ${origin.y}px;
            width: 6px;
            height: 6px;
            background: ${color};
            border-radius: 50%;
            pointer-events: none;
            z-index: 9999;
            transition: all 1s ease-out;
            opacity: 1;
        `;

        document.body.appendChild(particle);

        // Animate
        requestAnimationFrame(() => {
            particle.style.transform = `translate(${tx}px, ${ty}px) scale(0)`;
            particle.style.opacity = '0';
        });

        // Cleanup
        setTimeout(() => particle.remove(), 1000);
    }
}

// ============================================================================
// CAROUSEL NAVIGATION & PROMPT PROTECTION
// ============================================================================
function checkPromptConflict() {
    if (state.isPromptManuallyEdited) {
        const choice = confirm(
            "You have a custom prompt active.\n\n" +
            "Click OK to DISCARD it and switch styles.\n" +
            "Click CANCEL to keep your prompt."
        );

        if (choice) {
            const oldPrompt = document.getElementById('custom-prompt').value;
            navigator.clipboard.writeText(oldPrompt).then(() => {
                showToast("Old prompt copied to clipboard", "info");
            }).catch(() => { });

            state.isPromptManuallyEdited = false;
            document.getElementById('custom-prompt').value = '';
            return true;
        }
        return false;
    }
    return true;
}

function nextSlide(type) {
    if (!checkPromptConflict()) return;

    if (type === 'genre') {
        state.activeGenreIndex = (state.activeGenreIndex + 1) % GENRES.length;
    } else {
        state.activeStyleIndex = (state.activeStyleIndex + 1) % STYLES.length;
    }
    updateCarouselUI();
}

function prevSlide(type) {
    if (!checkPromptConflict()) return;

    if (type === 'genre') {
        state.activeGenreIndex = (state.activeGenreIndex - 1 + GENRES.length) % GENRES.length;
    } else {
        state.activeStyleIndex = (state.activeStyleIndex - 1 + STYLES.length) % STYLES.length;
    }
    updateCarouselUI();
}

function randomize() {
    state.isPromptManuallyEdited = false;
    const promptInput = document.getElementById('custom-prompt');
    if (promptInput) promptInput.value = '';

    const overlay = document.getElementById('generation-overlay');
    if (overlay && !overlay.classList.contains('hidden')) {
        closeGenerationDisplay();
    }

    const cycles = 5;
    let count = 0;
    const interval = setInterval(() => {
        state.activeGenreIndex = Math.floor(Math.random() * GENRES.length);
        state.activeStyleIndex = Math.floor(Math.random() * STYLES.length);
        updateCarouselUI();
        count++;
        if (count > cycles) clearInterval(interval);
    }, 100);
}

// ============================================================================
// KEYBOARD & GESTURES
// ============================================================================
function initKeyboardNavigation() {
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;

        const overlay = document.getElementById('generation-overlay');
        const isGenerationOverlayOpen = overlay && !overlay.classList.contains('hidden');

        switch (e.key) {
            case 'ArrowLeft': e.preventDefault(); prevSlide('genre'); break;
            case 'ArrowRight': e.preventDefault(); nextSlide('genre'); break;
            case 'ArrowUp': e.preventDefault(); prevSlide('style'); break;
            case 'ArrowDown': e.preventDefault(); nextSlide('style'); break;
            case 'Enter':
                if (!document.getElementById('result-modal').classList.contains('hidden')) return;
                e.preventDefault(); handleGenerate(); break;
            case 'r': case 'R': if (!e.metaKey) { e.preventDefault(); randomize(); } break;
            case 'h': case 'H': if (!e.metaKey) { e.preventDefault(); toggleHistory(); } break;
            case 'v': case 'V': if (isGenerationOverlayOpen) { e.preventDefault(); viewFullResult(); } break;
            case 'd': case 'D': if (isGenerationOverlayOpen) { e.preventDefault(); downloadGenerated(); } break;
            case 'x': case 'X': case 'Escape':
                e.preventDefault();
                if (isGenerationOverlayOpen) closeGenerationDisplay();
                else {
                    closeResult();
                    const drawer = document.getElementById('history-drawer');
                    if (drawer && !drawer.classList.contains('translate-x-full')) toggleHistory();
                }
                break;
        }
    });
}

function initSwipeGestures() {
    const setupSwipe = (elementId, type) => {
        const el = document.getElementById(elementId);
        if (!el) return;
        let touchStartX = 0;
        let touchEndX = 0;

        el.addEventListener('touchstart', e => touchStartX = e.changedTouches[0].screenX, { passive: true });
        el.addEventListener('touchend', e => {
            touchEndX = e.changedTouches[0].screenX;
            if (touchEndX < touchStartX - 50) nextSlide(type);
            if (touchEndX > touchStartX + 50) prevSlide(type);
        }, { passive: true });
    };
    setupSwipe('genre-track', 'genre');
    setupSwipe('style-track', 'style');
}

function initParallax() {
    const container = document.getElementById('tilt-wrapper');
    const card = document.getElementById('main-card');
    if (isMobileDevice() || !container || !card) return;

    document.addEventListener('mousemove', (e) => {
        const { clientX, clientY } = e;
        const xPos = (clientX / window.innerWidth - 0.5) * 2;
        const yPos = (clientY / window.innerHeight - 0.5) * 2;
        container.style.transform = `rotateX(${yPos * -10}deg) rotateY(${xPos * 10}deg)`;
    });

    document.addEventListener('mouseleave', () => {
        container.style.transform = `rotateX(0deg) rotateY(0deg)`;
    });
}

// ============================================================================
// UI TOGGLES
// ============================================================================
function togglePromptEditor() {
    const area = document.getElementById('custom-prompt');
    if (!area) return;
    area.classList.toggle('hidden');
    if (!area.classList.contains('hidden')) {
        updateCustomPromptPlaceholder();
        area.focus();
    }
}

function copyPrompt() {
    const area = document.getElementById('custom-prompt');
    if (area) copyToClipboard(area.value || area.placeholder);
}

function toggleAspectRatio() {
    state.isDesktopMode = !state.isDesktopMode;
    const btn = document.getElementById('aspect-btn');
    const container = document.getElementById('main-card');
    const w = document.getElementById('width');
    const h = document.getElementById('height');

    if (state.isDesktopMode) {
        btn.innerHTML = '<i data-lucide="monitor" class="text-white w-5 h-5"></i>';
        w.value = APP_CONFIG.DESKTOP_WIDTH;
        h.value = APP_CONFIG.DESKTOP_HEIGHT;
        container.classList.add('desktop-mode');
        showToast('Desktop mode (1920x1080)', 'info', 2000);
    } else {
        btn.innerHTML = '<i data-lucide="smartphone" class="text-white w-5 h-5"></i>';
        w.value = APP_CONFIG.DEFAULT_WIDTH;
        h.value = APP_CONFIG.DEFAULT_HEIGHT;
        container.classList.remove('desktop-mode');
        showToast('Mobile mode (1080x1920)', 'info', 2000);
    }
    if (window.lucide) lucide.createIcons();
}

function setColorBias(color) {
    state.selectedColorBias = color;
    document.querySelectorAll('.color-dot').forEach(dot => dot.classList.remove('selected'));
    event.currentTarget.classList.add('selected');
    updateCustomPromptPlaceholder();
}

function setCustomColor() {
    const picker = document.getElementById('custom-color-picker');
    if (picker) {
        state.customColor = picker.value;
        showToast(`Custom color: ${picker.value}`, 'info', 2000);
        updateCustomPromptPlaceholder();
    }
}

function toggleAdvancedControls() {
    state.advancedMode = !state.advancedMode;
    const panel = document.getElementById('advanced-controls');
    panel.classList.toggle('expanded');
    const btn = event.currentTarget;
    const icon = btn.querySelector('i');
    if (icon) {
        icon.setAttribute('data-lucide', state.advancedMode ? 'chevron-up' : 'chevron-down');
        if (window.lucide) lucide.createIcons();
    }
}

function updateSeed(value) { state.seed = value ? parseInt(value) : null; }
function updateSteps(value) {
    state.numSteps = parseInt(value);
    document.getElementById('steps-value').textContent = value;
}
function randomSeed() {
    const seed = Math.floor(Math.random() * 1000000);
    document.getElementById('seed-input').value = seed;
    state.seed = seed;
    showToast(`Random seed: ${seed}`, 'info', 2000);
}

// ============================================================================
// HISTORY & FAVORITES
// ============================================================================
const historyObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
            setTimeout(() => entry.target.classList.add('reveal'), index * 50);
            historyObserver.unobserve(entry.target);
        }
    });
}, { root: document.getElementById('history-drawer'), threshold: 0.1 });

window.setHistoryFilter = function (filter) {
    state.historyFilter = filter;
    const tabAll = document.getElementById('tab-all');
    const tabFav = document.getElementById('tab-favorites');

    // Toggle logic
    const activeClass = "flex-1 py-2.5 text-sm font-bold rounded-lg bg-white text-black shadow-lg flex items-center justify-center gap-2";
    const inactiveClass = "flex-1 py-2.5 text-sm font-bold rounded-lg text-gray-400 hover:text-white flex items-center justify-center gap-2";

    if (filter === 'all') {
        tabAll.className = activeClass; tabFav.className = inactiveClass;
    } else {
        tabAll.className = inactiveClass; tabFav.className = activeClass;
    }
    renderHistory();
}

function toggleHistory() {
    const drawer = document.getElementById('history-drawer');
    const overlay = document.getElementById('history-overlay');
    if (drawer.classList.contains('translate-x-full')) {
        drawer.classList.remove('translate-x-full');
        overlay.classList.remove('hidden');
        renderHistory();
    } else {
        drawer.classList.add('translate-x-full');
        overlay.classList.add('hidden');
    }
}

async function saveToHistory(url, genreName, styleName, prompt, seed) {
    const user = await getCurrentUser();

    if (user) {
        // Logged-in: Save to Supabase database
        try {
            const { data, error } = await saveWallpaperRecord({
                title: `${genreName} - ${styleName}`,
                description: prompt || 'AI Generated Wallpaper',
                imageUrl: url,
                genre: genreName,
                style: styleName,
                prompt: prompt,
                seed: seed,
                width: state.isDesktopMode ? APP_CONFIG.DESKTOP_WIDTH : APP_CONFIG.DEFAULT_WIDTH,
                height: state.isDesktopMode ? APP_CONFIG.DESKTOP_HEIGHT : APP_CONFIG.DEFAULT_HEIGHT,
                isPublic: false  // Private by default until user shares
            });

            if (error) {
                console.error('Failed to save to database:', error);
                showToast('Failed to save wallpaper', 'error');
                return;
            }

            showToast('Wallpaper saved to your collection', 'success');
        } catch (e) {
            console.error('Save error:', e);
            showToast('Failed to save wallpaper', 'error');
        }
    } else {
        // Guest mode: Save to localStorage
        const history = JSON.parse(localStorage.getItem('wallpaper_history') || '[]');
        const newItem = {
            url,
            genre: genreName,
            style: styleName,
            prompt,
            seed,
            date: new Date().toLocaleString(),
            timestamp: Date.now()
        };
        history.unshift(newItem);
        if (history.length > (APP_CONFIG.MAX_HISTORY_ITEMS || 50)) history.pop();
        localStorage.setItem('wallpaper_history', JSON.stringify(history));
    }

    renderRecentHistory();
}

async function renderRecentHistory() {
    const container = document.getElementById('recent-history');
    if (!container) return;

    let history = [];
    const user = await getCurrentUser();

    if (user) {
        // Fetch from DB if user logged in
        const { data } = await fetchWallpapers({ userId: user.id, limit: 8 });
        history = data || [];
    } else {
        // Fallback to local for guests
        history = JSON.parse(localStorage.getItem('wallpaper_history') || '[]');
    }

    container.innerHTML = '';
    if (history.length === 0) {
        container.innerHTML = '<div class="text-white/20 text-xs py-10 uppercase tracking-widest w-full text-center">No Creations Yet</div>';
        return;
    }

    history.forEach(item => {
        const card = document.createElement('div');
        card.className = 'flex-shrink-0 w-32 md:w-40 aspect-[9/16] rounded-2xl overflow-hidden glass-main border border-white/5 relative group cursor-pointer snap-start';
        card.onclick = () => showResult(item.image_url || item.url, item.seed);

        card.innerHTML = `
            <img src="${item.thumbnail_url || item.image_url || item.url}" class="w-full h-full object-cover opacity-60 group-hover:scale-110 group-hover:opacity-100 transition-all duration-700">
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
            <div class="absolute bottom-3 left-3">
                <p class="text-[8px] font-black uppercase tracking-widest text-white/40 mb-1">${item.genre}</p>
                <div class="flex gap-1">
                    <div class="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></div>
                    <div class="w-1.5 h-1.5 rounded-full bg-white/20"></div>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function clearHistory() {
    if (confirm('Clear history? Favorites will be kept.')) {
        localStorage.removeItem('wallpaper_history');
        renderHistory();
        showToast('History cleared', 'success');
    }
}

// In app.js, replace the renderHistory function with this:

async function renderHistory() {
    const list = document.getElementById('history-list');
    if (!list) return;

    let history = [];
    const user = await getCurrentUser();

    if (user) {
        // Fetch from DB
        const { data } = await fetchWallpapers({ userId: user.id });
        history = data || [];
        // Map fields to match history format if needed, but fetchWallpapers returns DB format
    } else {
        // Guest mode
        history = JSON.parse(localStorage.getItem('wallpaper_history') || '[]');
    }

    historyObserver.disconnect();
    list.innerHTML = '';

    if (state.historyFilter === 'favorites') {
        history = history.filter(item => state.favorites.includes(item.image_url || item.url));
    }

    if (history.length === 0) {
        list.innerHTML = `
            <div class="flex flex-col items-center justify-center h-64 text-gray-500 opacity-50 col-span-full">
                <span class="material-symbols-outlined text-4xl mb-4">image</span>
                <p class="text-xs uppercase tracking-widest">No masterpieces found.</p>
            </div>`;
        return;
    }

    history.forEach((item) => {
        const itemUrl = item.image_url || item.url;
        const isFav = state.favorites.includes(itemUrl);
        const card = document.createElement('div');
        card.className = 'history-card reveal';

        card.innerHTML = `
            <img src="${item.thumbnail_url || itemUrl}" class="history-card-img" loading="lazy" onclick="showResult('${itemUrl}', ${item.seed || 'null'})">
            
            <div class="overlay-info">
                <span class="overlay-title">${item.genre}</span>
            </div>

            <button onclick="event.stopPropagation(); toggleFavorite('${itemUrl}')" class="history-fav-btn ${isFav ? 'active' : ''}">
                <span class="material-symbols-outlined text-sm ${isFav ? 'fill-1' : ''}">${isFav ? 'star' : 'star'}</span>
            </button>

            <div class="history-actions-overlay">
                <div class="history-btn-group">
                    <button onclick="event.stopPropagation(); remixImage('${item.id || item.timestamp}')" class="catalog-btn" title="Remix">
                        <span class="material-symbols-outlined">shuffle</span>
                    </button>
                    
                    <button onclick="event.stopPropagation(); showResult('${itemUrl}', ${item.seed})" class="catalog-btn" title="View">
                        <span class="material-symbols-outlined">visibility</span>
                    </button>
                    
                    <button onclick="event.stopPropagation(); downloadImageDirect('${itemUrl}')" class="catalog-btn" title="Download">
                        <span class="material-symbols-outlined">download</span>
                    </button>

                    <button onclick="event.stopPropagation(); shareHistoryItemToCommunity('${item.id || item.timestamp}')" class="catalog-btn" title="Share to Community">
                        <span class="material-symbols-outlined">share</span>
                    </button>

                    <button onclick="event.stopPropagation(); deleteHistoryItem('${item.id || item.timestamp}')" class="catalog-btn btn-delete" title="Delete">
                        <span class="material-symbols-outlined">trash</span>
                    </button>
                </div>
            </div>
        `;
        list.appendChild(card);
        historyObserver.observe(card);
    });

    if (window.lucide) lucide.createIcons();
}
async function deleteHistoryItem(id) {
    if (!confirm('Are you sure you want to delete this masterpiece?')) return;

    const user = await getCurrentUser();
    if (user) {
        // Delete from DB
        const { error } = await deleteWallpaper(id);
        if (error) {
            showToast('Delete failed: ' + error.message, 'error');
        } else {
            showToast('Masterpiece deleted from cloud', 'success');
            renderHistory();
            renderRecentHistory();
        }
    } else {
        // Guest mode deletion
        let history = JSON.parse(localStorage.getItem('wallpaper_history') || '[]');
        history = history.filter(item => item.timestamp !== Number(id));
        localStorage.setItem('wallpaper_history', JSON.stringify(history));
        renderHistory();
        renderRecentHistory();
        showToast('Local creation deleted', 'info');
    }
}

async function toggleFavorite(url) {
    const user = await getCurrentUser();

    if (user) {
        // DB Mode: We need the wallpaper ID to toggle save. 
        // We find it in the current history list (which we just rendered)
        // Or we better fetch it from the url directly
        const { data: wp } = await supabase.from('wallpapers').select('id').eq('image_url', url).maybeSingle();
        if (wp) {
            const { saved } = await toggleSave(wp.id);
            if (saved) {
                if (!state.favorites.includes(url)) state.favorites.push(url);
            } else {
                state.favorites = state.favorites.filter(f => f !== url);
            }
        }
    } else {
        // Guest Mode: Pure Local
        const index = state.favorites.indexOf(url);
        if (index > -1) state.favorites.splice(index, 1);
        else state.favorites.push(url);
        localStorage.setItem('wallpaper_favorites', JSON.stringify(state.favorites));
    }

    renderHistory();
    renderFavorites();
}

function renderFavorites() {
    const count = state.favorites.length;
    const badge = document.getElementById('favorites-badge');
    if (badge) {
        badge.textContent = count;
        badge.classList.toggle('hidden', count === 0);
    }
}

// 2B: Remix
window.remixImage = async function (id) {
    const user = await getCurrentUser();
    let item = null;

    if (user) {
        // Logged-in: Fetch from database
        const { data } = await supabase
            .from('wallpapers')
            .select('*')
            .eq('id', id)
            .single();
        item = data;
    } else {
        // Guest mode: Read from localStorage
        const history = JSON.parse(localStorage.getItem('wallpaper_history') || '[]');
        item = history.find(i => i.timestamp === Number(id) || i.url === id);
    }

    if (!item) {
        showToast('Wallpaper not found', 'error');
        return;
    }

    const genreIndex = GENRES.findIndex(g => g.name === item.genre);
    if (genreIndex !== -1) state.activeGenreIndex = genreIndex;
    const styleIndex = STYLES.findIndex(s => s.name === item.style);
    if (styleIndex !== -1) state.activeStyleIndex = styleIndex;
    if (item.seed) {
        state.seed = item.seed;
        document.getElementById('seed-input').value = item.seed;
    }
    updateCarouselUI();
    toggleHistory();
    showToast("Settings restored!", "success");
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ============================================================================
// MODALS & RESULTS (Featuring Category C: Color Palette)
// ============================================================================
function toggleLockScreen() {
    document.getElementById('lock-screen-overlay').classList.toggle('hidden');
}

function updateTime() {
    const now = new Date();
    const timeEl = document.getElementById('lock-time');
    const dateEl = document.getElementById('lock-date');
    if (timeEl) timeEl.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (dateEl) dateEl.innerText = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    setTimeout(updateTime, 1000);
}

function showResult(url, seed = null) {
    const modal = document.getElementById('result-modal');
    const img = document.getElementById('result-image');
    const seedDisplay = document.getElementById('result-seed');

    // Category C: Set crossOrigin for Color Extraction
    img.crossOrigin = "anonymous";
    img.src = url;

    if (seedDisplay && seed) {
        seedDisplay.textContent = `Seed: ${seed}`;
        seedDisplay.parentElement.classList.remove('hidden');
    }
    document.getElementById('lock-screen-overlay').classList.add('hidden');
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    // Category C: Extract Colors when image is loaded
    img.onload = () => extractColors(img);
}

// Category C: Color Extraction Logic
function extractColors(imgElement) {
    try {
        // Create canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 100; // Small size for performance
        canvas.height = 100;
        ctx.drawImage(imgElement, 0, 0, 100, 100);

        // Sampling points: Center and Corners
        const samplePoints = [
            { x: 50, y: 50 }, { x: 20, y: 20 }, { x: 80, y: 20 }, { x: 20, y: 80 }, { x: 80, y: 80 }
        ];

        // Ensure container exists in HTML (User needs to add this div if not present)
        // If not present, we can create it dynamically in the modal actions
        let paletteContainer = document.getElementById('color-palette-container');
        if (!paletteContainer) {
            // Create it inside the result modal if it doesn't exist
            const resultModalContent = document.querySelector('#result-modal .flex-col.gap-3');
            if (resultModalContent) {
                paletteContainer = document.createElement('div');
                paletteContainer.id = 'color-palette-container';
                paletteContainer.className = 'flex justify-center gap-2 mt-2';
                resultModalContent.insertBefore(paletteContainer, resultModalContent.firstChild);
            } else {
                return;
            }
        }

        paletteContainer.innerHTML = '';

        samplePoints.forEach(p => {
            const pixel = ctx.getImageData(p.x, p.y, 1, 1).data;
            const hex = "#" + ((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2]).toString(16).slice(1).toUpperCase();

            const dot = document.createElement('div');
            dot.className = "w-8 h-8 rounded-full cursor-pointer hover:scale-125 transition-transform border border-white/20 shadow-lg";
            dot.style.backgroundColor = hex;
            dot.title = `Copy ${hex}`;
            dot.onclick = () => {
                copyToClipboard(hex);
                showToast(`Copied ${hex}`, 'info', 1000);
            };
            paletteContainer.appendChild(dot);
        });

    } catch (e) {
        console.warn("Cannot extract colors (CORS limitations likely)", e);
    }
}

function closeResult() {
    const modal = document.getElementById('result-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// ============================================================================
// API & GENERATION (Featuring B6: Confetti)
// ============================================================================
async function handleGenerate() {
    const genre = GENRES[state.activeGenreIndex];
    const style = STYLES[state.activeStyleIndex];
    const promptInput = document.getElementById('custom-prompt');

    let finalPrompt = promptInput.value;

    if (!state.isPromptManuallyEdited || !finalPrompt) {
        // Use templates for better variety
        const template = PROMPT_TEMPLATES[Math.floor(Math.random() * PROMPT_TEMPLATES.length)];
        const modifier = RANDOM_MODIFIERS[Math.floor(Math.random() * RANDOM_MODIFIERS.length)];
        const colorText = state.selectedColorBias ? `in ${state.selectedColorBias} tones` : (state.customColor ? `with ${state.customColor} accents` : '');

        finalPrompt = template
            .replace('{style}', style.prompt)
            .replace('{genre}', genre.prompt)
            .replace('{color}', colorText);

        finalPrompt += `, ${modifier}. high resolution, 8k, detailed.`;
    }

    const w = parseInt(document.getElementById('width').value);
    const h = parseInt(document.getElementById('height').value);
    const seed = state.seed || Math.floor(Math.random() * 1000000);

    const overlay = document.getElementById('generation-overlay');
    const canvas = document.getElementById('webgl-generation-canvas');
    const statusDiv = document.getElementById('generation-status');
    const resultImage = document.getElementById('generation-result-image');
    const actions = document.getElementById('generation-actions');

    document.getElementById('main-card').classList.add('generating-active');
    overlay.classList.remove('hidden');
    canvas.classList.remove('hidden');
    statusDiv.classList.remove('hidden');
    resultImage.classList.add('hidden');
    actions.classList.add('hidden');

    canvas.style.opacity = '1';
    statusDiv.style.opacity = '1';
    document.getElementById('loading-text').innerText = `Creating ${state.isDesktopMode ? 'Desktop' : 'Mobile'} Wallpaper`;

    initGenerationAnimation();

    try {
        const apiUrl = (API_CONFIG.BASE_URL.endsWith('/') ? API_CONFIG.BASE_URL.slice(0, -1) : API_CONFIG.BASE_URL) + API_CONFIG.GENERATION_ENDPOINT;
        let data = null;

        for (let i = 0; i < API_CONFIG.MAX_RETRIES; i++) {
            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: finalPrompt, width: w, height: h, num_steps: state.numSteps, seed: seed })
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                data = await response.json();
                break;
            } catch (e) {
                if (i === API_CONFIG.MAX_RETRIES - 1) throw e;
                await new Promise(r => setTimeout(r, API_CONFIG.RETRY_DELAY));
            }
        }

        if (data && data.output) {
            stopGenerationAnimation();
            triggerConfetti(); // Category B: Success Confetti

            canvas.style.opacity = '0';
            statusDiv.style.opacity = '0';

            setTimeout(() => {
                canvas.classList.add('hidden');
                statusDiv.classList.add('hidden');
                resultImage.src = data.output;
                resultImage.classList.remove('hidden');
                resultImage.style.opacity = '0';

                setTimeout(() => {
                    resultImage.style.opacity = '1';
                    actions.classList.remove('hidden');
                    if (window.lucide) lucide.createIcons();
                }, 50);
            }, 500);

            window.currentGeneratedImage = data.output;
            window.currentGeneratedSeed = seed;
            saveToHistory(data.output, genre.name, style.name, finalPrompt, seed);
            showToast('Wallpaper created successfully!', 'success');
        } else {
            throw new Error('No output data received');
        }
    } catch (error) {
        console.error(error);
        stopGenerationAnimation();
        closeGenerationDisplay();
        showToast('Generation failed. Check settings.', 'error');
    }
}

async function handleBatchGenerate() {
    const count = parseInt(document.getElementById('batch-count').value) || 4;
    showToast(`Generating ${count} variations...`, 'info', 3000);
}

// ============================================================================
// WEBGL & ANIMATION
// ============================================================================
function initWebGL() {
    const canvas = document.getElementById('webgl-canvas');
    if (!canvas) return;
    if (!window.WebGLRenderingContext) { enableFallbackMode(); return; }

    try {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.position.z = 5;

        const particleCount = isMobileDevice() ? APP_CONFIG.WEBGL_PARTICLE_COUNT_MOBILE : APP_CONFIG.WEBGL_PARTICLE_COUNT;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        for (let i = 0; i < particleCount * 3; i++) positions[i] = (Math.random() - 0.5) * 20;
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        particleMaterial = new THREE.PointsMaterial({ color: 0x444444, size: 0.05, transparent: true, opacity: 0.6 });
        const particles = new THREE.Points(geometry, particleMaterial);
        scene.add(particles);

        function animate() {
            requestAnimationFrame(animate);
            if (particleMaterial) particleMaterial.color.lerp(targetColor, 0.05); // Color tween
            particles.rotation.y += 0.0005;
            particles.position.y += Math.sin(Date.now() * 0.001) * 0.002;
            renderer.render(scene, camera);
        }
        animate();
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });
    } catch (e) { enableFallbackMode(); }
}

function enableFallbackMode() {
    document.body.classList.add('fallback-active');
    const canvas = document.getElementById('webgl-canvas');
    if (canvas) canvas.style.display = 'none';
}

// ... (Generation Animation Code) ...
let generationScene = null, generationCamera = null, generationRenderer = null, generationAnimationId = null;

function initGenerationAnimation() {
    const canvas = document.getElementById('webgl-generation-canvas');
    const container = document.getElementById('main-card');
    if (!canvas || !container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;

    generationScene = new THREE.Scene();
    generationCamera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    generationRenderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    generationRenderer.setSize(width, height);
    generationCamera.position.z = 15;

    const pixelCount = 3000;
    const pixelGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(pixelCount * 3);
    for (let i = 0; i < pixelCount * 3; i++) positions[i] = (Math.random() - 0.5) * 20;
    pixelGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const pixelMaterial = new THREE.PointsMaterial({ size: 0.12, color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending });
    const pixelSystem = new THREE.Points(pixelGeometry, pixelMaterial);
    generationScene.add(pixelSystem);

    let startTime = Date.now();
    function animate() {
        generationAnimationId = requestAnimationFrame(animate);
        const elapsed = (Date.now() - startTime) * 0.001;
        pixelSystem.rotation.y = elapsed * 0.03;
        generationRenderer.render(generationScene, generationCamera);
    }
    animate();
}

function stopGenerationAnimation() {
    if (generationAnimationId) cancelAnimationFrame(generationAnimationId);
    if (generationRenderer) generationRenderer.dispose();
    generationScene = null;
}

function closeGenerationDisplay() {
    stopGenerationAnimation();
    document.getElementById('generation-overlay').classList.add('hidden');
    document.getElementById('main-card').classList.remove('generating-active');
    document.getElementById('generation-result-image').src = '';
}

function viewFullResult() {
    if (window.currentGeneratedImage) {
        showResult(window.currentGeneratedImage, window.currentGeneratedSeed);
        closeGenerationDisplay();
    }
}

async function downloadGenerated() {
    if (window.currentGeneratedImage) await downloadImageDirect(window.currentGeneratedImage);
}

function toggleShareMenu() { document.getElementById('share-menu').classList.toggle('active'); }
async function shareImage(platform) {
    const url = document.getElementById('result-image').src;
    if (!url) return showToast('No image', 'error');
    if (platform === 'copy') {
        copyToClipboard(url);
    } else if (platform === 'download') {
        downloadImageDirect(url);
    } else if (platform === 'twitter') {
        window.open(`https://twitter.com/intent/tweet?text=Check%20out%20this%20AI%20Wallpaper!&url=${encodeURIComponent(url)}`, '_blank');
    }
}

async function downloadImageDirect(url) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `wallpaper-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
        showToast('Download started', 'success');
    } catch (e) {
        console.warn('Direct download failed, falling back to new tab:', e);
        window.open(url, '_blank');
        showToast('Download blocked by security. Opened in new tab.', 'info');
    }
}

// Export
window.nextSlide = nextSlide;
window.prevSlide = prevSlide;
window.randomize = randomize;
window.togglePromptEditor = togglePromptEditor;
window.copyPrompt = copyPrompt;
window.toggleAspectRatio = toggleAspectRatio;
window.setColorBias = setColorBias;
window.setCustomColor = setCustomColor;
window.toggleAdvancedControls = toggleAdvancedControls;
window.updateSeed = updateSeed;
window.updateSteps = updateSteps;
window.randomSeed = randomSeed;
window.toggleHistory = toggleHistory;
window.deleteHistoryItem = deleteHistoryItem;
window.clearHistory = clearHistory;
window.toggleFavorite = toggleFavorite;
window.toggleLockScreen = toggleLockScreen;
window.handleGenerate = handleGenerate;
window.handleBatchGenerate = handleBatchGenerate;
window.showResult = showResult;
window.closeResult = closeResult;
window.toggleShareMenu = toggleShareMenu;
window.shareImage = shareImage;
window.closeGenerationDisplay = closeGenerationDisplay;
window.viewFullResult = viewFullResult;
window.downloadGenerated = downloadGenerated;
window.remixImage = remixImage;

window.shareHistoryItemToCommunity = async function (id) {
    const user = await getCurrentUser();
    let item = null;

    if (user) {
        // Logged-in: Fetch from database
        const { data, error } = await supabase
            .from('wallpapers')
            .select('*')
            .eq('id', id)
            .eq('user_id', user.id)  // Security: only user's own wallpapers
            .single();

        if (error || !data) {
            showToast('Wallpaper not found', 'error');
            return;
        }
        item = data;

        // Set current image for upload modal
        window.currentGeneratedImage = item.image_url;
        window.currentGeneratedSeed = item.seed;

        // Set active genre/style to match item
        const genreIndex = GENRES.findIndex(g => g.name === item.genre);
        if (genreIndex !== -1) state.activeGenreIndex = genreIndex;
        const styleIndex = STYLES.findIndex(s => s.name === item.style);
        if (styleIndex !== -1) state.activeStyleIndex = styleIndex;

        // Store the wallpaper ID for updating is_public later
        window.currentWallpaperId = item.id;

    } else {
        // Guest mode: Read from localStorage
        const history = JSON.parse(localStorage.getItem('wallpaper_history') || '[]');
        item = history.find(i => i.timestamp === Number(id));

        if (!item) {
            showToast('Wallpaper not found', 'error');
            return;
        }

        window.currentGeneratedImage = item.url;
        window.currentGeneratedSeed = item.seed;

        const genreIndex = GENRES.findIndex(g => g.name === item.genre);
        if (genreIndex !== -1) state.activeGenreIndex = genreIndex;
        const styleIndex = STYLES.findIndex(s => s.name === item.style);
        if (styleIndex !== -1) state.activeStyleIndex = styleIndex;
    }

    openCommunityUpload();
};

window.openCommunityUpload = async function () {
    if (!window.currentGeneratedImage) {
        showToast('Please generate a masterpiece first!', 'warning');
        return;
    }

    const user = await getCurrentUser();
    if (!user) {
        if (window.openAuthModal) window.openAuthModal();
        return;
    }

    const modal = document.getElementById('community-upload-modal');
    const preview = document.getElementById('upload-preview');
    preview.src = window.currentGeneratedImage;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

window.closeCommunityUpload = function () {
    const modal = document.getElementById('community-upload-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

window.submitToCommunity = async function () {
    const title = document.getElementById('upload-title').value;
    const desc = document.getElementById('upload-desc').value;

    if (!title) {
        showToast('Please give your masterpiece a title', 'warning');
        return;
    }

    showToast('Publishing to community...', 'info');

    try {
        const user = await getCurrentUser();

        // If wallpaper already exists in DB (from shareHistoryItemToCommunity)
        if (window.currentWallpaperId && user) {
            // Just update to make it public
            const { error } = await supabase
                .from('wallpapers')
                .update({
                    title: title,
                    description: desc,
                    is_public: true
                })
                .eq('id', window.currentWallpaperId)
                .eq('user_id', user.id);  // Security check

            if (error) throw error;

            showToast('✨ Published to community successfully!', 'success');
            closeCommunityUpload();
            window.currentWallpaperId = null;  // Clear
            return;
        }

        // Otherwise, create new record (for guest uploads or direct shares)
        const genre = GENRES[state.activeGenreIndex].name;
        const style = STYLES[state.activeStyleIndex].name;

        const metadata = {
            title: title,
            description: desc,
            genre: genre,
            style: style,
            prompt: document.getElementById('custom-prompt').value || 'AI Generated',
            seed: window.currentGeneratedSeed,
            width: state.isDesktopMode ? APP_CONFIG.DESKTOP_WIDTH : APP_CONFIG.DEFAULT_WIDTH,
            height: state.isDesktopMode ? APP_CONFIG.DESKTOP_HEIGHT : APP_CONFIG.DEFAULT_HEIGHT,
            imageUrl: window.currentGeneratedImage,
            isPublic: true  // Public when sharing to community
        };

        let result;
        try {
            // Attempt to fetch and re-upload to Supabase
            const response = await fetch(window.currentGeneratedImage);
            if (!response.ok) throw new Error('Fetch failed');
            const blob = await response.blob();
            result = await uploadWallpaper(blob, metadata);
        } catch (fetchError) {
            // FALLBACK: If CORS blocks fetch, save by direct URL
            console.warn('CORS/Fetch error, falling back to Direct URL sharing:', fetchError);
            result = await saveWallpaperRecord(metadata);
        }

        if (result.error) throw result.error;

        showToast('✨ Published to community successfully!', 'success');
        closeCommunityUpload();
    } catch (e) {
        console.error('Publish error:', e);
        showToast('Failed to publish: ' + (e.message || 'Unknown error'), 'error');
    }
}

window.downloadFromModal = async function () {
    const url = document.getElementById('result-image').src;
    if (url) await downloadImageDirect(url);

};
