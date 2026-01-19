// Global helper for sharing history items
window.shareHistoryItem = function (item) {
    // Set the current wallpaper data from history
    window.currentWallpaperData = {
        imageUrl: item.url,
        genre: item.genre || 'Unknown',
        style: item.style || 'Unknown',
        prompt: item.prompt || '',
        seed: item.seed || null,
        width: item.width || 1920,
        height: item.height || 1080
    };

    // Call the share function
    if (typeof shareToCommunity === 'function') {
        shareToCommunity();
    } else {
        console.error('shareToCommunity function not found');
    }
};
