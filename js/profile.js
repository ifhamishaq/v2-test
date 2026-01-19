import { getCurrentUser, supabase } from './supabase.js';

let currentUser = null;
let currentTab = 'creations';

async function loadProfile() {
    currentUser = await getCurrentUser();
    if (!currentUser) {
        window.location.href = 'index.html';
        return;
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

    if (profile) {
        document.getElementById('profile-name').textContent = profile.display_name || profile.username || 'Creator Name';
        document.getElementById('profile-username').textContent = '@' + (profile.username || 'username');

        if (profile.avatar_url) {
            document.getElementById('profile-avatar').src = profile.avatar_url;
        }
    }

    const { data: wallpapers } = await supabase
        .from('wallpapers')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (wallpapers) {
        document.getElementById('wallpaper-count').textContent = wallpapers.length;
        const totalViews = wallpapers.reduce((sum, w) => sum + (w.views_count || 0), 0);
        const totalLikes = wallpapers.reduce((sum, w) => sum + (w.likes_count || 0), 0);
        document.getElementById('views-count').textContent = totalViews;
        document.getElementById('likes-count').textContent = totalLikes;

        if (wallpapers.length > 0) {
            const bg = document.getElementById('profile-dynamic-bg');
            if (bg) bg.style.backgroundImage = `url(${wallpapers[0].image_url})`;
        }

        renderWallpapers(wallpapers);
    }
}

function renderWallpapers(wallpapers) {
    const grid = document.getElementById('my-wallpapers-grid');
    const noWallpapers = document.getElementById('no-wallpapers');

    if (!wallpapers || wallpapers.length === 0) {
        if (grid) grid.classList.add('hidden');
        if (noWallpapers) noWallpapers.classList.remove('hidden');
        return;
    }

    if (grid) grid.classList.remove('hidden');
    if (noWallpapers) noWallpapers.classList.add('hidden');
    if (grid) {
        grid.innerHTML = '';

        wallpapers.forEach((wp, index) => {
            const card = document.createElement('div');
            card.className = 'glass-card rounded-[2rem] overflow-hidden aspect-[9/16] relative group cursor-pointer animate-[fadeIn_0.5s_ease_out_forwards]';
            card.style.animationDelay = `${index * 0.1}s`;
            card.onclick = () => window.open(wp.image_url, '_blank');

            card.innerHTML = `
            <img alt="${wp.title}" 
                 class="w-full h-full object-cover opacity-90 transition-transform duration-700 group-hover:scale-110" 
                 src="${wp.thumbnail_url || wp.image_url}"/>
            
            <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-5">
                <p class="text-[10px] font-black uppercase tracking-widest mb-1">${wp.genre || 'Original'}</p>
                <div class="flex items-center justify-between">
                     <div class="flex items-center gap-1">
                         <span class="material-symbols-outlined text-[14px]">favorite</span>
                         <span class="text-xs font-bold font-display">${wp.likes_count || 0}</span>
                     </div>
                     <span class="material-symbols-outlined text-[16px]">visibility</span>
                </div>
            </div>
        `;

            grid.appendChild(card);
        });
    }
}

async function loadSavedWallpapers() {
    currentUser = await getCurrentUser();
    if (!currentUser) return;

    const { data: savedData, error } = await supabase
        .from('saves')
        .select(`
            wallpaper_id,
            wallpapers (
                *
            )
        `)
        .eq('user_id', currentUser.id);

    if (error) {
        console.error('Error loading saved wallpapers:', error);
        return;
    }

    const wallpapers = savedData.map(item => item.wallpapers).filter(wp => wp !== null);
    renderWallpapers(wallpapers);
}

window.switchTab = function (tab) {
    currentTab = tab;
    const creationsTab = document.getElementById('tab-creations');
    const savedTab = document.getElementById('tab-saved');

    if (tab === 'creations') {
        if (creationsTab) creationsTab.className = "px-8 py-3 rounded-full text-xs font-bold transition-all bg-white text-black shadow-lg shadow-white/10";
        if (savedTab) savedTab.className = "px-8 py-3 rounded-full text-xs font-bold text-white/40 hover:text-white transition-all";
        loadProfile();
    } else {
        if (savedTab) savedTab.className = "px-8 py-3 rounded-full text-xs font-bold transition-all bg-white text-black shadow-lg shadow-white/10";
        if (creationsTab) creationsTab.className = "px-8 py-3 rounded-full text-xs font-bold text-white/40 hover:text-white transition-all";
        loadSavedWallpapers();
    }
};

loadProfile();
