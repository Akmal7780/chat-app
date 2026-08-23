// Per-folder unread counts shared between the horizontal pill tabs
// (SidebarHeader) and the vertical folder rail (FolderRail) so the two
// responsive layouts always agree on the numbers.
export function getFolderCounts(conversations) {
  const counts = { all: 0, private: 0, groups: 0, channels: 0, unread: 0 }

  for (const c of conversations) {
    const unread = c.unread_count || 0
    counts.all += unread
    if (c.type === "private") counts.private += unread
    else if (c.type === "group") counts.groups += unread
    else if (c.type === "channel") counts.channels += unread
    if (unread > 0) counts.unread += 1
  }

  return counts
}
