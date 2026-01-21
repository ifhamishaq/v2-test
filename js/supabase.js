// =============================================
// SUPABASE CLIENT CONFIGURATION
// =============================================

// Import Supabase client from CDN
import { createClient as createSupabaseClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Initialize Supabase client
const SUPABASE_URL = 'https://zgbfhvqjehhxcutvrvfo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnYmZodnFqZWhoeGN1dHZydmZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2MDEzNTMsImV4cCI6MjA4NDE3NzM1M30.5c3STu_DwrBF8qzAwm_alO_6bZIF7_i3n9LF3R6N6hY';

export const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =============================================
// AUTHENTICATION HELPERS
// =============================================

// Sign up with email and password
export async function signUp(email, password, username) {
    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    username: username  // Stored in user metadata
                }
            }
        });

        if (error) throw error;

        // Database trigger will automatically create the profile!
        return { data, error: null };
    } catch (error) {
        console.error('Signup error:', error);
        return { data: null, error };
    }
}

// Sign in with email and password
export async function signIn(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Login error:', error);
        return { data: null, error };
    }
}

// Sign in with Google OAuth
export async function signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin
        }
    });
    return { data, error };
}

// Sign in with GitHub OAuth
export async function signInWithGitHub() {
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
            redirectTo: window.location.origin
        }
    });
    return { data, error };
}

// Sign out
export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (!error) {
        window.location.href = 'landing.html';
    }
    return { error };
}

// Get current user
export async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

// Get current session
export async function getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

// Update profile information
export async function updateProfile(updates) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error('User not authenticated');

        // Create the base payload
        const payload = { id: user.id, ...updates };

        // 1. Scrub invalid strings that might have leaked from metadata
        if (payload.username === 'null' || payload.username === 'undefined' || !payload.username) {
            delete payload.username;
        }

        // 2. If username is missing, we must find or forge one
        if (!payload.username) {
            // Priority A: Try existing DB record (most reliable)
            const { data: dbProfile } = await supabase
                .from('profiles')
                .select('username')
                .eq('id', user.id)
                .maybeSingle();

            if (dbProfile?.username && dbProfile.username !== 'null') {
                payload.username = dbProfile.username;
            } else {
                // Priority B: Forge from Auth Metadata/Email
                const fallbackCandidates = [
                    user.user_metadata?.username,
                    user.user_metadata?.user_name,
                    user.user_metadata?.full_name?.replace(/\s+/g, '_').toLowerCase(),
                    user.email?.split('@')[0],
                    `master_${user.id.substring(0, 6)}`
                ];

                payload.username = fallbackCandidates.find(c => c && c !== 'null' && c.toString().trim().length > 0) || `user_${Date.now().toString(36)}`;
            }
        }

        // 3. Final sanity check: Ensure display_name is also set if we're creating a profile
        if (!payload.display_name) {
            payload.display_name = payload.username;
        }

        console.log('%c[FINAL_CHECK] Payload before Upsert:', 'background: #222; color: #bada55', payload);

        const { data, error } = await supabase
            .from('profiles')
            .upsert(payload)
            .select()
            .single();

        if (error) {
            console.error('[DB_ERROR] Upsert failed:', error);
            throw error;
        }
        return { data, error: null };
    } catch (error) {
        console.error('[CRITICAL] Profile Update Failed:', error);
        return { data: null, error };
    }
}

// Upload avatar image
export async function uploadAvatar(file) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error('User not authenticated');

        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/avatar_${Date.now()}.${fileExt}`;
        const filePath = `avatars/${fileName}`;

        // 1. Upload to avatars bucket
        const { error: uploadError } = await supabase.storage
            .from('wallpapers') // Using wallpapers bucket with 'avatars/' prefix
            .upload(filePath, file, { upsert: true });

        if (uploadError) throw uploadError;

        // 2. Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('wallpapers')
            .getPublicUrl(filePath);

        // 3. Update profile with new avatar URL
        return await updateProfile({ avatar_url: publicUrl });
    } catch (error) {
        console.error('Upload avatar error:', error);
        return { data: null, error };
    }
}

// =============================================
// WALLPAPER OPERATIONS
// =============================================

// Upload wallpaper to community
export async function uploadWallpaper(imageBlob, metadata) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error('User not authenticated');

        // 1. Upload image to storage
        const fileName = `${user.id}/${Date.now()}_${metadata.title.replace(/\s+/g, '_')}.png`;
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('wallpapers')
            .upload(fileName, imageBlob, {
                contentType: 'image/png',
                cacheControl: '3600'
            });

        if (uploadError) throw uploadError;

        // 2. Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('wallpapers')
            .getPublicUrl(fileName);

        // 3. Create thumbnail (simplified - you might want to resize on server)
        const thumbnailUrl = publicUrl; // TODO: Generate actual thumbnail

        // 4. Insert into database
        const { data, error } = await supabase
            .from('wallpapers')
            .insert({
                user_id: user.id,
                title: metadata.title,
                description: metadata.description || '',
                image_url: publicUrl,
                thumbnail_url: thumbnailUrl,
                genre: metadata.genre,
                style: metadata.style,
                prompt: metadata.prompt,
                seed: metadata.seed,
                width: metadata.width || 1920,
                height: metadata.height || 1080,
                is_public: metadata.isPublic !== false
            })
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Upload error:', error);
        return { data: null, error };
    }
}

// Save wallpaper metadata without re-uploading (useful for external URLs or CORS issues)
export async function saveWallpaperRecord(metadata) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error('User not authenticated');

        const { data, error } = await supabase
            .from('wallpapers')
            .insert({
                user_id: user.id,
                title: metadata.title,
                description: metadata.description || '',
                image_url: metadata.imageUrl,
                thumbnail_url: metadata.imageUrl, // Fallback to same URL
                genre: metadata.genre,
                style: metadata.style,
                prompt: metadata.prompt,
                seed: metadata.seed,
                width: metadata.width || 1920,
                height: metadata.height || 1080,
                is_public: metadata.isPublic !== false
            })
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Save record error:', error);
        return { data: null, error };
    }
}

// Increment view count
export async function incrementViewCount(wallpaperId) {
    try {
        const { error } = await supabase.rpc('increment_view_count', {
            wallpaper_id: wallpaperId
        });
        if (error) throw error;
    } catch (error) {
        // Silent fail for analytics
        console.warn('Analytics error:', error);
    }
}

// Increment download count
export async function incrementDownloadCount(wallpaperId) {
    try {
        const { error } = await supabase.rpc('increment_download_count', {
            wallpaper_id: wallpaperId
        });
        if (error) throw error;
    } catch (error) {
        console.warn('Download counter error:', error);
    }
}

// Check if current user liked/saved a wallpaper
export async function checkUserInteractions(wallpaperId) {
    try {
        const user = await getCurrentUser();
        if (!user) return { liked: false, saved: false };

        const [likeRes, saveRes] = await Promise.all([
            supabase.from('likes').select('id').eq('user_id', user.id).eq('wallpaper_id', wallpaperId).maybeSingle(),
            supabase.from('saves').select('id').eq('user_id', user.id).eq('wallpaper_id', wallpaperId).maybeSingle()
        ]);

        return {
            liked: !!likeRes.data,
            saved: !!saveRes.data
        };
    } catch (e) {
        return { liked: false, saved: false };
    }
}

// Fetch community wallpapers
export async function fetchWallpapers(options = {}) {
    const {
        page = 0,
        limit = 20,
        orderBy = 'created_at',
        ascending = false,
        userId = null,
        searchQuery = null,
        genre = null,
        style = null,
        followedOnly = false
    } = options;

    let query = supabase
        .from('wallpapers')
        .select(`
            *,
            profiles (
                username,
                display_name,
                avatar_url
            )
        `);

    // Privacy Logic: Show public images OR user's own private images
    const user = await getCurrentUser();

    if (userId && user && user.id === userId) {
        // Fetching own images: show everything
        query = query.eq('user_id', userId);
    } else if (followedOnly && user) {
        // COMMUNITY SUPPORT: Fetch only from followed users
        const { data: followedCreators } = await supabase
            .from('follows')
            .select('following_id')
            .eq('follower_id', user.id);

        const followedIds = (followedCreators || []).map(f => f.following_id);
        if (followedIds.length > 0) {
            query = query.in('user_id', followedIds).eq('is_public', true);
        } else {
            // No followers, return empty
            return { data: [], error: null };
        }
    } else if (userId) {
        // Fetching someone else's: only public
        query = query.eq('user_id', userId).eq('is_public', true);
    } else {
        // Global feed: only public
        query = query.eq('is_public', true);
    }

    query = query.order(orderBy, { ascending })
        .range(page * limit, (page + 1) * limit - 1);

    if (genre) {
        query = query.eq('genre', genre);
    }

    if (style) {
        query = query.eq('style', style);
    }

    if (searchQuery) {
        // Simple search across title, prompt, and description
        query = query.or(`title.ilike.%${searchQuery}%,prompt.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
    }

    const { data, error } = await query;
    return { data, error };
}

// Delete wallpaper
export async function deleteWallpaper(wallpaperId) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error('User not authenticated');

        // Verify ownership (RLS should handle this, but extra check)
        const { data: wp, error: fetchError } = await supabase
            .from('wallpapers')
            .select('user_id, image_url')
            .eq('id', wallpaperId)
            .single();

        if (fetchError || !wp) throw new Error('Wallpaper not found');
        if (wp.user_id !== user.id) throw new Error('Not authorized to delete this wallpaper');

        // Optional: Delete from storage as well
        // const storagePath = wp.image_url.split('/wallpapers/')[1];
        // if (storagePath) await supabase.storage.from('wallpapers').remove([storagePath]);

        const { error } = await supabase
            .from('wallpapers')
            .delete()
            .eq('id', wallpaperId);

        if (error) throw error;
        return { error: null };
    } catch (error) {
        console.error('Delete wallpaper error:', error);
        return { error };
    }
}

// Like/unlike wallpaper
export async function toggleLike(wallpaperId) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error('User not authenticated');

        // Check if already liked
        const { data: existingLike } = await supabase
            .from('likes')
            .select('id')
            .eq('user_id', user.id)
            .eq('wallpaper_id', wallpaperId)
            .single();

        if (existingLike) {
            // Unlike
            const { error } = await supabase
                .from('likes')
                .delete()
                .eq('id', existingLike.id);
            return { liked: false, error };
        } else {
            // Like
            const { error } = await supabase
                .from('likes')
                .insert({
                    user_id: user.id,
                    wallpaper_id: wallpaperId
                });
            return { liked: true, error };
        }
    } catch (error) {
        console.error('Toggle like error:', error);
        return { liked: false, error };
    }
}

// Save/unsave wallpaper to collection
export async function toggleSave(wallpaperId) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error('User not authenticated');

        // Check if already saved
        const { data: existingSave } = await supabase
            .from('saves')
            .select('id')
            .eq('user_id', user.id)
            .eq('wallpaper_id', wallpaperId)
            .single();

        if (existingSave) {
            // Unsave
            const { error } = await supabase
                .from('saves')
                .delete()
                .eq('id', existingSave.id);
            return { saved: false, error };
        } else {
            // Save
            const { error } = await supabase
                .from('saves')
                .insert({
                    user_id: user.id,
                    wallpaper_id: wallpaperId
                });
            return { saved: true, error };
        }
    } catch (error) {
        console.error('Toggle save error:', error);
        return { saved: false, error };
    }
}

// Add comment
export async function addComment(wallpaperId, content) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error('User not authenticated');

        const { data, error } = await supabase
            .from('comments')
            .insert({
                user_id: user.id,
                wallpaper_id: wallpaperId,
                content: content
            })
            .select(`
                *,
                profiles (
                    username,
                    display_name,
                    avatar_url
                )
            `)
            .single();

        return { data, error };
    } catch (error) {
        console.error('Comment error:', error);
        return { data: null, error };
    }
}

// Fetch comments for a wallpaper
export async function fetchComments(wallpaperId) {
    const { data, error } = await supabase
        .from('comments')
        .select(`
            *,
            profiles (
                username,
                display_name,
                avatar_url
            )
        `)
        .eq('wallpaper_id', wallpaperId)
        .order('created_at', { ascending: true });

    return { data, error };
}

// =============================================
// SOCIAL & NOTIFICATIONS
// =============================================

// Toggle Follow User
export async function toggleFollow(targetUserId) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error('User not authenticated');
        if (user.id === targetUserId) throw new Error('Cannot follow yourself');

        // Check if already following
        const { data: existing } = await supabase
            .from('follows')
            .select('id')
            .eq('follower_id', user.id)
            .eq('following_id', targetUserId)
            .single();

        if (existing) {
            // Unfollow
            const { error } = await supabase
                .from('follows')
                .delete()
                .eq('id', existing.id);
            return { following: false, error };
        } else {
            // Follow
            const { error } = await supabase
                .from('follows')
                .insert({
                    follower_id: user.id,
                    following_id: targetUserId
                });
            return { following: true, error };
        }
    } catch (error) {
        console.error('Toggle follow error:', error);
        return { following: false, error };
    }
}

// Check Follow Status
export async function checkFollowStatus(targetUserId) {
    try {
        const user = await getCurrentUser();
        if (!user) return { following: false };

        const { data } = await supabase
            .from('follows')
            .select('id')
            .eq('follower_id', user.id)
            .eq('following_id', targetUserId)
            .single();

        return { following: !!data };
    } catch (error) {
        return { following: false };
    }
}

// Fetch Notifications
export async function fetchNotifications() {
    try {
        const user = await getCurrentUser();
        if (!user) return { data: [], error: 'Not authenticated' };

        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20);

        return { data, error };
    } catch (error) {
        console.error('Fetch notifications error:', error);
        return { data: [], error };
    }
}

// Mark Notification Read
export async function markNotificationRead(notificationId) {
    const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);
    return { error };
}

// Fetch Public User Profile
export async function fetchPublicProfile(username) {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username)
        .single();
    return { data, error };
}

// Fetch user stats (creations, views, followers)
export async function fetchUserStats(userId) {
    try {
        // Creations and View counts from wallpapers table
        const { data: wpData } = await supabase
            .from('wallpapers')
            .select('views_count')
            .eq('user_id', userId)
            .eq('is_public', true);

        const creationsCount = wpData?.length || 0;
        const totalViews = wpData?.reduce((sum, wp) => sum + (wp.views_count || 0), 0) || 0;

        // Followers count from follows table
        const { count: followersCount } = await supabase
            .from('follows')
            .select('*', { count: 'exact', head: true })
            .eq('following_id', userId);

        return {
            data: {
                creationsCount,
                totalViews,
                followersCount: followersCount || 0
            },
            error: null
        };
    } catch (error) {
        console.error('Fetch user stats error:', error);
        return { data: null, error };
    }
}

// =============================================
// REALTIME SUBSCRIPTIONS
// =============================================

// Subscribe to new wallpapers
export function subscribeToWallpapers(callback) {
    const channel = supabase
        .channel('wallpapers-channel')
        .on('postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'wallpapers',
                filter: 'is_public=eq.true'
            },
            (payload) => {
                callback(payload.new);
            }
        )
        .subscribe();

    return channel;
}

// Unsubscribe from channel
export function unsubscribe(channel) {
    supabase.removeChannel(channel);
}

// =============================================
// AUTH STATE LISTENER
// =============================================

// Listen to auth state changes
export function onAuthStateChange(callback) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        callback(event, session);
    });

    return subscription;
}
