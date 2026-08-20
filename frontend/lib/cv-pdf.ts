import { buildCvHtml } from './cv-html'
import type { TailoredCvDocument } from '@/types/cv'

/**
 * Turning a tailored CV into a file the candidate can actually send to an
 * employer.
 *
 * The PDF is rendered on the device rather than on the server: the document is
 * already in hand by the time this runs, and printing it here means the file
 * never makes a second round trip and needs no authenticated download URL.
 *
 * The page itself is built in cv-html.ts.
 */

/** "Ada Lovelace" → "Ada_Lovelace_CV.pdf" */
const fileNameFor = (document: TailoredCvDocument) => {
  const stem = (document.full_name || 'Tailored')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return `${stem || 'Tailored'}_CV.pdf`
}

/**
 * Render the CV to a PDF and hand it to the system share sheet, which is where
 * "Save to Files", "Save to Drive" and "Email to myself" all live.
 *
 * @returns the local file:// URI of the rendered PDF
 * @throws when sharing is unavailable on this device
 */
export const downloadTailoredCv = async (document: TailoredCvDocument): Promise<string> => {
  // These packages contain native modules. Keep them out of the route's
  // module-evaluation path so Expo Router can still load the screen in Expo
  // Go, web, or a stale native build that does not include expo-print yet.
  let printToFileAsync: typeof import('expo-print').printToFileAsync
  let isAvailableAsync: typeof import('expo-sharing').isAvailableAsync
  let shareAsync: typeof import('expo-sharing').shareAsync
  let File: typeof import('expo-file-system').File
  let Paths: typeof import('expo-file-system').Paths

  try {
    const [print, sharing, fileSystem] = await Promise.all([
      import('expo-print'),
      import('expo-sharing'),
      import('expo-file-system'),
    ])
    printToFileAsync = print.printToFileAsync
    isAvailableAsync = sharing.isAvailableAsync
    shareAsync = sharing.shareAsync
    File = fileSystem.File
    Paths = fileSystem.Paths
  } catch {
    throw new Error(
      'PDF export is unavailable in this app build. Rebuild the native app after installing expo-print.'
    )
  }

  const { uri } = await printToFileAsync({ html: buildCvHtml(document) })

  // printToFileAsync names the file from a random id, and that name is what the
  // share sheet shows and what lands in the candidate's Files app. Renaming it
  // is cosmetic, so a failure here must not cost them the download.
  let shareUri = uri
  try {
    const rendered = new File(uri)
    const target = new File(Paths.cache, fileNameFor(document))
    if (target.exists) target.delete()
    rendered.move(target)
    shareUri = target.uri
  } catch {
    /* keep the generated name */
  }

  if (!(await isAvailableAsync())) {
    throw new Error('Sharing is not available on this device, so the CV could not be saved.')
  }

  await shareAsync(shareUri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'Save your tailored CV',
  })

  return shareUri
}
