const ALLOWED_EMAIL_DOMAINS = ["novartis.com", "jelpus.com"] as const;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function getEmailDomain(email: string): string {
  const normalized = normalizeEmail(email);
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex === -1) return "";
  return normalized.slice(atIndex + 1);
}

export function isAllowedEmailDomain(email: string): boolean {
  const domain = getEmailDomain(email);
  return (ALLOWED_EMAIL_DOMAINS as readonly string[]).includes(domain);
}

export function getAllowedDomainsText(): string {
  return ALLOWED_EMAIL_DOMAINS.map((domain) => `@${domain}`).join(" y ");
}

export { ALLOWED_EMAIL_DOMAINS };
