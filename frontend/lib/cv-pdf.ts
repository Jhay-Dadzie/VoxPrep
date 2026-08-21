import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { buildCvHtml } from './cv-html'
import type { TailoredCvDocument } from '@/types/cv'

/**
 * Turning a tailored CV into a file the candidate can actually keep.
 *
 * The PDF is rendered on the device rather than on the server: the document is
 * already in hand by the time this runs, and printing it here means the file
 * never makes a second round trip and needs no authenticated download URL.
 * The page itself is built in cv-html.ts.
 *
 * "Download" means different things on the two platforms, and this module says
 * so rather than pretending otherwise:
 *
 *   Android has a real, user-visible file system. A share sheet there is the
 *   wrong gesture — it asks "which app do you want to send this to?" when the
 *   candidate asked to keep a file. So the file is written straight into a
 *   folder they pick (Downloads, by default) through the Storage Access
 *   Framework, and the choice is remembered so the second download is silent.
 *
 *   iOS has no user-visible Downloads folder, and the share sheet IS the save
 *   mechanism: "Save to Files" is where a document goes. There is no better
 *   gesture available, so that is what runs there.
 *
 * Sharing stays reachable on both, as an explicit action of its own.
 */

/** Where the candidate last chose to save. Android only; a SAF tree URI. */
const SAVE_DIRECTORY_KEY = 'voxprep.cv.save_directory'

export type CvDownloadResult =
  /** Written to a folder on the device. `folder` is a display name. */
  | { outcome: 'saved'; fileName: string; folder: string }
  /** Handed to the share sheet — the candidate chose where it went. */
  | { outcome: 'shared'; fileName: string }
  /** The candidate backed out of the folder picker. Not an error. */
  | { outcome: 'cancelled' }

/** "Ada Lovelace" → "Ada_Lovelace_CV" */
const fileStemFor = (document: TailoredCvDocument) => {
  const stem = (document.full_name || 'Tailored')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return `${stem || 'Tailored'}_CV`
}

/**
 * A SAF tree URI is opaque and percent-encoded
 * (`content://…/tree/primary%3ADownload`). The tail after the volume is the
 * folder the user actually picked, which is the only part worth showing them.
 */
const folderLabelFrom = (treeUri: string): string => {
  try {
    const decoded = decodeURIComponent(treeUri)
    const path = decoded.split('/tree/').pop() ?? decoded
    const name = path.split(':').pop()?.split('/').filter(Boolean).pop()
    return name || 'your device'
  } catch {
    return 'your device'
  }
}

/**
 * The native modules, loaded on demand.
 *
 * Kept out of the route's module-evaluation path so Expo Router can still load
 * the screen in Expo Go, on web, or in a native build made before these
 * packages were added.
 */
const loadNativeModules = async () => {
  try {
    const [print, sharing, fileSystem] = await Promise.all([
      import('expo-print'),
      import('expo-sharing'),
      import('expo-file-system'),
    ])

    return {
      printToFileAsync: print.printToFileAsync,
      isAvailableAsync: sharing.isAvailableAsync,
      shareAsync: sharing.shareAsync,
      File: fileSystem.File,
      Paths: fileSystem.Paths,
    }
  } catch {
    throw new Error(
      'PDF export is unavailable in this app build. Rebuild the native app after installing expo-print.'
    )
  }
}

/**
 * The Storage Access Framework, which only the legacy entry point exposes.
 *
 * Android-only, and the reason the download is a download there rather than a
 * share: SAF is how an app writes into a folder the user chose, with a grant
 * that survives restarts.
 */
const loadStorageAccessFramework = async () => {
  const legacy = await import('expo-file-system/legacy')
  return legacy.StorageAccessFramework
}

type NativeModules = Awaited<ReturnType<typeof loadNativeModules>>

/** Render the CV and give the file the candidate's name before it leaves. */
const renderPdf = async (
  document: TailoredCvDocument,
  { printToFileAsync, File, Paths }: NativeModules
): Promise<{ uri: string; fileName: string }> => {
  const { uri } = await printToFileAsync({ html: buildCvHtml(document) })
  const fileName = `${fileStemFor(document)}.pdf`

  // printToFileAsync names the file from a random id, and on iOS that name is
  // what the candidate sees in Files. Renaming is cosmetic, so a failure here
  // must not cost them the download.
  try {
    const rendered = new File(uri)
    const target = new File(Paths.cache, fileName)
    if (target.exists) target.delete()
    rendered.move(target)
    return { uri: target.uri, fileName }
  } catch {
    return { uri, fileName }
  }
}

/**
 * Write the rendered PDF into a folder on the device (Android).
 *
 * The directory grant is remembered, so a candidate who downloads a second CV
 * is not asked to find Downloads again. A remembered grant can go stale —
 * revoked in settings, or an SD card that is no longer mounted — so a failed
 * write clears it and asks once more rather than surfacing an error the
 * candidate cannot interpret.
 */
const saveToPickedFolder = async (
  fileUri: string,
  fileName: string,
  { File }: NativeModules
): Promise<CvDownloadResult> => {
  const SAF = await loadStorageAccessFramework()
  const stem = fileName.replace(/\.pdf$/i, '')

  const writeInto = async (directoryUri: string) => {
    const target = await SAF.createFileAsync(directoryUri, stem, 'application/pdf')
    const base64 = await new File(fileUri).base64()
    await SAF.writeAsStringAsync(target, base64, { encoding: 'base64' })
  }

  const remembered = await AsyncStorage.getItem(SAVE_DIRECTORY_KEY)
  if (remembered) {
    try {
      await writeInto(remembered)
      return { outcome: 'saved', fileName, folder: folderLabelFrom(remembered) }
    } catch {
      await AsyncStorage.removeItem(SAVE_DIRECTORY_KEY).catch(() => {})
    }
  }

  // Opens the picker at Downloads, which is where someone who tapped
  // "Download" is expecting the file to land.
  const permission = await SAF.requestDirectoryPermissionsAsync(
    SAF.getUriForDirectoryInRoot('Download')
  )

  if (!permission.granted) return { outcome: 'cancelled' }

  await writeInto(permission.directoryUri)
  await AsyncStorage.setItem(SAVE_DIRECTORY_KEY, permission.directoryUri).catch(() => {})

  return { outcome: 'saved', fileName, folder: folderLabelFrom(permission.directoryUri) }
}

/**
 * Save the tailored CV to the device.
 *
 * Android writes the file into a folder the candidate picks; iOS opens the
 * share sheet, where "Save to Files" is the platform's own save.
 *
 * @throws when the PDF cannot be rendered, or when neither path is available
 */
export const downloadTailoredCv = async (
  document: TailoredCvDocument
): Promise<CvDownloadResult> => {
  const native = await loadNativeModules()
  const { uri, fileName } = await renderPdf(document, native)

  if (Platform.OS === 'android') {
    return saveToPickedFolder(uri, fileName, native)
  }

  if (!(await native.isAvailableAsync())) {
    throw new Error('Saving is not available on this device.')
  }

  await native.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'Save your tailored CV',
  })

  return { outcome: 'shared', fileName }
}

/**
 * Send the tailored CV somewhere else — email, WhatsApp, Drive.
 *
 * A separate action from downloading, because they are separate intents. On
 * Android especially, a candidate who wants the file on their phone and a
 * candidate who wants it in a recruiter's inbox should not be handed the same
 * dialog and left to work out which one they got.
 *
 * @throws when sharing is unavailable on this device
 */
export const shareTailoredCv = async (
  document: TailoredCvDocument
): Promise<CvDownloadResult> => {
  const native = await loadNativeModules()
  const { uri, fileName } = await renderPdf(document, native)

  if (!(await native.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.')
  }

  await native.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'Share your tailored CV',
  })

  return { outcome: 'shared', fileName }
}
