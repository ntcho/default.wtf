// ==UserScript==
// @name         Google Account Switcher
// @namespace    http://tampermonkey.net/
// @version      1.0.3
// @description  Switch Google accounts using Option + 1-9 on macOS.
// @author       You
// @match        *://*.google.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  // Cooldown to prevent accidental rapid re-triggers
  let lastSwitchTime = 0;
  const DEBOUNCE_MS = 1000;

  /**
   * Checks if the current URL is an account switcher or sign-in flow.
   * While the script still runs on these pages, identifying them helps
   * maintain awareness of the current context.
   * * @param {string} urlStr
   * @returns {boolean}
   */
  function isAccountSwitcherUrl(urlStr) {
    const url = new URL(urlStr);
    const path = url.pathname.toLowerCase();

    if (url.hostname === 'accounts.google.com') {
      return true;
    }

    const switcherPatterns = [
      '/accounts/',
      '/accountchooser',
      '/signin',
      '/logout',
      '/servicelogin',
      '/listaccounts',
    ];

    return switcherPatterns.some((pattern) => path.includes(pattern));
  }

  /**
   * Determines the optimal URL for the target account index based on the service.
   * * @param {string} currentUrlStr
   * @param {number} targetIndex (0-based)
   * @returns {string|null} The new URL, or null if the current URL already matches the target.
   */
  function getTargetUrl(currentUrlStr, targetIndex) {
    const url = new URL(currentUrlStr);
    let path = url.pathname;

    // Check if the URL already explicitly targets the requested account index
    const currentUPathMatch = path.match(/\/u\/(\d+)/);
    const currentAuthUser = url.searchParams.get('authuser');

    const isTargetUPath =
      currentUPathMatch && parseInt(currentUPathMatch[1], 10) === targetIndex;
    const isTargetAuthUser = currentAuthUser === targetIndex.toString();

    // Prevent reloading if the url is already on the target user index
    if (isTargetUPath || isTargetAuthUser) {
      return null;
    }

    // Strategy 1: If the URL already contains a /u/{N} segment, replace it.
    if (currentUPathMatch) {
      url.pathname = path.replace(/\/u\/\d+/, `/u/${targetIndex}`);
      return url.toString();
    }

    // Strategy 2: For known services that rely on /u/{N} but might not have it in the current path.
    const uPathDomains = [
      'mail.google.com',
      'drive.google.com',
      'docs.google.com',
      'calendar.google.com',
      'keep.google.com',
      'photos.google.com',
      'contacts.google.com',
      'meet.google.com',
      'chat.google.com',
      'myaccount.google.com',
    ];

    if (uPathDomains.includes(url.hostname)) {
      // Explicit support for Google Docs /d/ URLs
      if (url.hostname === 'docs.google.com' && path.includes('/d/')) {
        url.pathname = path.replace('/d/', `/u/${targetIndex}/d/`);
        url.pathname = url.pathname.replace(/\/{2,}/g, '/');
        return url.toString();
      }

      const segments = path.split('/').filter(Boolean);

      if (url.hostname === 'myaccount.google.com' || segments.length === 0) {
        // E.g., myaccount.google.com/ -> myaccount.google.com/u/1/
        url.pathname = `/u/${targetIndex}${path.startsWith('/') ? path : '/' + path}`;
      } else {
        // E.g., mail.google.com/mail/ -> mail.google.com/mail/u/1/
        const firstSegment = segments[0];
        const restOfPath = segments.slice(1).join('/');
        url.pathname = `/${firstSegment}/u/${targetIndex}/${restOfPath}`;
      }

      // Clean up double slashes just in case
      url.pathname = url.pathname.replace(/\/{2,}/g, '/');
      return url.toString();
    }

    // Strategy 3: Fallback to setting the authuser query parameter.
    url.searchParams.set('authuser', targetIndex.toString());
    return url.toString();
  }

  /**
   * Handles keyboard events to intercept Option + Number.
   */
  function handleKeydown(event) {
    // Only trigger on Option (Alt) without other modifiers
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }

    // Check if the key pressed is a digit between 1 and 9
    // Using event.code is safer on macOS because Option+Number generates special characters
    if (!event.code.startsWith('Digit')) {
      return;
    }

    const digit = parseInt(event.code.replace('Digit', ''), 10);
    if (isNaN(digit) || digit < 1 || digit > 9) {
      return;
    }

    // Prevent switching if the user is typing in an input field (Option+Number inserts symbols on macOS)
    const activeEl = document.activeElement;
    if (
      activeEl &&
      (activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.isContentEditable)
    ) {
      return;
    }

    const now = Date.now();
    if (now - lastSwitchTime < DEBOUNCE_MS) {
      return; // Ignore rapid consecutive presses
    }

    const targetIndex = digit - 1; // 0-based index
    const targetUrl = getTargetUrl(location.href, targetIndex);

    if (targetUrl && targetUrl !== location.href) {
      event.preventDefault();
      event.stopPropagation();
      lastSwitchTime = now;

      // Use replace to avoid polluting the history stack
      location.replace(targetUrl);
    }
  }

  // Attach the event listener
  // Use capture phase to ensure it runs before other scripts stop propagation
  window.addEventListener('keydown', handleKeydown, true);
})();
