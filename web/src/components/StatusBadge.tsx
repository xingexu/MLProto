import type { Status } from "@/lib/api";

export const STATUS_LABEL: Record<Status, string> = {
  IN_FORCE: "In force",
  GRANDFATHERED: "Grandfathered",
  NOT_YET_EFFECTIVE: "Not yet effective",
  DRAFT: "Draft",
  SUPERSEDED: "Superseded",
  NOT_PUBLISHED: "Not yet published",
  NONE: "No rule found",
};

export const STATUS_HELP: Record<Status, string> = {
  IN_FORCE: "This version applies on the selected date.",
  GRANDFATHERED: "Replaced in general, but still usable for this situation.",
  NOT_YET_EFFECTIVE: "Final text published, but its effective date is still ahead.",
  DRAFT: "A consultation draft. Drafts are never in force.",
  SUPERSEDED: "Replaced by a later version that is now in force.",
  NOT_PUBLISHED: "This document did not exist yet on the selected date.",
  NONE: "No version of this requirement applies on the selected date.",
};

export function StatusBadge({ status, size = "md" }: { status: Status; size?: "sm" | "md" }) {
  return (
    <span className={`badge badge-${status.toLowerCase()} badge-${size}`} title={STATUS_HELP[status]}>
      {STATUS_LABEL[status]}
    </span>
  );
}
