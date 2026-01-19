// Redirect to the centralized share function in app.js
window.shareHistoryItem = function (item) {
    if (window.shareHistoryItemToCommunity) {
        window.shareHistoryItemToCommunity(item.timestamp);
    } else {
        console.error('Centralized share function not found. Verify app.js is loaded.');
        if (window.showToast) {
            window.showToast('Share feature is initializing...', 'info');
        } else {
            alert('Share feature not available. Please refresh.');
        }
    }
};
