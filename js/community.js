import { fetchWallpapers, toggleLike, toggleSave, getCurrentUser } from './supabase.js';

let currentPage = 0;
let currentFilter = 'latest';
let searchQuery = '';
let currentGenre = null;
let isLoading = false;
let hasMore = true;

async function loadWallpapers(reset = false) {
    if (isLoading || (!hasMore && !reset)) return;

    isLoading = true;
    if (reset) {
        currentPage = 0;
        hasMore = true;
        const grid = document.getElementById('gallery-grid');
        grid.style.opacity = '0';
    }

    document.getElementById('loading-indicator').classList.toggle('hidden', false);

    const orderBy = currentFilter === 'latest' ? 'created_at' : 'likes_count';
    const { data, error } = await fetchWallpapers({
        page: currentPage,
        limit: 20,
        orderBy: orderBy,
        ascending: false,
        searchQuery: searchQuery,
        genre: currentGenre
    });

    document.getElementById('loading-indicator').classList.toggle('hidden', true);

    if (error) {
        console.error('Error loading wallpapers:', error);
        isLoading = false;
        return;
    }

    if (reset) {
        document.getElementById('gallery-grid').innerHTML = '';
    }

    if (!data || data.length === 0) {
        if (currentPage === 0) {
            document.getElementById('empty-state').classList.remove('hidden');
        }
        hasMore = false;
        isLoading = false;
        return;
    }

    document.getElementById('empty-state').classList.add('hidden');
    renderWallpapers(data);

    // Fade in grid
    const grid = document.getElementById('gallery-grid');
    grid.style.opacity = '1';

    currentPage++;
    isLoading = false;
}

function renderWallpapers(wallpapers) {
    const grid = document.getElementById('gallery-grid');

    wallpapers.forEach((wp, index) => {
        const item = document.createElement('div');
        item.className = 'masonry-item relative group cursor-pointer animate-[fadeIn_0.5s_ease_out_forwards]';
        item.style.animationDelay = `${(index % 20) * 0.05}s`;

        item.innerHTML = `
        <div class="glass-card rounded-2xl overflow-hidden group/card relative" onclick='showDetailModal(${JSON.stringify(wp).replace(/'/g, "&apos;")})'>
            <img alt="${wp.title}" loading="lazy" 
                 class="w-full h-auto object-cover opacity-90 transition-transform duration-700 group-hover/card:scale-105" 
                 src="${wp.thumbnail_url || wp.image_url}"/>
            
            <!-- Hover Info Overlay -->
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <div class="w-6 h-6 rounded-full border border-white/20 bg-white/10 overflow-hidden">
                             <img src="${wp.profiles?.avatar_url || 'https://via.placeholder.com/50'}" class="w-full h-full object-cover">
                        </div>
                        <span class="text-[10px] font-bold tracking-tight text-white/80">${wp.profiles?.username || 'Artist'}</span>
                    </div>
                    <div class="flex items-center gap-1.5 glass-pill px-2 py-1 rounded-full">
                        <span class="material-symbols-outlined text-[12px] fill-1 text-accent">favorite</span>
                        <span class="text-[10px] font-bold">${wp.likes_count || 0}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
        grid.appendChild(item);
    });
}

window.showDetailModal = function (wallpaper) {
    const modal = document.getElementById('detail-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    // Set data
    document.getElementById('detail-bg-image').src = wallpaper.image_url;
    document.getElementById('detail-artist-name').textContent = wallpaper.profiles?.username || 'Anonymous';
    document.getElementById('detail-artist-avatar').src = wallpaper.profiles?.avatar_url || 'https://via.placeholder.com/100';
    document.getElementById('detail-prompt-text').textContent = `"${wallpaper.prompt || 'No prompt shared'}"`;

    document.getElementById('wp-genre-tag').textContent = wallpaper.genre || 'Original';
    document.getElementById('wp-style-tag').textContent = wallpaper.style || 'Custom';

    document.getElementById('detail-likes-count').textContent = formatCount(wallpaper.likes_count || 0);
    document.getElementById('detail-downloads-count').textContent = formatCount(wallpaper.downloads_count || 0);

    // Setup buttons
    document.getElementById('detail-download-main').onclick = () => downloadImage(wallpaper.image_url, wallpaper.title);

    document.getElementById('detail-remix-btn').onclick = () => {
        const params = new URLSearchParams({
            remix: 'true',
            genre: wallpaper.genre || '',
            style: wallpaper.style || '',
            prompt: wallpaper.prompt || '',
            seed: wallpaper.seed || ''
        });
        window.location.href = `index.html?${params.toString()}`;
    };

    const saveBtn = document.getElementById('detail-save-btn');
    const saveIcon = saveBtn.querySelector('span');
    saveBtn.onclick = async () => {
        const user = await getCurrentUser();
        if (!user) {
            if (window.openAuthModal) openAuthModal();
            return;
        }

        const { saved, error } = await toggleSave(wallpaper.id);
        if (!error) {
            if (saved) {
                saveIcon.classList.add('fill-1');
                saveBtn.innerHTML = '<span class="material-symbols-outlined text-sm fill-1">bookmark</span> Saved to Lab';
            } else {
                saveIcon.classList.remove('fill-1');
                saveBtn.innerHTML = '<span class="material-symbols-outlined text-sm">bookmark</span> Save to Collection';
            }
        }
    };

    const likeIcon = document.querySelector('#detail-like-action span');
    // Reset icon
    likeIcon.classList.remove('fill-1', 'text-accent');

    document.getElementById('detail-like-action').onclick = async () => {
        const user = await getCurrentUser();
        if (!user) {
            if (window.openAuthModal) openAuthModal();
            return;
        }

        const { liked, error } = await toggleLike(wallpaper.id);
        if (!error) {
            if (liked) {
                likeIcon.classList.add('fill-1', 'text-accent');
                wallpaper.likes_count++;
            } else {
                likeIcon.classList.remove('fill-1', 'text-accent');
                wallpaper.likes_count--;
            }
            document.getElementById('detail-likes-count').textContent = formatCount(wallpaper.likes_count);
        }
    };

    document.getElementById('detail-share-btn').onclick = () => {
        if (navigator.share) {
            navigator.share({
                title: `AI Wallpaper: ${wallpaper.title}`,
                url: wallpaper.image_url
            });
        } else {
            navigator.clipboard.writeText(wallpaper.image_url);
            alert('Link copied to clipboard!');
        }
    };
};

async function downloadImage(url, name) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `wallpaper-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
    } catch (e) {
        window.open(url, '_blank');
    }
}

function formatCount(num) {
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
}

window.closeDetailModal = function () {
    const modal = document.getElementById('detail-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
};
window.filterGallery = function (filter) {
    currentFilter = filter;

    // UI Toggle
    const filters = ['latest', 'popular', 'curated'];
    filters.forEach(f => {
        const btn = document.getElementById(`filter-${f}`);
        if (!btn) return;
        if (f === filter) {
            btn.classList.add('active-filter');
            btn.classList.remove('text-white/40', 'hover:text-white');
        } else {
            btn.classList.remove('active-filter');
            btn.classList.add('text-white/40', 'hover:text-white');
        }
    });

    loadWallpapers(true);
};

window.searchCommunity = function (query) {
    searchQuery = query;
    loadWallpapers(true);
};

window.filterByGenre = function (genre) {
    // If clicking same tag, clear it (toggle)
    currentGenre = (currentGenre === genre) ? null : genre;

    // Update UI for tags (optional, if you have tag elements)
    const tags = document.querySelectorAll('[onclick*="filterByGenre"]');
    tags.forEach(tag => {
        const tagValue = tag.getAttribute('onclick').match(/'([^']+)'/)[1];
        if (tagValue === currentGenre) {
            tag.classList.add('bg-accent', 'text-black');
            tag.classList.remove('glass-pill');
        } else {
            tag.classList.remove('bg-accent', 'text-black');
            tag.classList.add('glass-pill');
        }
    });

    loadWallpapers(true);
};

// Add enter key listener for search input if it exists
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('community-search');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                searchCommunity(searchInput.value);
            }
        });
    }
});

// Scroll logic
window.addEventListener('scroll', () => {
    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 800) {
        loadWallpapers();
    }
});

// Init
loadWallpapers();
