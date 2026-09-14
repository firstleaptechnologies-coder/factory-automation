'use client';

import { api } from './api';

/**
 * Open a server-rendered document in its own tab.
 *
 * Handing the browser the document's URL and letting it fetch the page itself
 * sends no session with it, so every one of these came back
 * `{"message":"Unauthorized","statusCode":401}` — the shop was thrown out of
 * the app into a blank tab holding an error. The document is fetched with the
 * session, like any other request, and written into the tab.
 *
 * The tab is opened first, before the await, because a browser only allows a
 * new window during the click that asked for it. Opening it afterwards is a
 * popup block, which looks to the user exactly like nothing happening.
 */
export async function openDocument(path: string): Promise<void> {
  const tab = window.open('', '_blank');

  let html: string;
  try {
    html = await api.fetchText(path);
  } catch (error) {
    tab?.close();
    throw error;
  }

  if (!tab) {
    // Blocked despite opening on the click — some browsers refuse regardless.
    // The document is already here, so hand it over as a file rather than
    // losing it.
    download(html, path);
    return;
  }

  tab.document.open();
  tab.document.write(html);
  tab.document.close();
}

/** The fallback when a tab cannot be opened: save it instead. */
function download(html: string, path: string) {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${path.split('/').filter(Boolean).join('-')}.html`;
  link.click();
  URL.revokeObjectURL(url);
}
