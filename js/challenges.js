import { getCurrentUser, supabase, saveWallpaperRecord, getUserCredits } from './supabase.js';
import { showToast } from './toast.js';

// Daily challenge themes (rotates daily)
const CHALLENGE_THEMES = [
    {
        title: "Neon Nights",
        description: "Create a vibrant cyberpunk cityscape bathed in neon lights. Think Tokyo meets Blade Runner.",
        genre: "Cyberpunk",
        style: "Neon",
        reward: 50
    },
    {
        title: "Minimalist Zen",
        description: "Craft a serene, minimal composition. Less is more—focus on negative space and calm tones.",
        genre: "Minimal",
        style: "Clean",
        reward: 50
    },
    {
        title: "Cosmic Dreams",
        description: "Design an otherworldly space scene with nebulas, stars, and distant galaxies.",
        genre: "Space",
        style: "Ethereal",
        reward: 50
    },
    {
        title: "Retro Wave",
        description: "Channel the 80s with synthwave aesthetics, grid horizons, and sunset gradients.",
        genre: "Retro",
        style: "Vaporwave",
        reward: 50
    },
    {
        title: "Nature's Fury",
        description: "Capture the raw power of nature—storms, volcanoes, or crashing waves.",
        genre: "Nature",
        style: "Dramatic",
        reward: 50
    },
    {
        title: "Abstract Chaos",
        description: "Go wild with abstract shapes, bold colors, and experimental compositions.",
        genre: "Abstract",
        style: "Bold",
        reward: 50
    },
    {
        title: "Urban Decay",
        description: "Explore the beauty in abandoned places—graffiti, rust, and forgotten architecture.",
        genre: "Urban",
        style: "Gritty",
        reward: 50
    }
];

let currentChallenge = null;
let userSubmission = null;

// Get today's challenge (based on day of year)
function getTodaysChallenge() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now - start;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);

    const index = dayOfYear % CHALLENGE_THEMES.length;
    return {
        ...CHALLENGE_THEMES[index],
        date: now.toISOString().split('T')[0]
    };
}

// Calculate time until midnight
function getTimeUntilMidnight() {
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);

    const diff = midnight - now;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Update countdown timer
function updateTimer() {
    const timerEl = document.getElementById('challenge-timer');
    if (timerEl) {
        timerEl.textContent = `Resets in ${getTimeUntilMidnight()}`;
    }
}

// Load today's challenge
async function loadChallenge() {
    currentChallenge = getTodaysChallenge();

    // Update UI
    document.getElementById('challenge-title').textContent = currentChallenge.title;
    document.getElementById('challenge-description').textContent = currentChallenge.description;
    document.getElementById('challenge-genre').textContent = currentChallenge.genre;
    document.getElementById('challenge-style').textContent = currentChallenge.style;

    // Check if user has completed today's challenge
    const user = await getCurrentUser();
    if (user) {
        await checkUserSubmission(user.id);
        await syncCredits(user.id);
    }

    // Start timer
    updateTimer();
    setInterval(updateTimer, 1000);
}

// Check if user has submitted for today
async function checkUserSubmission(userId) {
    try {
        const { data, error } = await supabase
            .from('challenge_submissions')
            .select('*')
            .eq('user_id', userId)
            .eq('challenge_date', currentChallenge.date)
            .maybeSingle();

        if (data) {
            userSubmission = data;
            showCompletedStatus();
        } else {
            showPendingStatus();
        }
    } catch (error) {
        console.error('Error checking submission:', error);
        showPendingStatus();
    }
}

// Show completed status
function showCompletedStatus() {
    const statusEl = document.getElementById('challenge-status');
    statusEl.innerHTML = `
        <div class="glass-pill p-4 border border-accent/20 bg-accent/5 flex items-center gap-3">
            <span class="material-symbols-outlined text-accent text-2xl fill-1">check_circle</span>
            <div>
                <p class="font-bold text-sm text-accent">Challenge Completed!</p>
                <p class="text-xs text-white/60">You earned +50 credits today</p>
            </div>
        </div>
    `;

    document.getElementById('start-challenge-btn').innerHTML = `
        <span class="material-symbols-outlined">visibility</span>
        View My Submission
    `;
    document.getElementById('start-challenge-btn').onclick = viewMySubmission;
}

// Show pending status
function showPendingStatus() {
    const statusEl = document.getElementById('challenge-status');
    statusEl.innerHTML = `
        <div class="glass-pill p-4 border border-white/10 flex items-center gap-3">
            <span class="material-symbols-outlined text-white/40 text-2xl">pending</span>
            <div>
                <p class="font-bold text-sm">Not Completed</p>
                <p class="text-xs text-white/60">Complete this challenge to earn +50 credits</p>
            </div>
        </div>
    `;
}

// Start challenge (redirect to creation page with pre-filled params)
window.startChallenge = function () {
    const params = new URLSearchParams({
        challenge: 'true',
        genre: currentChallenge.genre,
        style: currentChallenge.style,
        prompt: currentChallenge.description
    });
    window.location.href = `index.html?${params.toString()}`;
};

// View my submission
function viewMySubmission() {
    if (userSubmission && userSubmission.wallpaper_id) {
        window.location.href = `community.html?wallpaper=${userSubmission.wallpaper_id}`;
    }
}

// Submit challenge completion (called from index.html after generation)
export async function submitChallengeCompletion(wallpaperId) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };

    const challenge = getTodaysChallenge();

    try {
        // 1. Record submission
        const { data: submission, error: subError } = await supabase
            .from('challenge_submissions')
            .insert({
                user_id: user.id,
                wallpaper_id: wallpaperId,
                challenge_date: challenge.date,
                challenge_title: challenge.title
            })
            .select()
            .single();

        if (subError) throw subError;

        // 2. Award credits
        const { data: profile } = await supabase
            .from('profiles')
            .select('credits')
            .eq('id', user.id)
            .single();

        const newCredits = (profile?.credits || 0) + challenge.reward;

        await supabase
            .from('profiles')
            .update({ credits: newCredits })
            .eq('id', user.id);

        showToast(`🎉 Challenge completed! +${challenge.reward} credits earned!`, 'success', 5000);

        return { data: submission, error: null };
    } catch (error) {
        console.error('Challenge submission error:', error);
        return { data: null, error };
    }
}

// Load community submissions
async function loadSubmissions() {
    const challenge = getTodaysChallenge();

    try {
        const { data, error } = await supabase
            .from('challenge_submissions')
            .select(`
                *,
                wallpapers(*),
                profiles(username, avatar_url)
            `)
            .eq('challenge_date', challenge.date)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        const grid = document.getElementById('submissions-grid');
        grid.innerHTML = '';

        if (!data || data.length === 0) {
            grid.innerHTML = '<p class="text-white/40 text-sm col-span-full text-center py-10">No submissions yet. Be the first!</p>';
            return;
        }

        data.forEach((sub, idx) => {
            if (!sub.wallpapers) return;

            const card = document.createElement('div');
            card.className = 'masonry-item group cursor-pointer animate-[fadeIn_0.5s_ease_out_forwards]';
            card.style.animationDelay = `${idx * 0.05}s`;
            card.innerHTML = `
                <div class="glass-card rounded-2xl overflow-hidden relative">
                    <img src="${sub.wallpapers.thumbnail_url || sub.wallpapers.image_url}" 
                         class="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-500">
                    <div class="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                        <div class="flex items-center gap-2">
                            <img src="${sub.profiles?.avatar_url || 'https://via.placeholder.com/30'}" 
                                 class="w-6 h-6 rounded-full border border-white/20">
                            <span class="text-xs font-bold">@${sub.profiles?.username || 'artist'}</span>
                        </div>
                    </div>
                </div>
            `;
            card.onclick = () => window.location.href = `community.html?wallpaper=${sub.wallpaper_id}`;
            grid.appendChild(card);
        });

        document.getElementById('submissions-section').classList.remove('hidden');
    } catch (error) {
        console.error('Error loading submissions:', error);
    }
}

// Sync credits display
async function syncCredits(userId) {
    const { credits } = await getUserCredits(userId);
    const display = document.getElementById('credit-display');
    const count = document.getElementById('credit-count');
    if (display && count) {
        display.classList.remove('hidden');
        count.innerText = credits;
    }
}

// Event listeners
document.getElementById('start-challenge-btn')?.addEventListener('click', startChallenge);
document.getElementById('view-submissions-btn')?.addEventListener('click', loadSubmissions);

// Initialize
loadChallenge();
