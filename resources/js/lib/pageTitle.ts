let base = 'Taskly';
let unread = 0;

function apply() {
    document.title = unread > 0 ? `(${unread}) ${base}` : base;
}

/** Sets the page title for the current route; keeps the unread-reminder badge in front. */
export function setPageTitle(title?: string) {
    base = title ? `${title} · Taskly` : 'Taskly';
    apply();
}

/** Shows the unread reminder count in the browser tab, e.g. "(2) Tasks · Taskly". */
export function setUnreadBadge(count: number) {
    unread = count;
    apply();
}
