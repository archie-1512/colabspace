export type Role = "OWNER" | "ADMIN" | "MEMBER";

const RANK: Record<Role, number> = { MEMBER: 0, ADMIN: 1, OWNER: 2 };

/** True if `role` has at least the authority of `minimum`. */
export function hasRole(role: Role, minimum: Role) {
  return RANK[role] >= RANK[minimum];
}

/**
 * Whether a member with `role` can see a card given its visibility setting
 * and whether they're one of its assignees. Admins and the owner always see
 * everything — visibility restrictions only apply to plain members.
 */
export function canViewCard(
  role: Role,
  cardVisibility: "ALL_MEMBERS" | "ASSIGNED_ONLY",
  isAssignee: boolean
) {
  if (hasRole(role, "ADMIN")) return true;
  if (cardVisibility === "ALL_MEMBERS") return true;
  return isAssignee;
}

/**
 * Same idea as canViewCard, but for whether a board even shows up for this
 * member — "ASSIGNED_ONLY" at the board level means "only visible to people
 * assigned to at least one card in it."
 */
export function canViewBoard(
  role: Role,
  boardVisibility: "ALL_MEMBERS" | "ASSIGNED_ONLY",
  isAssignedToAnyCard: boolean
) {
  if (hasRole(role, "ADMIN")) return true;
  if (boardVisibility === "ALL_MEMBERS") return true;
  return isAssignedToAnyCard;
}

export function canCreateCard(role: Role, memberCanCreateCards: boolean) {
  return hasRole(role, "ADMIN") || memberCanCreateCards;
}

export function canEditCard(role: Role, cardEditAccess: "ADMIN_ONLY" | "ALL_MEMBERS") {
  return hasRole(role, "ADMIN") || cardEditAccess === "ALL_MEMBERS";
}
