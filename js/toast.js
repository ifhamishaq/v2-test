// Masterpiece Toast System
export function showToast(message, type = 'info', duration = 3000) {
    // Remove existing toasts to prevent stacking (optional - could be enhanced to stack)
    const existingToasts = document.querySelectorAll('.toast');
    existingToasts.forEach(t => {
        t.classList.remove('show');
        setTimeout(() => t.remove(), 300);
    });

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const iconMap = {
        success: 'check_circle',
        error: 'error',
        info: 'info',
        warning: 'warning'
    };

    // Note: Using Material Symbols for consistency with the rest of the app
    toast.innerHTML = `
        <span class="material-symbols-outlined text-[20px]">${iconMap[type] || 'info'}</span>
        <span>${message}</span>
    `;

    document.body.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Auto-remove
    if (duration !== Infinity) {
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 500);
        }, duration);
    }

    return toast;
}

// Global hook if needed for non-module scripts
window.showToast = showToast;
