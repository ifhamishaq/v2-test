export default async (request, context) => {
    // Only allow POST requests
    if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
    }

    try {
        const apiKeys = getApiKeys();

        if (apiKeys.length === 0) {
            return new Response(JSON.stringify({ error: "No API keys configured" }), {
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }

        const body = await request.json();
        let lastError = null;
        let lastStatus = 500;

        // Loop through keys
        for (const apiKey of apiKeys) {
            try {
                const response = await fetch("https://gateway.pixazo.ai/flux-1-schnell/v1/getData", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Ocp-Apim-Subscription-Key": apiKey,
                        "Cache-Control": "no-cache",
                        
                        // --- CLOUDFLARE BYPASS HEADERS ---
                        // Mimic a real Chrome browser on Windows
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Accept": "application/json, text/plain, */*",
                        "Accept-Language": "en-US,en;q=0.9",
                        "Origin": "https://pixazo.ai",
                        "Referer": "https://pixazo.ai/"
                        // ---------------------------------
                    },
                    body: JSON.stringify(body)
                });

                if (response.ok) {
                    const data = await response.json();
                    return new Response(JSON.stringify(data), {
                        status: 200,
                        headers: { 
                            "Content-Type": "application/json",
                            "Access-Control-Allow-Origin": "*" // Enable CORS
                        }
                    });
                }

                lastStatus = response.status;
                const errorText = await response.text();
                
                // Log the specific error to Netlify logs
                console.warn(`Key ending in ...${apiKey.slice(-4)} failed. Status: ${response.status}. Response: ${errorText.substring(0, 200)}`);
                
                // If Cloudflare blocked us (HTML response), store a generic error to avoid JSON parse issues on frontend
                if (errorText.includes("<!DOCTYPE html>")) {
                    lastError = "Blocked by upstream firewall (Cloudflare)";
                } else {
                    lastError = errorText;
                }

                // Optimization: If client error (400), retrying won't help
                if (response.status === 400) break;

            } catch (error) {
                lastError = error.message;
                console.warn(`Network error with key ending in ...${apiKey.slice(-4)}`);
            }
        }

        // All keys failed
        return new Response(JSON.stringify({ error: "Generation failed", details: lastError }), {
            status: lastStatus,
            headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*" 
            }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};

function getApiKeys() {
    const keys = [];
    const primary = Netlify.env.get("PIXAZO_API_KEY");
    if (primary) keys.push(primary);

    for (let i = 2; i <= 10; i++) {
        const key = Netlify.env.get(`PIXAZO_API_KEY_${i}`);
        if (key) keys.push(key);
    }
    return keys;
}
