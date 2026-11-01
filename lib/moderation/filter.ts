// Regex-based content filter for chat messages
// Runs client-side for instant feedback before broadcast

const BLOCKED_PATTERNS: RegExp[] = [
  // Repeated characters (spam)
  /(.)\1{6,}/i,
  // Common spam URLs
  /(?:https?:\/\/)?(?:bit\.ly|tinyurl|discord\.gg\/\w+|t\.me\/)/i,
  // Excessive caps (more than 80% uppercase in messages > 10 chars)
];

const BLOCKED_WORDS: string[] = [
  // Add blocked words here — keeping this minimal for the template
  // You should customize this list for your community
];

export interface FilterResult {
  allowed: boolean;
  reason?: string;
}

export function filterMessage(content: string): FilterResult {
  const trimmed = content.trim();

  // Empty check
  if (trimmed.length === 0) {
    return { allowed: false, reason: "Message cannot be empty" };
  }

  // Length check
  if (trimmed.length > 500) {
    return { allowed: false, reason: "Message too long (max 500 characters)" };
  }

  // Blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { allowed: false, reason: "Message contains blocked content" };
    }
  }

  // Blocked words
  const lowerContent = trimmed.toLowerCase();
  for (const word of BLOCKED_WORDS) {
    if (lowerContent.includes(word.toLowerCase())) {
      return { allowed: false, reason: "Message contains blocked content" };
    }
  }

  // Excessive caps check (for messages longer than 10 chars)
  if (trimmed.length > 10) {
    const upperCount = (trimmed.match(/[A-Z]/g) || []).length;
    const letterCount = (trimmed.match(/[a-zA-Z]/g) || []).length;
    if (letterCount > 0 && upperCount / letterCount > 0.8) {
      return { allowed: false, reason: "Too many capital letters — calm down!" };
    }
  }

  return { allowed: true };
}
