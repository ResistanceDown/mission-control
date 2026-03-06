'use client'

import { useMissionControl } from '@/store'

export function UpdateBanner() {
  const {
    updateAvailable,
    updateDismissedVersion,
    dismissUpdate,
    openclawUpdateAvailable,
    openclawUpdateDismissedVersion,
    dismissOpenclawUpdate,
  } = useMissionControl()

  const showMissionControlUpdate = Boolean(
    updateAvailable && updateDismissedVersion !== updateAvailable.latestVersion
  )
  const showOpenclawUpdate = Boolean(
    openclawUpdateAvailable &&
    openclawUpdateDismissedVersion !== openclawUpdateAvailable.latestVersion
  )

  if (!showMissionControlUpdate && !showOpenclawUpdate) return null

  return (
    <div className="mx-4 mt-3 mb-0 space-y-2">
      {showMissionControlUpdate && updateAvailable && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
          <p className="flex-1 text-xs text-emerald-300">
            <span className="font-medium text-emerald-200">
              Mission Control update: v{updateAvailable.latestVersion}
            </span>
            {' — a newer version is available.'}
          </p>
          {updateAvailable.releaseUrl && (
            <a
              href={updateAvailable.releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-2xs font-medium text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded border border-emerald-500/20 hover:border-emerald-500/40 transition-colors"
            >
              View Release
            </a>
          )}
          <button
            onClick={() => dismissUpdate(updateAvailable.latestVersion)}
            className="shrink-0 text-emerald-400/60 hover:text-emerald-300 transition-colors"
            title="Dismiss"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      )}
      {showOpenclawUpdate && openclawUpdateAvailable && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
          <p className="flex-1 text-xs text-amber-300">
            <span className="font-medium text-amber-200">
              OpenClaw update: v{openclawUpdateAvailable.latestVersion}
            </span>
            {openclawUpdateAvailable.currentVersion
              ? ` (current v${openclawUpdateAvailable.currentVersion})`
              : ''}
            {' — run run_guarded_openclaw_update.sh --apply when ready.'}
          </p>
          <button
            onClick={() => dismissOpenclawUpdate(openclawUpdateAvailable.latestVersion)}
            className="shrink-0 text-amber-400/60 hover:text-amber-300 transition-colors"
            title="Dismiss"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
