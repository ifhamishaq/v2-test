import { fetchWallpapers, getCurrentUser, deleteWallpaper } from './supabase.js';
import { showToast } from './toast.js';

let historyItems = [];

async function loadHistory() {
    const grid = document.getElementById('history-grid');
    const noHistory = document.getElementById('no-history');
    const user = await getCurrentUser();

    grid.innerHTML = '<div class="col-span-full py-20 text-center animate-pulse text-white/20 uppercase tracking-[0.3em] font-black text-xs">Accessing Vault...</div>';

    if (user) {
        // Logged in: fetch from DB
        const { data, error } = await fetchWallpapers({ userId: user.id, limit: 100 });
        if (error) {
            console.error(error);
            showToast('Failed to load history', 'error');
            return;
        }
        historyItems = data || [];
    } else {
        // Guest: fetch from localStorage
        const local = JSON.parse(localStorage.getItem('wallpaper_history') || '[]');
        historyItems = local.map(item => ({
            id: item.timestamp, // Use timestamp as ID for guests
            image_url: item.url,
            thumbnail_url: item.url,
            prompt: item.prompt,
            genre: item.genre,
            style: item.style,
            is_guest: true
        }));
    }

    if (historyItems.length === 0) {
        grid.innerHTML = '';
        noHistory.classList.remove('hidden');
        return;
    }

    noHistory.classList.add('hidden');
    renderGrid(historyItems);
}

function renderGrid(items) {
    const grid = document.getElementById('history-grid');
    grid.innerHTML = '';

    items.forEach((item, idx) => {
        const card = document.createElement('div');
        card.className = 'masonry-item group relative cursor-pointer overflow-hidden rounded-[2rem] aspect-[9/16] animate-[fadeIn_0.5s_ease_out_forwards]';
        card.style.animationDelay = `${idx * 0.05}s`;
        card.onclick = () => openModal(item);

        card.innerHTML = `
            <img src="${item.thumbnail_url || item.image_url}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110">
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all flex flex-col justify-end p-6">
                <span class="text-[9px] font-black uppercase text-accent tracking-[0.2em] mb-1">${item.genre || 'AI'}</span>
                <span class="text-xs font-bold truncate">${item.prompt || 'Untitled'}</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

window.openModal = function (item) {
    const modal = document.getElementById('history-modal');
    document.getElementById('modal-image').src = item.image_url;
    document.getElementById('modal-prompt').innerText = `"${item.prompt || 'No prompt info'}"`;
    document.getElementById('modal-title').innerText = item.genre + ' ' + item.style;

    document.getElementById('modal-download').onclick = () => window.open(item.image_url, '_blank');

    document.getElementById('modal-remix').onclick = () => {
        const params = new URLSearchParams({
            remix: 'true',
            genre: item.genre || '',
            style: item.style || '',
            prompt: item.prompt || '',
            seed: item.seed || ''
        });
        window.location.href = `index.html?${params.toString()}`;
    };

    document.getElementById('modal-delete').onclick = async () => {
        if (!confirm('Delete this from your vault forever?')) return;

        if (item.is_guest) {
            let local = JSON.parse(localStorage.getItem('wallpaper_history') || '[]');
            local = local.filter(i => i.timestamp !== item.id);
            localStorage.setItem('wallpaper_history', JSON.stringify(local));
            showToast('Deleted from local storage', 'success');
        } else {
            const { error } = await deleteWallpaper(item.id);
            if (error) showToast('Delete failed', 'error');
            else showToast('Removed from vault', 'success');
        }

        closeModal();
        loadHistory();
    };

    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

window.closeModal = function () {
    const modal = document.getElementById('history-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
};

// Bind to window for global access
window.closeModal = closeModal;

loadHistory();
