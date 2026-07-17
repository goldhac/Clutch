/**
 * Trust primitives — the visual language of the moat.
 *
 * These four components appear next to every ranked item in the sheet
 * AND across the app (rails, results header, marketing "how it works"
 * blocks). Import from here rather than the individual files so future
 * refactors are cheap.
 */
export { ConfDot, type ConfDotProps } from "./ConfDot";
export { VerifiedStar, type VerifiedStarProps } from "./VerifiedStar";
export { Citation, type CitationProps } from "./Citation";
export { InlineText, type InlineTextProps } from "./InlineText";
