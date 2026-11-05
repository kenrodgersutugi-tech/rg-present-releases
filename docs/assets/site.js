/*
  Everything the pages share: the theme, the links to the latest build, and the
  few facts (version, date, size, checksum) that would otherwise have to be
  edited by hand on every release.

  Nothing here is required for the page to be useful. If the GitHub API cannot
  be reached — a church on a slow line, or a blocked network — the download
  links still work, because they point at `releases/latest/download/...`, which
  GitHub resolves on its own.
*/
;(function () {
  'use strict'

  // -------------------------------------------------------------- constants
  var SUPPORT_EMAIL = 'rgdev.ke@gmail.com'
  var STORE_URL = 'https://apps.microsoft.com/detail/9NQ687HLV0B2'
  var INSTALLER = 'RG-Present-Setup.exe'

  /**
   * Which repository is this page served from? Worked out from the URL, so
   * moving the repository to an organisation needs no edit here.
   *   kenrodgersutugi-tech.github.io/rg-present-releases/ -> owner/repo
   */
  function repository() {
    var host = window.location.hostname
    var segment = window.location.pathname.split('/').filter(Boolean)[0]
    if (/\.github\.io$/.test(host) && segment && !/\.html$/.test(segment)) {
      return { owner: host.replace(/\.github\.io$/, ''), repo: segment }
    }
    return { owner: 'kenrodgersutugi-tech', repo: 'rg-present-releases' }
  }

  var repo = repository()
  var base = 'https://github.com/' + repo.owner + '/' + repo.repo

  function each(selector, fn) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), fn)
  }

  // ------------------------------------------------------------------ links
  each('[data-link="installer"]', function (el) {
    el.href = base + '/releases/latest/download/' + INSTALLER
  })
  each('[data-link="releases"]', function (el) {
    el.href = base + '/releases'
  })
  each('[data-link="store"]', function (el) {
    el.href = STORE_URL
  })
  each('[data-link="email"]', function (el) {
    el.href = 'mailto:' + SUPPORT_EMAIL
    if (!el.textContent.trim() || el.textContent.trim() === '-') {
      el.textContent = SUPPORT_EMAIL
    }
  })
  each('[data-year]', function (el) {
    el.textContent = String(new Date().getFullYear())
  })

  // ------------------------------------------------------------------ theme
  var root = document.documentElement
  var toggle = document.getElementById('theme')

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme)
    if (toggle) toggle.textContent = theme === 'dark' ? 'Light' : 'Dark'
    each('[data-logo]', function (el) {
      el.src = el.getAttribute('data-logo-' + theme) || el.src
    })
    try {
      localStorage.setItem('rgp.site.theme', theme)
    } catch (e) {
      /* a theme we cannot remember is still a theme we can show */
    }
  }

  var stored = null
  try {
    stored = localStorage.getItem('rgp.site.theme')
  } catch (e) {
    /* private mode */
  }
  applyTheme(
    stored ||
      (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark')
  )

  if (toggle) {
    toggle.addEventListener('click', function () {
      applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark')
    })
  }

  // --------------------------------------------------------- latest release
  var wantsRelease = document.querySelector('[data-release]')
  if (!wantsRelease) return

  function fill(name, text) {
    each('[data-release="' + name + '"]', function (el) {
      el.textContent = text
    })
  }

  function megabytes(bytes) {
    return (bytes / 1048576).toFixed(0) + ' MB'
  }

  function britishDate(iso) {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }

  // `releases/latest` leaves out drafts and pre-releases, so this page only
  // ever offers a published stable build.
  fetch('https://api.github.com/repos/' + repo.owner + '/' + repo.repo + '/releases/latest', {
    headers: { Accept: 'application/vnd.github+json' }
  })
    .then(function (response) {
      if (!response.ok) throw new Error(String(response.status))
      return response.json()
    })
    .then(function (release) {
      if (!release || !release.tag_name) throw new Error('no release')
      var version = release.tag_name.replace(/^v/, '')
      fill('version', version)
      fill('summary', 'Version ' + version + ' · Windows 10/11, 64-bit')

      if (release.published_at) {
        fill('date', britishDate(release.published_at))
        fill(
          'summary',
          'Version ' +
            version +
            ' · released ' +
            britishDate(release.published_at) +
            ' · Windows 10/11, 64-bit'
        )
      }

      var exe = (release.assets || []).filter(function (asset) {
        return asset.name === INSTALLER
      })[0]
      if (exe) {
        fill('size', megabytes(exe.size))
        if (exe.digest) fill('sha256', String(exe.digest).replace(/^sha256:/, ''))
      }
    })
    .catch(function () {
      fill('summary', 'Latest version for Windows 10/11, 64-bit.')
      each('[data-release-row]', function (el) {
        el.hidden = true
      })
    })
})()
