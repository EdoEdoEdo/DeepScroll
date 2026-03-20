/**
 * Strip HTML tags from Guardian content.
 * trailText and standfirst often come with <p>, <strong>, <a> etc.
 */
export function stripHtml(html: string | undefined | null): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract a clean excerpt from bodyText (first N words).
 */
export function extractExcerpt(
  text: string | undefined | null,
  maxWords: number = 50
): string {
  if (!text) return "";
  const clean = stripHtml(text);
  const words = clean.split(/\s+/);
  const excerpt = words.slice(0, maxWords).join(" ");
  return words.length > maxWords ? `${excerpt}...` : excerpt;
}

/**
 * Format ISO date to human-readable "14 Mar 2007" style.
 */
export function formatGuardianDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/**
 * Truncate text to a max character length, cutting at word boundary.
 */
export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + "...";
}

/**
 * Extract the best available image URL from Guardian fields.
 *
 * Strategy:
 * 1. `main` field contains HTML with a higher-res <img> — extract src
 * 2. `thumbnail` URL can be upscaled by replacing width segment
 * 3. Raw `thumbnail` as fallback
 *
 * Guardian media URLs follow pattern:
 *   https://media.guim.co.uk/{hash}/{width}.jpg
 * We can request larger sizes by changing the width.
 */
export function extractBestImage(
  thumbnail: string | undefined | null,
  mainHtml: string | undefined | null
): string | null {
  // Try main field first — parse <img> src from HTML
  // IMPORTANT: only match <img> tags, not <iframe> or <source> (YouTube embeds etc.)
  if (mainHtml) {
    const imgMatch = mainHtml.match(/<img[^>]+src=["']([^"']+)["']/);
    if (imgMatch?.[1]) {
      const mainSrc = imgMatch[1];
      // Only use if it's an actual image URL (not a video embed)
      if (
        mainSrc.startsWith("http") &&
        !mainSrc.includes("youtube") &&
        !mainSrc.includes("vimeo") &&
        !mainSrc.includes("embed")
      ) {
        return mainSrc;
      }
    }
  }

  // Try to upscale thumbnail URL
  if (thumbnail) {
    return upscaleGuardianUrl(thumbnail);
  }

  return null;
}

/**
 * Upscale a Guardian media URL to ~1000px width.
 *
 * Guardian thumbnail URLs look like:
 *   https://media.guim.co.uk/abc123/500.jpg
 *   https://media.guim.co.uk/abc123/140.jpg
 *
 * We replace the width segment to request a larger version.
 * If the URL doesn't match the pattern, return as-is.
 */
function upscaleGuardianUrl(url: string): string {
  // Pattern: ends with /NNN.jpg or /NNNw.jpg etc
  const match = url.match(/^(https:\/\/media\.guim\.co\.uk\/.+\/)(\d+)(\.jpg|\.png|\.jpeg)$/i);
  if (match) {
    return `${match[1]}1000${match[3]}`;
  }

  // Alternative pattern: URL contains width parameter
  // e.g. ...?width=500 → ?width=1200
  if (url.includes("width=")) {
    return url.replace(/width=\d+/, "width=1200");
  }

  return url;
}
