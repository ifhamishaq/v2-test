import { getCurrentUser, supabase, uploadAvatar, deleteWallpaper, updateProfile, signOut, incrementViewCount } from './supabase.js';
import { showToast } from './toast.js';

let currentUser = null;
let currentTab = 'creations';
let allWallpapers = [];

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
        renderProfileInfo(profile);
    }

    // Setup Avatar Upload
    setupAvatarUpload();

    // Initial Load based on tab
    switchTab(currentTab);

    // Fetch stats
    refreshStats();
}

function renderProfileInfo(profile) {
    document.getElementById('profile-name').textContent = profile.display_name || profile.username || 'Creator Name';
    document.getElementById('profile-username').textContent = '@' + (profile.username || 'username');
    if (profile.avatar_url) {
        document.getElementById('profile-avatar').src = profile.avatar_url;
    }

    // Pre-fill settings
    document.getElementById('settings-display-name').value = profile.display_name || '';
    document.getElementById('settings-username').value = profile.username || '';
}

async function refreshStats() {
    // 1. My Creations
    const { data: wallpapers } = await supabase
        .from('wallpapers')
        .select('views_count, likes_count')
        .eq('user_id', currentUser.id);

    if (wallpapers) {
        document.getElementById('wallpaper-count').textContent = wallpapers.length;
        const totalLikes = wallpapers.reduce((sum, w) => sum + (w.likes_count || 0), 0);
        document.getElementById('likes-count').textContent = totalLikes;
    }

    // 2. Followers/Following Counts
    const { count: followersCount } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', currentUser.id);

    const { count: followingCount } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', currentUser.id);

    document.getElementById('followers-count').textContent = followersCount || 0;
    document.getElementById('following-count').textContent = followingCount || 0;
}

function setupAvatarUpload() {
    const avatarInput = document.getElementById('avatar-upload');
    if (avatarInput) {
        avatarInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const avatarContainer = avatarInput.closest('.group').querySelector('div');
            avatarContainer.classList.add('opacity-50');

            const { data, error } = await uploadAvatar(file);
            avatarContainer.classList.remove('opacity-50');

            if (error) {
                showToast('Upload failed: ' + error.message, 'error');
            } else if (data && data.avatar_url) {
                showToast('Avatar updated!', 'success');
                document.getElementById('profile-avatar').src = data.avatar_url;
            }
        };
    }
}

async function loadMyLab() {
    const { data: wallpapers, error } = await supabase
        .from('wallpapers')
        .select(`
            *,
            profiles(username, display_name, avatar_url)
        `)
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (error) {
        showToast('Error loading lab', 'error');
        return;
    }
    allWallpapers = wallpapers;
    renderWallpapers(wallpapers, 'You haven\'t created any masterpieces yet.');
}

async function loadSavedWallpapers() {
    const { data: savedData, error } = await supabase
        .from('saves')
        .select(`
            wallpaper_id,
            wallpapers(
                *,
                profiles(username, display_name, avatar_url)
            )
        `)
        .eq('user_id', currentUser.id);

    if (error) {
        console.error('Error loading saved:', error);
        return;
    }

    const wallpapers = savedData.map(item => item.wallpapers).filter(wp => wp !== null);
    allWallpapers = wallpapers;
    renderWallpapers(wallpapers, 'Your collection is empty.');
}

async function loadFollowers() {
    const { data: followers, error } = await supabase
        .from('follows')
        .select('follower_id, profiles!follows_follower_id_fkey(*)')
        .eq('following_id', currentUser.id);

    if (error) {
        console.error('Error loading followers:', error);
        return;
    }
    renderUserList(followers.map(f => f.profiles), 'No followers yet.');
}

async function loadFollowing() {
    const { data: following, error } = await supabase
        .from('follows')
        .select('following_id, profiles!follows_following_id_fkey(*)')
        .eq('follower_id', currentUser.id);

    if (error) {
        console.error('Error loading following:', error);
        return;
    }
    renderUserList(following.map(f => f.profiles), 'You aren\'t following anyone yet.');
}

function renderWallpapers(wallpapers, emptyMsg) {
    const grid = document.getElementById('my-wallpapers-grid');
    const userGrid = document.getElementById('user-list-grid');
    const noWallpapers = document.getElementById('no-wallpapers');
    const emptyMsgEl = document.getElementById('empty-message');

    grid.classList.remove('hidden');
    userGrid.classList.add('hidden');

    if (!wallpapers || wallpapers.length === 0) {
        grid.classList.add('hidden');
        noWallpapers.classList.remove('hidden');
        if (emptyMsgEl) emptyMsgEl.textContent = emptyMsg;
        return;
    }

    noWallpapers.classList.add('hidden');
    grid.innerHTML = '';

    wallpapers.forEach((wp, index) => {
        const card = document.createElement('div');
        card.className = 'glass-card rounded-[2rem] overflow-hidden aspect-[9/16] relative group cursor-pointer animate-[fadeIn_0.5s_ease_out_forwards] shadow-2xl';
        card.style.animationDelay = `${index * 0.1}s`;
        card.onclick = () => openDetailModal(wp);

        card.innerHTML = `
            <img alt="${wp.title}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" src="${wp.thumbnail_url || wp.image_url}"/>
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-6">
                <p class="text-[9px] font-black uppercase tracking-widest text-accent mb-1">${wp.genre || 'Original'}</p>
                <h3 class="font-bold text-sm truncate mb-3">${wp.title}</h3>
                <div class="flex items-center justify-between">
                     <div class="flex items-center gap-2">
                         <span class="material-symbols-outlined text-xs">favorite</span>
                         <span class="text-[10px] font-black">${wp.likes_count || 0}</span>
                     </div>
                     <span class="material-symbols-outlined text-sm opacity-60">open_in_full</span>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderUserList(users, emptyMsg) {
    const grid = document.getElementById('my-wallpapers-grid');
    const userGrid = document.getElementById('user-list-grid');
    const noWallpapers = document.getElementById('no-wallpapers');
    const emptyMsgEl = document.getElementById('empty-message');

    grid.classList.add('hidden');
    userGrid.classList.remove('hidden');

    if (!users || users.length === 0) {
        userGrid.classList.add('hidden');
        noWallpapers.classList.remove('hidden');
        if (emptyMsgEl) emptyMsgEl.textContent = emptyMsg;
        return;
    }

    noWallpapers.classList.add('hidden');
    userGrid.innerHTML = '';

    users.forEach(user => {
        const item = document.createElement('div');
        item.className = 'glass-pill p-4 flex items-center justify-between hover:bg-white/5 transition-all cursor-pointer group';
        item.innerHTML = `
            <div class="flex items-center gap-4">
                <img src="${user.avatar_url || 'https://via.placeholder.com/150/333/fff?text=👤'}" class="w-12 h-12 rounded-xl object-cover border border-white/10">
                <div class="flex flex-col">
                    <span class="font-bold text-sm">${user.display_name || user.username}</span>
                    <span class="text-[10px] text-white/40 uppercase tracking-widest">@${user.username}</span>
                </div>
            </div>
            <span class="material-symbols-outlined text-white/20 group-hover:text-accent transition-colors">arrow_forward</span>
        `;
        item.onclick = () => window.location.href = `community.html?user=${user.username}`;
        userGrid.appendChild(item);
    });
}

// Wallpaper Detail Modal
window.openDetailModal = function (wp) {
    const modal = document.getElementById('wallpaper-detail-modal');
    document.getElementById('detail-image').src = wp.image_url;
    document.getElementById('detail-avatar').src = wp.profiles?.avatar_url || 'https://via.placeholder.com/150/333/fff?text=👤';
    document.getElementById('detail-display-name').textContent = wp.profiles?.display_name || 'Creator';
    document.getElementById('detail-username').textContent = '@' + (wp.profiles?.username || 'user');
    document.getElementById('detail-title').textContent = wp.title;
    document.getElementById('detail-desc').textContent = wp.description || 'A stunning AI masterpiece.';
    document.getElementById('detail-likes-count').textContent = wp.likes_count || 0;
    document.getElementById('detail-views-count').textContent = wp.views_count || 0;
    document.getElementById('detail-downloads-count').textContent = wp.seed || '999';

    // Delete button logic (only for my lab)
    const deleteBtn = document.getElementById('detail-delete-btn');
    if (currentTab === 'creations') {
        deleteBtn.classList.remove('hidden');
        deleteBtn.onclick = () => window.deleteItem(wp.id);
    } else {
        deleteBtn.classList.add('hidden');
    }

    document.getElementById('detail-download-main').onclick = () => window.open(wp.image_url, '_blank');

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    incrementViewCount(wp.id);
};

window.closeDetailModal = function () {
    const modal = document.getElementById('wallpaper-detail-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
};

// Tabs Management
window.switchTab = function (tab) {
    currentTab = tab;
    const tabs = ['creations', 'saved', 'followers', 'following'];

    tabs.forEach(t => {
        const el = document.getElementById(`tab-${t}`);
        if (t === tab) {
            el.className = "px-8 py-3 rounded-full text-xs font-bold transition-all bg-white text-black shadow-lg shadow-white/10";
        } else {
            el.className = "px-8 py-3 rounded-full text-xs font-bold text-white/40 hover:text-white transition-all";
        }
    });

    if (tab === 'creations') loadMyLab();
    else if (tab === 'saved') loadSavedWallpapers();
    else if (tab === 'followers') loadFollowers();
    else if (tab === 'following') loadFollowing();
};

// Settings
window.openSettings = function () {
    document.getElementById('settings-modal').classList.remove('hidden');
    document.getElementById('settings-modal').classList.add('flex');
};

window.closeSettings = function () {
    document.getElementById('settings-modal').classList.add('hidden');
    document.getElementById('settings-modal').classList.remove('flex');
};

window.saveSettings = async function () {
    const displayName = document.getElementById('settings-display-name').value;
    const username = document.getElementById('settings-username').value;

    const { error } = await updateProfile({
        display_name: displayName,
        username: username
    });

    if (error) {
        showToast('Update failed: ' + error.message, 'error');
    } else {
        showToast('Settings saved!', 'success');
        closeSettings();
        loadProfile(); // Refresh UI
    }
};

window.handleSignOut = async () => {
    await signOut();
    window.location.href = 'landing.html';
};

// Initialize
loadProfile();
